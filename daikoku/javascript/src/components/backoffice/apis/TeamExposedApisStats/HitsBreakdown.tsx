import { eachDayOfInterval, startOfDay, subMilliseconds } from 'date-fns';
import groupBy from 'lodash/groupBy';
import orderBy from 'lodash/orderBy';
import sumBy from 'lodash/sumBy';
import { useContext } from 'react';

import { I18nContext } from '../../../../contexts';
import { DailyHitsBars, DayHits } from './DailyHitsBars';
import { HitsBars } from './HitsBars';

export type ConsumptionHits = {
  apiName: string;
  plan: string;
  teamName: string;
  hits: number;
  from: number;
};

type HitsBreakdownProps = {
  consumptions: Array<ConsumptionHits>;
  from: Date;
  to: Date;
};

type HitsRow = {
  name: string;
  hits: number;
};

const sumHitsBy = (
  consumptions: Array<ConsumptionHits>,
  nameOfConsumption: (consumption: ConsumptionHits) => string
): Array<HitsRow> => {
  const consumptionsByName = groupBy(consumptions, nameOfConsumption);

  const rows = Object.entries(consumptionsByName).map(([name, consumptionsOfName]) => ({
    name,
    hits: sumBy(consumptionsOfName, 'hits'),
  }));

  return orderBy(rows, 'hits', 'desc');
};

const sumHitsByDay = (
  consumptions: Array<ConsumptionHits>,
  from: Date,
  to: Date
): Array<DayHits> => {
  const consumptionsByDay = groupBy(consumptions, (consumption) =>
    startOfDay(consumption.from).getTime()
  );

  const daysOfPeriod = eachDayOfInterval({
    start: from,
    end: subMilliseconds(to, 1),
  });

  return daysOfPeriod.map((day) => ({
    day: day.getTime(),
    hits: sumBy(consumptionsByDay[day.getTime()], 'hits'),
  }));
};

export const HitsBreakdown = ({ consumptions, from, to }: HitsBreakdownProps) => {
  const { translate } = useContext(I18nContext);

  const totalHits = sumBy(consumptions, 'hits');

  if (totalHits === 0) {
    return <div className="alert alert-info">{translate('stats.hits.empty')}</div>;
  }

  const hitsByDay = sumHitsByDay(consumptions, from, to);
  const hitsByApi = sumHitsBy(consumptions, (c) => c.apiName);
  const hitsByPlan = sumHitsBy(consumptions, (c) => `${c.apiName} · ${c.plan}`);
  const hitsByTeam = sumHitsBy(consumptions, (c) => c.teamName);

  const spansSeveralDays = hitsByDay.length > 1;

  return (
    <div className="hits-breakdown">
      <div className="billing-kpis">
        <div className="billing-kpi section">
          <span className="billing-kpi__label">{translate('stats.hits.total')}</span>
          <span className="billing-kpi__value">{totalHits.toLocaleString()}</span>
        </div>
      </div>

      {spansSeveralDays && (
        <div className="section p-3 mt-4">
          <DailyHitsBars days={hitsByDay} />
        </div>
      )}

      <div className="section p-3 mt-4">
        <HitsBars title={translate('stats.hits.by.api')} rows={hitsByApi} />
      </div>

      <div className="section p-3 mt-4">
        <HitsBars title={translate('stats.hits.by.plan')} rows={hitsByPlan} />
      </div>

      <div className="section p-3 mt-4">
        <HitsBars title={translate('stats.hits.by.team')} rows={hitsByTeam} />
      </div>
    </div>
  );
};
