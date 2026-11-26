import { format } from 'date-fns';
import { useContext } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';

import { I18nContext } from '../../../../contexts';
import { getLanguageFns } from '../../../utils';

export type DayHits = {
  day: number;
  hits: number;
};

const CHART_MARGIN = {
  top: 8,
  right: 16,
  bottom: 0,
  left: 0,
};

type DailyHitsBarsProps = {
  days: Array<DayHits>;
};

export const DailyHitsBars = ({ days }: DailyHitsBarsProps) => {
  const { translate, language } = useContext(I18nContext);

  const locale = getLanguageFns(language);
  const compact = new Intl.NumberFormat(language, { notation: 'compact' });

  const dayOfMonth = (day: number) => format(day, 'd');
  const fullDay = (day: number) => format(day, 'PPP', { locale });

  const DayHitsTooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload?.length) {
      return null;
    }

    const point = payload[0].payload as DayHits;

    return (
      <div className="billing-chart__tooltip">
        <span className="billing-chart__tooltip-day">{fullDay(point.day)}</span>
        <span>
          <strong>{compact.format(point.hits)}</strong> {translate('billing.chart.calls')}
        </span>
      </div>
    );
  };

  return (
    <div className="billing-charts">
      <h3 className="billing-chart__title">{translate('billing.chart.calls.title')}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={days} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={dayOfMonth}
            tickLine={false}
            className="billing-chart__axis"
          />
          <YAxis
            tickFormatter={(hits) => compact.format(hits)}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            width={48}
            className="billing-chart__axis"
          />
          <Tooltip content={DayHitsTooltip} />
          <Bar dataKey="hits" maxBarSize={24} radius={[4, 4, 0, 0]} className="billing-chart__bar" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
