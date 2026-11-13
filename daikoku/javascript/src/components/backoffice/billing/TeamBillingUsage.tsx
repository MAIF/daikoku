import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { endOfMonth, startOfMonth } from 'date-fns';
import maxBy from 'lodash/maxBy';
import sortBy from 'lodash/sortBy';
import sumBy from 'lodash/sumBy';
import uniqBy from 'lodash/uniqBy';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import Select from 'react-select';
import { toast } from 'sonner';

import { I18nContext, useTeamBackOffice } from '../../../contexts';
import * as Services from '../../../services';
import { ITeamSimple, ResponseError, isError } from '../../../types';
import { DynamicTable, DynamicTableFeatures } from '../../inputs';
import { MonthPicker } from '../../inputs/monthPicker';
import {
  Can,
  Spinner,
  formatCurrency,
  formatDate,
  getCurrencySymbol,
  read,
  stat
} from '../../utils';
import { FeedbackButton } from '../../utils/FeedbackButton';
import { BillingCharts } from './BillingCharts';
import { BillingConsumption, BillingDay, PlanBilling, billingByPlan, dailyBilling } from './billingSeries';

const CURRENCY_SYMBOL = getCurrencySymbol('EUR')!;

export const TeamBillingUsage = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice();

  const { translate, Translation } = useContext(I18nContext);

  const [selectedApi, setSelectedApi] = useState<string>();
  const [date, setDate] = useState(new Date());
  const [tab, setTab] = useState<'evolution' | 'days' | 'plans'>('evolution');

  const queryClient = useQueryClient();
  const teamId = (currentTeam as ITeamSimple | undefined)?._id;

  const consumptionsQuery = useQuery({
    queryKey: ['team-billing', teamId, date.getTime()],
    queryFn: (): Promise<Array<BillingConsumption> | ResponseError> =>
      Services.getTeamConsumptions(
        teamId,
        startOfMonth(date).getTime(),
        endOfMonth(date).getTime()
      ),
    enabled: currentTeam && !isError(currentTeam),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ${translate('billing.usage.title')}`;
  }, [currentTeam]);

  const data = consumptionsQuery.data;
  const all: Array<BillingConsumption> = Array.isArray(data) ? data : [];

  const apiOptions = sortBy(uniqBy(all, 'api'), 'apiName')
    .map((c) => ({ value: c.api, label: c.apiName }));
  const activeApi = apiOptions.some((o) => o.value === selectedApi) ? selectedApi : undefined;
  const consumptions = activeApi ? all.filter((c) => c.api === activeApi) : all;

  const sync = () =>
    Services.syncTeamBilling(teamId!)
      .then(() => queryClient.invalidateQueries({ queryKey: ['team-billing'] }));

  const money = (value: number) => `${formatCurrency(value)} ${CURRENCY_SYMBOL}`;

  const openInvoices = (row: PlanBilling) =>
    Services.fetchInvoices(teamId!, row.api, row.planId, window.location.href)
      .then((response) => {
        if (isError(response)) {
          toast.error(response.error);
        } else {
          window.location.href = response.url;
        }
      });

  const columnHelper = createColumnHelper<DynamicTableFeatures, PlanBilling>();
  const columns = [
    columnHelper.display({
      id: 'api',
      meta: { title: translate('billing.table.api'), size: 3 },
      cell: (info) => info.row.original.apiName,
    }),
    columnHelper.display({
      id: 'plan',
      meta: { title: translate('billing.table.plan'), size: 3 },
      cell: (info) => info.row.original.planName,
    }),
    columnHelper.display({
      id: 'calls',
      meta: { title: translate('billing.table.calls'), size: 2 },
      cell: (info) => info.row.original.calls,
    }),
    columnHelper.display({
      id: 'total',
      meta: { title: translate('billing.table.total'), size: 2 },
      cell: (info) => money(info.row.original.total),
    }),
    columnHelper.display({
      id: 'actions',
      meta: { size: 1 },
      cell: (info) => {
        const row = info.row.original;
        if (row.total <= 0) return null;

        return (
          <div className="d-flex justify-content-end">
            <button
              type="button"
              className="btn --tertiary --small --icon-only"
              title={translate('billing.table.invoices')}
              aria-label={translate('billing.table.invoices')}
              onClick={() => openInvoices(row)}
            >
              <ExternalLink size={16} />
            </button>
          </div>
        );
      },
    }),
  ];

  const dayHelper = createColumnHelper<DynamicTableFeatures, BillingDay>();
  const dayColumns = [
    dayHelper.display({
      id: 'day',
      meta: { title: translate('billing.chart.table.day'), size: 4 },
      cell: (info) =>
        formatDate(info.row.original.day, translate('date.locale'), translate('date.format.without.hours')),
    }),
    dayHelper.display({
      id: 'calls',
      meta: { title: translate('billing.table.day.calls'), size: 3 },
      cell: (info) => info.row.original.calls,
    }),
    dayHelper.display({
      id: 'bill',
      meta: { title: translate('billing.kpi.bill'), size: 3 },
      cell: (info) => money(info.row.original.bill ?? 0),
    }),
  ];

  const getLastDate = () => {
    if (!all.length) return null;

    const lastDate = formatDate(
      maxBy(all, 'to')!.to,
      translate('date.locale'),
      translate('date.format')
    );

    return (
      <i className="ms-1">
        <Translation i18nkey="date.update" replacements={[lastDate]}>
          upd. {lastDate}
        </Translation>
      </i>
    );
  };

  const drawContent = () => {
    if (consumptionsQuery.isLoading) return <Spinner />;
    if (data && isError(data)) return <div>{data.error}</div>;

    const plans = billingByPlan(consumptions);
    const hasUsage = sumBy(plans, 'calls') > 0 || sumBy(plans, 'total') > 0;

    if (!hasUsage) {
      return <div className="alert alert-info mt-3">{translate('billing.usage.empty')}</div>;
    }

    const days = dailyBilling(consumptions, date);
    const pastDays = days.filter((d) => d.calls !== null).reverse();

    const tableKey = [
      String(teamId),
      String(date.getTime()),
      activeApi ?? 'all',
      String(consumptionsQuery.dataUpdatedAt),
    ];

    const tabs = [
      { id: 'evolution', label: translate('billing.tabs.evolution') },
      { id: 'days', label: translate('billing.tabs.days') },
      { id: 'plans', label: translate('billing.tabs.plans') },
    ] as const;

    return (
      <div style={consumptionsQuery.isPlaceholderData ? { opacity: 0.5 } : undefined}>
        <div className="billing-kpis">
          <div className="billing-kpi section">
            <span className="billing-kpi__label">{translate('billing.kpi.bill')}</span>
            <span className="billing-kpi__value">{money(sumBy(plans, 'total'))}</span>
          </div>
          <div className="billing-kpi section">
            <span className="billing-kpi__label">{translate('billing.kpi.calls')}</span>
            <span className="billing-kpi__value">{sumBy(plans, 'calls')}</span>
          </div>
        </div>

        <ul className="nav nav-tabs flex-column flex-sm-row mt-4" role="tablist">
          {tabs.map((t) => (
            <li key={t.id} className="nav-item">
              <button
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`nav-link ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="billing-tab section p-3">
          {tab === 'evolution' && <BillingCharts days={days} currencySymbol={CURRENCY_SYMBOL} />}

          {tab === 'days' && (
            <DynamicTable<BillingDay>
              queryKey={['team-billing-days', ...tableKey]}
              columns={dayColumns}
              fetchData={() => Promise.resolve({ items: pastDays, total: pastDays.length })}
              getRowId={(d) => String(d.day)}
              persistFiltersInUrl={false}
              tableClassName="--small"
            />
          )}

          {tab === 'plans' && (
            <DynamicTable<PlanBilling>
              queryKey={['team-billing-plans', ...tableKey]}
              columns={columns}
              fetchData={() => Promise.resolve({ items: plans, total: plans.length })}
              getRowId={(row) => `${row.api}|${row.planId}`}
              persistFiltersInUrl={false}
            />
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return <Spinner />;
  } else if (currentTeam && !isError(currentTeam)) {
    return (
      <Can I={read} a={stat} team={currentTeam} dispatchError={true}>
        <div className="row">
          <div className="col">
            <h1>{translate('billing.usage.title')}</h1>
            <div className="month__selector d-flex align-items-center gap-2">
              <MonthPicker updateDate={setDate} value={date} />
              <FeedbackButton
                title={translate('billing.usage.sync')}
                className="btn --secondary --small --icon-only" onPress={sync}>
                <RefreshCw />
              </FeedbackButton>
              {getLastDate()}
              <Select
                className="col-3 ms-auto"
                classNamePrefix="reactSelect"
                isClearable
                placeholder={translate('billing.usage.api.all')}
                aria-label={translate('billing.usage.api.filter')}
                options={apiOptions}
                value={apiOptions.find((o) => o.value === activeApi) ?? null}
                onChange={(option) => setSelectedApi(option?.value)}
              />
            </div>
            {drawContent()}
          </div>
        </div>
      </Can>
    );
  } else {
    toast.error(error?.message || currentTeam?.error);
    return <></>;
  }
};
