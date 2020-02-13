import React, { Component } from 'react';
import _ from 'lodash';
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

export class Histogram extends Component {
  colors = [
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

  formatTick = v => {
    if (v > 999999) {
      return (v / 1000000).toFixed(0) + ' M';
    }
    if (v > 999) {
      return (v / 1000).toFixed(0) + ' k';
    }
    return v;
  };

  render() {
    let data = [];
    let seriesName = [];

    // console.log(this.props.title, this.props.series);

    if (this.props.series && this.props.series[0]) {
      seriesName = this.props.series.map(s => s.name);
      const values = [];
      const size = this.props.series[0].data.length;
      for (let i = 0; i < size; i++) {
        let finalItem = {};
        this.props.series.forEach(serie => {
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
      <div
        style={{
          backgroundColor: '#fff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        <h4 className='recharts'>{this.props.title}</h4>
        <ResponsiveContainer height={this.props.height || 200}>
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <XAxis dataKey="name" />
            <YAxis tickFormatter={this.formatTick} />
            <CartesianGrid strokeDasharray="3 3" />
            <Tooltip />
            {_.sortBy(seriesName, sn => sn).map((sn, idx) => (
              <Area
                key={sn}
                type="monotone"
                name={sn}
                unit={this.props.unit}
                dataKey={sn}
                stroke={this.colors[idx]}
                fillOpacity={0.6}
                fill={this.colors[idx]}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }
}

export class RoundChart extends Component {
  colors = [
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

  renderCustomizedLabel = props => {
    const { x, y, cx } = props;
    return (
      <text
        x={x}
        y={y}
        fill="var(--section-text-color)"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        style={{ padding: 5 }}>
        {props.name.replace(/"/g, '')}: {(props.percent * 100).toFixed(0)}% ({props.value})
      </text>
    );
  };

  render() {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      className='recharts'>
        <h4 className='recharts'>{this.props.title}</h4>
        <ResponsiveContainer height={this.props.size ? this.props.size + 150 : 200}>
          <PieChart>
            <Pie
              data={this.props.series}
              fill="#8884d8"
              outerRadius={this.props.size ? this.props.size / 2 : 100}
              dataKey={this.props.dataKey || 'value'}
              label={!this.props.series2 && !this.props.noLabel && this.renderCustomizedLabel}>
              {this.props.series.map((entry, index) => (
                <Cell key={entry.name} fill={this.colors[index % this.colors.length]} />
              ))}
            </Pie>
            {this.props.series2 && (
              <Pie
                data={this.props.series2}
                fill="#8884d8"
                innerRadius={this.props.size ? this.props.size / 2 + 10 : 110}
                outerRadius={this.props.size ? this.props.size / 2 + 30 : 130}
                dataKey={this.props.dataKey || 'value'}
                label={this.renderCustomizedLabel}>
                {this.props.series2.map(entry => {
                  const parentIdx = [...new Set(this.props.series.map(item => item.name))].indexOf(
                    entry[this.props.parentKey]
                  );
                  return (
                    <Cell key={entry.name} fill={this.colors[parentIdx % this.colors.length]} />
                  );
                })}
              </Pie>
            )}
            <Tooltip />
            {this.props.legend && (
              <Legend verticalAlign="top" height={36} content={this.props.legend} />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }
}
