import React, { Component } from 'react';
import classNames from 'classnames';
import { Histogram, RoundChart } from './Recharts';
import { converterBase2 } from 'byte-converter';
import moment from 'moment';
import Select from 'react-select';
import { Line, LineChart, Tooltip, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { Spinner } from './Spinner';

Number.prototype.prettify = function() {
  return this.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1 ');
};

class Period {
  constructor({ from, to, unitTime, label, value }) {
    this.from = from;
    this.to = to;
    this.unitTime = unitTime;
    this.label = label;
    this.value = value;
  }

  format = consumptions => {
    let time = '';
    if (consumptions && consumptions.length) {
      const maxDate = _.maxBy(consumptions, o => o.to);
      if (
        maxDate &&
        moment(maxDate.to)
          .startOf('day')
          .isSame(moment().startOf('day'))
      ) {
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

const periods = {
  today: new Period({
    from: moment().startOf('day'),
    to: () =>
      moment()
        .add(1, 'day')
        .startOf('day'),
    unitTime: 'day',
    label: 'Today',
    value: 'TODAY',
  }),
  yesterday: new Period({
    from: moment()
      .subtract(1, 'day')
      .startOf('day'),
    to: () => moment().startOf('day'),
    unitTime: 'day',
    label: 'Yesterday',
    value: 'YESTERDAY',
  }),
  last7days: new Period({
    from: moment()
      .subtract(7, 'days')
      .startOf('day'),
    to: () => moment(),
    label: 'Last 7 days',
    value: 'LAST7',
  }),
  last30days: new Period({
    from: moment()
      .subtract(30, 'days')
      .startOf('day'),
    to: () => moment(),
    label: 'Last 30 days',
    value: 'LAST30',
  }),
  billingPeriod: new Period({
    from: moment().startOf('month'),
    to: () => moment().endOf('month'),
    unitTime: 'month',
    label: 'Billing period',
    value: 'BILLING',
  }),
};

export class OtoroshiStatsVizualization extends Component {
  state = {
    tab: 0,
    consumptions: null,
    period: { ...periods.today },
    loading: true,
    error: false,
  };

  getMaxCall = (unitTime, plan) => {
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

  tab = (value, label) => {
    const realLabel =
      label instanceof Function
        ? label(
            this.state.consumptions,
            this.getMaxCall(this.state.period.unitTime, this.state.consumptions.plan)
          )
        : label;
    return (
      <a
        key={`tab-${value}`}
        className={classNames('data__navbar__tab', {
          'data__navbar__tab--active': this.state.tab === value,
        })}
        onClick={() => this.setState({ tab: value })}>
        {realLabel}
      </a>
    );
  };

  formatValue = ({ type, formatter, formatter2, title, xAxis, yAxis, dataKey, parentKey }) => {
    switch (type) {
      case 'Histogram':
        return (
          <Histogram series={formatter(this.state.consumptions)} title={title} unit=" bytes" />
        );
      case 'LineChart':
        return (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <LineChart
                data={formatter(this.state.consumptions)}
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
            series={formatter(this.state.consumptions)}
            title={title}
            dataKey={dataKey}
            unit=" hits"
            size={200}
          />
        );
      case 'DoubleRoundChart':
        return (
          <RoundChart
            series={formatter(this.state.consumptions)}
            series2={formatter2(this.state.consumptions)}
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
            data={formatter ? formatter(this.state.consumptions) : this.state.consumptions}
          />
        );
      default:
        return formatter(this.state.consumptions);
    }
  };

  componentDidMount() {
    this.updateConsumption(this.state.period.from, this.state.period.to());
  }
  UNSAFE_componentWillReceiveProps() {
    this.updateConsumption(this.state.period.from, this.state.period.to());
  }

  updateConsumption = (from, to) => {
    this.setState({ loading: true }, () => {
      this.props
        .fetchData(from, to)
        .then(consumptions => {
          if (consumptions.error) {
            this.setState({ error: true, loading: false });
          } else {
            this.setState({ consumptions, loading: false });
          }
        })
        .catch(() => this.setState({ error: true, loading: false }));
    });
  };

  sync = () => {
    const { from, to } = this.state.period;
    this.setState({ loading: true }, () => {
      this.props
        .sync()
        .then(() => this.props.fetchData(from, to()))
        .then(consumptions => {
          if (consumptions.error) {
            this.setState({ error: true, loading: false });
          } else {
            this.setState({ consumptions, loading: false });
          }
        })
        .catch(() => this.setState({ error: true, loading: false }));
    });
  };

  render() {
    return (
      <div>
        <div className="d-flex justify-content-start align-items-center">
          <Select
            name="period-select"
            className="col col-sm-3 period-select"
            value={{ value: this.state.period.value, label: this.state.period.label }}
            clearable={false}
            options={Object.keys(periods).map(k => periods[k])}
            onChange={period => {
              this.setState({ period }, () => {
                this.updateConsumption(period.from, period.to());
              });
            }}
          />
          <span className="col period-display">
            {this.state.period.format(this.state.consumptions)}
          </span>
          {this.props.sync && (
            <button className="btn btn-access-negative" onClick={this.sync}>
              <i className="fas fa-sync-alt" />
            </button>
          )}
        </div>

        <div className="row mt-2">
          <div className="col">
            <div className="data-vizualisation">
              {this.state.loading && <Spinner />}
              {this.state.error && <div>Oops...</div>}
              {!this.state.loading &&
                !this.state.error && [
                  <div key="navbar" className="data__navbar">
                    {this.props.mappers.map((tab, idx) => this.tab(idx, tab.label))}
                  </div>,
                  <div key="content" className="data__content">
                    {this.formatValue(this.props.mappers[this.state.tab])}
                  </div>,
                ]}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export class GlobalDataConsumption extends Component {
  computeValue = value => {
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
    return `${computedValue.prettify()} ${unit}`;
  };

  row = (value, label) => {
    return (
      <div className="global-data__row" key={label}>
        <span>{value}</span>
        <span>{label}</span>
      </div>
    );
  };

  render() {
    if (!this.props.data) {
      return null;
    }

    const { data } = this.props;
    const hits = data.hits ? data.hits.prettify() : 0;
    const totalDataIn = this.computeValue(data.dataIn);
    const totalDataOut = this.computeValue(data.dataOut);
    const avgDuration = data.avgDuration ? data.avgDuration.toFixed(3) : 0;
    const avgOverhead = data.avgOverhead ? data.avgOverhead.toFixed(3) : 0;

    return [
      this.row(hits, ' hits'),
      this.row(totalDataIn, ' in'),
      this.row(totalDataOut, ' out'),
      this.row(avgDuration, ' ms. average duration'),
      this.row(avgOverhead, ' ms. average overhead'),
    ];
  }
}
