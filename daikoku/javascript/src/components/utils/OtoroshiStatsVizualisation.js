import React, { useContext, useEffect, useState } from 'react';
import classNames from 'classnames';
import { Histogram, RoundChart } from './Recharts';
import { converterBase2 } from 'byte-converter';
import moment from 'moment';
import Select from 'react-select';
import _ from 'lodash';
import { Line, LineChart, Tooltip, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { Spinner } from './Spinner';
import { I18nContext } from '../../core';

Number.prototype.prettify = function () {
  return toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1 ');
};

class Period {
  constructor({ from, to, unitTime, label, value }) {
    this.from = from;
    this.to = to;
    this.unitTime = unitTime;
    this.label = label;
    this.value = value;
  }

  format = (consumptions) => {
    let time = '';
    if (consumptions && consumptions.length) {
      const maxDate = _.maxBy(consumptions, (o) => o.to);
      if (maxDate && moment(maxDate.to).startOf('day').isSame(moment().startOf('day'))) {
        time = moment(maxDate.to).format('HH:mm');
      }
    }

    if (this.unitTime === 'day') {
      if (this.value === 'TODAY') {
        return `${this.from.format('D MMM. YYYY')} ${time}`;
      }
      return `${this.from.format('D MMM. YYYY')}`;
    }
    return `${this.from.format('D MMM.')} - ${this.to().format('D MMM. YYYY')}`;
  };
}

const periods = (translateMethod) => ({
  today: new Period({
    from: moment().startOf('day'),
    to: () => moment().add(1, 'day').startOf('day'),
    unitTime: 'day',
    label: translateMethod('Today'),
    value: 'TODAY',
  }),
  yesterday: new Period({
    from: moment().subtract(1, 'day').startOf('day'),
    to: () => moment().startOf('day'),
    unitTime: 'day',
    label: translateMethod('Yesterday'),
    value: 'YESTERDAY',
  }),
  last7days: new Period({
    from: moment().subtract(7, 'days').startOf('day'),
    to: () => moment(),
    unitTime: 'day',
    label: translateMethod('Last 7 days'),
    value: 'LAST7',
  }),
  last30days: new Period({
    from: moment().subtract(30, 'days').startOf('day'),
    to: () => moment(),
    unitTime: 'day',
    label: translateMethod('Last 30 days'),
    value: 'LAST30',
  }),
  billingPeriod: new Period({
    from: moment().startOf('month'),
    to: () => moment().endOf('month'),
    unitTime: 'month',
    label: translateMethod('Billing period'),
    value: 'BILLING',
  }),
});

export function OtoroshiStatsVizualization(props) {

  const { translateMethod } = useContext(I18nContext);
  const [state, setState] = useState({
    tab: 0,
    consumptions: null,
    period: { ...periods(translateMethod).today },
    loading: true,
    error: false,
  });

  const getMaxCall = (unitTime, plan) => {
    if (!plan) {
      return undefined;
    }

    switch (unitTime) {
      case 'day':
        return plan.maxPerDay;
      case 'month':
        return plan.maxPerMonth;
      default:
        return undefined;
    }
  };

  const tabs = (value, label) => {
    const realLabel =
      label instanceof Function
        ? label(
          state.consumptions,
          getMaxCall(state.period.unitTime, state.consumptions.plan)
        )
        : label;
    return (
      <a
        key={`tab-${value}`}
        className={classNames('data__navbar__tab', {
          'data__navbar__tab--active': state.tab === value,
        })}
        onClick={() => setState({ ...state, tab: value })}>
        {realLabel}
      </a>
    );
  };

  const formatValue = ({ type, formatter, formatter2, title, xAxis, yAxis, dataKey, parentKey }) => {
    switch (type) {
      case 'Histogram':
        return (
          <Histogram series={formatter(state.consumptions)} title={title} unit=" bytes" />
        );
      case 'LineChart':
        return (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <LineChart
                data={formatter(state.consumptions)}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}>
                <XAxis dataKey={xAxis} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey={yAxis} stroke="#8884d8" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      case 'RoundChart':
        return (
          <RoundChart
            series={formatter(state.consumptions)}
            title={title}
            dataKey={dataKey}
            unit=" hits"
            size={200}
          />
        );
      case 'DoubleRoundChart':
        return (
          <RoundChart
            series={formatter(state.consumptions)}
            series2={formatter2(state.consumptions)}
            title={title}
            dataKey={dataKey}
            unit=" hits"
            parentKey={parentKey}
            size={170}
          />
        );
      case 'Global':
        return (
          <GlobalDataConsumption
            data={formatter ? formatter(state.consumptions) : state.consumptions}
          />
        );
      default:
        return formatter(state.consumptions);
    }
  };

  useEffect(() => {
    updateConsumption(state.period.from, state.period.to());
  }, [state.period]);

  const updateConsumption = (from, to) => {
    setState({ ...state, loading: true })
    props
      .fetchData(from, to)
      .then((consumptions) => {
        if (consumptions.error) {
          setState({ ...state, error: true, loading: false });
        } else {
          setState({ ...state, consumptions, loading: false });
        }
      })
      .catch(() => setState({ ...state, error: true, loading: false }));
  };

  const sync = () => {
    const { from, to } = state.period;
    setState({ ...state, loading: true })
    props
      .sync()
      .then(() => props.fetchData(from, to()))
      .then((consumptions) => {
        if (consumptions.error) {
          setState({ ...state, error: true, loading: false });
        } else {
          setState({ ...state, consumptions, loading: false });
        }
      })
      .catch(() => setState({ ...state, error: true, loading: false }));
  };

  return (
    <div>
      <div className="d-flex justify-content-start align-items-center">
        <Select
          name="period-select"
          className="col col-sm-3 reactSelect period-select"
          value={{ value: state.period.value, label: state.period.label }}
          clearable={false}
          options={Object.values(periods(translateMethod))}
          onChange={(period) => setState({ ...state, period })}
          classNamePrefix="reactSelect"
        />
        <span className="col period-display">
          {state.period.format(state.consumptions)}
        </span>
        {props.sync && (
          <button className="btn btn-access-negative" onClick={sync}>
            <i className="fas fa-sync-alt" />
          </button>
        )}
      </div>

      <div className="row mt-4">
        <div className="col">
          <div className="data-vizualisation">
            {state.loading && <Spinner />}
            {state.error && <div>Oops...</div>}
            {!state.loading &&
              !state.error && [
                <div key="navbar" className="data__navbar">
                  {props.mappers.map((tab, idx) => tabs(idx, tab.label))}
                </div>,
                <div key="content" className="data__content">
                  {formatValue(props.mappers[state.tab])}
                </div>,
              ]}
          </div>
        </div>
      </div>
    </div>
  );
}

export function GlobalDataConsumption(props) {
  const { translateMethod } = useContext(I18nContext);

  const computeValue = (value) => {
    let unit = 'Mb';
    let computedValue = parseFloat((converterBase2(value, 'B', 'MB') || 0).toFixed(3));
    if (computedValue > 1024.0) {
      computedValue = parseFloat((converterBase2(value, 'B', 'GB') || 0).toFixed(3));
      unit = 'Gb';
    }
    if (computedValue > 1024.0) {
      computedValue = parseFloat((converterBase2(value, 'B', 'TB') || 0).toFixed(3));
      unit = 'Tb';
    }
    if (computedValue > 1024.0) {
      computedValue = parseFloat((converterBase2(value, 'B', 'PB') || 0).toFixed(3));
      unit = 'Pb';
    }
    return `${computedValue ? computedValue.prettify() : 0} ${unit}`;
  };

  const row = (value, label) => {
    return (
      <div className="global-data__row" key={label}>
        <span>{value}</span>
        <span>{label}</span>
      </div>
    );
  };

  if (!props.data) {
    return null;
  }

  const { data } = props;
  const hits = data.hits ? data.hits.prettify() : 0;
  const totalDataIn = computeValue(data.dataIn);
  const totalDataOut = computeValue(data.dataOut);
  const avgDuration = data.avgDuration ? data.avgDuration.toFixed(3) : 0;
  const avgOverhead = data.avgOverhead ? data.avgOverhead.toFixed(3) : 0;

  return [
    row(hits, ' ' + translateMethod('Hit', data.hits > 1)),
    row(totalDataIn, ' ' + translateMethod('in')),
    row(totalDataOut, ' ' + translateMethod('out')),
    row(avgDuration, ' ' + translateMethod('ms. average duration')),
    row(avgOverhead, ' ' + translateMethod('ms. average overhead')),
  ];
}
