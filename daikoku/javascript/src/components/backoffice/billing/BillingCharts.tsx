import { format } from 'date-fns';
import { useContext } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelProps,
  ResponsiveContainer,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';

import { I18nContext } from '../../../contexts';
import { formatCurrency, getLanguageFns } from '../../utils';
import { BillingDay } from './billingSeries';

type BillingChartsProps = {
  days: Array<BillingDay>;
  currencySymbol: string;
};

const SYNC_ID = 'team-billing';
const CHART_MARGIN = { top: 8, right: 56, bottom: 0, left: 0 };

export const BillingCharts = ({ days, currencySymbol }: BillingChartsProps) => {
  const { translate, language } = useContext(I18nContext);

  const locale = getLanguageFns(language);
  const compact = new Intl.NumberFormat(language, { notation: 'compact' });
  const money = (value: number) => `${formatCurrency(value)} ${currencySymbol}`;

  const dayOfMonth = (day: number) => format(day, 'd');
  const fullDay = (day: number) => format(day, 'PPP', { locale });

  const lastIndex = days.findLastIndex((d) => d.bill !== null);

  const BillingTooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;

    const point = payload[0].payload as BillingDay;
    if (point.calls === null) return null;

    return (
      <div className="billing-chart__tooltip">
        <span className="billing-chart__tooltip-day">{fullDay(point.day)}</span>
        <span>
          <strong>{compact.format(point.calls)}</strong> {translate('billing.chart.calls')}
        </span>
        <span>
          <strong>{money(point.bill ?? 0)}</strong> {translate('billing.chart.bill')}
        </span>
      </div>
    );
  };

  const EndLabel = ({ x, y, index, value }: LabelProps) => {
    if (index !== lastIndex || typeof value !== 'number') return null;

    return (
      <text x={x} y={y} dx={8} dy={4} className="billing-chart__end-label">
        {money(value)}
      </text>
    );
  };

  return (
    <div className="billing-charts">
      <h3 className="billing-chart__title">{translate('billing.chart.calls.title')}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={days} syncId={SYNC_ID} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickFormatter={dayOfMonth} tickLine={false} className="billing-chart__axis" />
          <YAxis
            tickFormatter={(v) => compact.format(v)}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            width={48}
            className="billing-chart__axis"
          />
          <Tooltip content={BillingTooltip} />
          <Bar dataKey="calls" maxBarSize={24} radius={[4, 4, 0, 0]} className="billing-chart__bar" />
        </BarChart>
      </ResponsiveContainer>

      <h3 className="billing-chart__title">{translate('billing.chart.bill.title')}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={days} syncId={SYNC_ID} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickFormatter={dayOfMonth} tickLine={false} className="billing-chart__axis" />
          <YAxis
            tickFormatter={(v) => compact.format(v)}
            axisLine={false}
            tickLine={false}
            width={48}
            className="billing-chart__axis"
          />
          <Tooltip content={() => null} cursor={{ className: 'billing-chart__cursor--line' }} />
          <Area
            dataKey="bill"
            type="linear"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, className: 'billing-chart__dot' }}
            label={EndLabel}
            className="billing-chart__area"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
