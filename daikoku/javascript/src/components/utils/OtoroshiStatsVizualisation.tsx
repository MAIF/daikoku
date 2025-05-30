import classNames from 'classnames';
import { addDays, endOfMonth, isEqual, startOfDay, startOfMonth, startOfToday, subDays, subMonths } from 'date-fns';
import maxBy from 'lodash/maxBy';
import { useContext, useEffect, useState } from 'react';
import Select from 'react-select';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { I18nContext, TranslateParams } from '../../contexts';
import { IConsumption, isError, ResponseError } from '../../types';
import { IgqlConsumption } from '../backoffice/apis/TeamApiConsumption';
import { Histogram, RoundChart } from './Recharts';
import { Spinner } from './Spinner';
import { formatDate } from './formatters';

(Number.prototype as any).prettify = function () {
  return toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '');
};

class Period {
  from: Date;
  label: string;
  to: Date;
  unitTime: string;
  value: string;
  constructor({
    from,
    to,
    unitTime,
    label,
    value
  }: any) {
    this.from = from;
    this.to = to;
    this.unitTime = unitTime;
    this.label = label;
    this.value = value;
  }

  format = (consumptions: IgqlConsumption[], translate: (params: string | TranslateParams) => string) => {
    let time = '';
    if (consumptions && consumptions.length) { //FIXME: test it becaus eit's weird
      const maxDate = maxBy(consumptions, (o) => o.to)?.to;
      if (maxDate && isEqual(startOfDay(maxDate), startOfToday())) {
        time = formatDate(maxDate, translate('date.locale'),'HH:mm');
      }
    }

    if (this.unitTime === 'day') {
      if (this.value === 'TODAY') {
        return `${formatDate(this.from, translate('date.locale'), translate('date.format.short'))} ${time}`;
      }
      return formatDate(this.from, translate('date.locale'), translate('date.format.short'));
    }
    return `${formatDate(this.from, translate('date.locale'), translate('date.format.short'))} - ${formatDate(this.to, translate('date.locale'), translate('date.format.short')) }`;
  };
}

const now = new Date()
const periods = (translate: (params: string | TranslateParams) => string) => ({
  today: new Period({
    from: startOfDay(new Date()),
    to: startOfDay(addDays(new Date(), 1)),
    unitTime: 'day',
    label: translate('Today'),
    value: 'TODAY',
  }),

  yesterday: new Period({
    from: startOfDay(subDays(now, 1)),
    to: startOfDay(now),
    unitTime: 'day',
    label: translate('Yesterday'),
    value: 'YESTERDAY',
  }),

  last7days: new Period({
    from: startOfDay(subDays(now, 7)),
    to: now,
    unitTime: 'day',
    label: translate('Last 7 days'),
    value: 'LAST7',
  }),

  last30days: new Period({
    from: startOfDay(subMonths(now, 1)),
    to: now,
    unitTime: 'day',
    label: translate('Last 30 days'),
    value: 'LAST30',
  }),

  billingPeriod: new Period({
    from: startOfMonth(now),
    to: endOfMonth(now),
    unitTime: 'month',
    label: translate('Billing period'),
    value: 'BILLING',
  })
});
type IGlobalInformations= {
  avgDuration?: number,
  avgOverhead?: number,
  dataIn: number,
  dataOut: number,
  hits: number
}

type Iprops = {
  sync: () => Promise<Array<IConsumption> | ResponseError>
  fetchData: (from: Date, to: Date) => Promise<Array<IgqlConsumption> | ResponseError>
  mappers: any
  forConsumer?: boolean
}

type State = {
  tab: 0,
  consumptions: Array<IgqlConsumption>,
  period: Period,
  loading: boolean,
  error: boolean,
}
export function OtoroshiStatsVizualization(props: Iprops) {
  const { translate } = useContext(I18nContext);
  const [state, setState] = useState<State>({
    tab: 0,
    consumptions: [],
    period: { ...periods(translate).today },
    loading: true,
    error: false,
  });

  const getMaxCall = (unitTime: any, plan: any) => {
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

  const tabs = (value: any, label: any) => {
    const realLabel =
      label instanceof Function //@ts-ignore //FIXME: WEIRD
        ? label(state.consumptions, getMaxCall(state.period.unitTime, state.consumptions?.plan))
        : label;
    return (
      <a
        key={`tab-${value}`}
        className={classNames('data__navbar__tab', {
          'data__navbar__tab--active': state.tab === value,
        })}
        onClick={() => setState({ ...state, tab: value })}
      >
        {realLabel}
      </a>
    );
  };

  const formatValue = ({
    type,
    formatter,
    formatter2,
    title,
    xAxis,
    yAxis,
    dataKey,
    parentKey
  }: any) => {
    switch (type) {
      case 'Histogram':
        return <Histogram series={formatter(state.consumptions)} title={title} unit=" bytes" />;
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
                }}
              >
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
    updateConsumption(state.period.from, state.period.to);
  }, [state.period]);

  const updateConsumption = (from: Date, to: Date) => {
    setState({ ...state, loading: true });
    props
      .fetchData(from, to)
      .then((consumptions: any) => {
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
    setState({ ...state, loading: true });
    props
      .sync()
      .then(() => props.fetchData(from, to))
      .then((consumptions) => {
        if (isError(consumptions)) {
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
          isClearable={false}
          options={Object.values(periods(translate))} //@ts-ignore //FIXME: weird
          onChange={(period) => setState({ ...state, period })}
          classNamePrefix="reactSelect"
        />

        <span className="col ms-2 period-display">{state.period.format(state.consumptions, translate)}</span>
          <button className="btn btn-outline-primary" onClick={sync}>
            <i className="fas fa-sync-alt" />
          </button>

      </div>

      <div className="row mt-4">
        <div className="col">
          <div className="data-vizualisation">
            {state.loading && <Spinner />}
            {state.error && <div>Oops...</div>}
            {!state.loading &&
              !state.error && [
                <div key="navbar" className="data__navbar">
                  {props.mappers.map((tab: any, idx: any) => tabs(idx, tab.label))}
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

export function GlobalDataConsumption(props: any) {
  const { translate } = useContext(I18nContext);

  const units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const computeValue = (x: number): string => {
    if (!x) {
      return `0 ${units[0]}`;
    }

    let l = 0;

    while (x >= 1024 && ++l) {
      x = x / 1024;
    }

    return (x.toFixed(x < 10 && l > 0 ? 1 : 0) + ' ' + units[l]);
  }

  const row = (value: any, label: any) => {
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
  const hits = data.hits ? data.hits /*.prettify()*/ : 0;
  const totalDataIn = computeValue(data.dataIn);
  const totalDataOut = computeValue(data.dataOut);
  const avgDuration = data.avgDuration ? data.avgDuration.toFixed(3) : 0;
  const avgOverhead = data.avgOverhead ? data.avgOverhead.toFixed(3) : 0;

  return <>
    {row(hits, ' ' + translate({ key: 'Hit', plural: data.hits > 1 }))}
    {row(totalDataIn, ' ' + translate('in'))}
    {row(totalDataOut, ' ' + translate('out'))}
    {row(avgDuration, ' ' + translate('ms. average duration'))}
    {row(avgOverhead, ' ' + translate('ms. average overhead'))}
  </>
}
