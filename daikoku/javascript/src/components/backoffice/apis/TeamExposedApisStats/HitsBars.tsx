import { useContext } from 'react';
import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';

import { I18nContext } from '../../../../contexts';

const BAR_HEIGHT = 40;
const CHART_MARGIN = {
  top: 0,
  right: 64,
  bottom: 0,
  left: 0,
};

type HitsBarsProps = {
  title: string;
  rows: Array<{
    name: string;
    hits: number;
  }>;
};

export const HitsBars = ({ title, rows }: HitsBarsProps) => {
  const { language } = useContext(I18nContext);

  const compact = new Intl.NumberFormat(language, { notation: 'compact' });
  const chartHeight = rows.length * BAR_HEIGHT;

  return (
    <div className="billing-charts">
      <h3 className="billing-chart__title">{title}</h3>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={rows} layout="vertical" margin={CHART_MARGIN}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={200}
            axisLine={false}
            tickLine={false}
            className="billing-chart__axis"
          />
          <Bar dataKey="hits" maxBarSize={24} radius={[0, 4, 4, 0]} className="billing-chart__bar">
            <LabelList
              dataKey="hits"
              position="right"
              formatter={(hits) => compact.format(Number(hits))}
              className="billing-chart__end-label"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
