import React from 'react';
import sortBy from 'lodash/sortBy';
import moment from 'moment';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

export function Histogram(props: any) {
  const colors = [
    '#027cc3',
    '#95cf3d',
    '#ff8900',
    '#7cb5ec',
    '#8085c9',
    '#ffeb3b',
    '#8a2be2',
    '#deb887',
    '#d50200',
    '#a52a2a',
  ];

  const formatTick = (v: any) => {
    if (v > 999999) {
      return (v / 1000000).toFixed(0) + ' M';
    }
    if (v > 999) {
      return (v / 1000).toFixed(0) + ' k';
    }
    return v;
  };

  let data: any = [];
  let seriesName = [];

  // console.log(props.title, props.series);

  if (props.series && props.series[0]) {
    seriesName = props.series.map((s: any) => s.name);
    const values = [];
    const size = props.series[0].data.length;
    for (let i = 0; i < size; i++) {
      let finalItem = {};
      props.series.forEach((serie: any) => {
        const item = serie.data[i];
        if (item) {
          finalItem = {
            ...finalItem,
            ...{
              name: moment(item[0]).format('YYYY-MM-DD HH:mm'),
              [serie.name]: item[1],
            },
          };
        }
      });
      values.push(finalItem);
    }
    data = values;
  }

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div
      style={{
        backgroundColor: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <h4 className="recharts">{props.title}</h4>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <ResponsiveContainer height={props.height || 200}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <XAxis dataKey="name" />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <YAxis tickFormatter={formatTick} />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <CartesianGrid strokeDasharray="3 3" />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Tooltip />
          {sortBy(seriesName, (sn) => sn).map((sn, idx) => (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <Area
              key={sn}
              type="monotone"
              name={sn}
              unit={props.unit}
              dataKey={sn}
              stroke={colors[idx]}
              fillOpacity={0.6}
              fill={colors[idx]}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RoundChart(props: any) {
  const colors = [
    '#95cf3d',
    '#027cc3',
    '#ff8900',
    '#7cb5ec',
    '#8085c9',
    '#ffeb3b',
    '#8a2be2',
    '#deb887',
    '#d50200',
    '#a52a2a',
  ];

  const renderCustomizedLabel = (props: any) => {
    const { x, y, cx } = props;
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <text
        x={x}
        y={y}
        fill="var(--section-text-color)"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        style={{ padding: 5 }}
      >
        {props.name.replace(/"/g, '')}: {(props.percent * 100).toFixed(0)}% ({props.value})
      </text>
    );
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
      className="recharts"
    >
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <h4 className="recharts">{props.title}</h4>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <ResponsiveContainer height={props.size ? props.size + 150 : 200}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <PieChart>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Pie
            data={props.series}
            fill="#8884d8"
            outerRadius={props.size ? props.size / 2 : 100}
            dataKey={props.dataKey || 'value'}
            label={!props.series2 && !props.noLabel && renderCustomizedLabel}
          >
            {props.series.map((entry: any, index: any) => (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <Cell key={entry.name} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          {props.series2 && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <Pie
              data={props.series2}
              fill="#8884d8"
              innerRadius={props.size ? props.size / 2 + 10 : 110}
              outerRadius={props.size ? props.size / 2 + 30 : 130}
              dataKey={props.dataKey || 'value'}
              label={renderCustomizedLabel}
            >
              {props.series2.map((entry: any) => {
                const parentIdx = [...new Set(props.series.map((item: any) => item.name))].indexOf(
                  entry[props.parentKey]
                );
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return <Cell key={entry.name} fill={colors[parentIdx % colors.length]} />;
              })}
            </Pie>
          )}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Tooltip />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {props.legend && <Legend verticalAlign="top" height={36} content={props.legend} />}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
