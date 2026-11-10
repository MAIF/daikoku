import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ExternalLink } from 'lucide-react';
import { useContext } from 'react';
import { toast } from 'sonner';

import { I18nContext } from '../../../contexts';
import * as Services from '../../../services';
import { ISubscriptionBillingState, ITeamSimple, isError } from '../../../types';
import { DynamicTable, DynamicTableFeatures } from '../../inputs';
import { Spinner, formatCurrency, formatDate, getCurrencySymbol } from '../../utils';

type Translate = (params: any) => string;

const amount = (value: number) =>
  `${formatCurrency(value)} ${getCurrencySymbol('EUR')}`;

const billingBadge = (state: ISubscriptionBillingState, translate: Translate) => {
  if (state.error) {
    return { className: '--neutral', label: translate('billing.state.unavailable') };
  } else if (state.blockedBy.includes('ended')) {
    return { className: '--inactive', label: translate('billing.state.ended') };
  } else if (state.blockedBy.length > 0) {
    return { className: '--warning', label: translate('billing.state.suspended') };
  } else if (state.cancelAt) {
    return { className: '--neutral', label: translate('billing.state.cancellation-scheduled') };
  } else {
    return { className: '--success', label: translate('billing.state.active') };
  }
};

export const SubscriptionBillingStates = ({ team }: { team: ITeamSimple }) => {
  const { translate } = useContext(I18nContext);
  const queryClient = useQueryClient();

  const statesQuery = useQuery({
    queryKey: ['billing-states', team._id],
    queryFn: () => Services.getTeamBillingStates(team._id),
  });

  const undoCancellation = useMutation({
    mutationFn: (subscription: string) => Services.cancelApiSubscription(team._id, subscription, false),
    onSuccess: (response) => {
      if (isError(response)) {
        toast.error(response.error);
      } else {
        toast.success(translate('billing.cancellation.undone'));
        queryClient.invalidateQueries({ queryKey: ['billing-states', team._id] });
      }
    },
  });

  const date = (millis: number) =>
    formatDate(millis, translate('date.locale'), translate('date.format.without.hours'));

  const openInvoices = (state: ISubscriptionBillingState) =>
    Services.fetchInvoices(team._id, state.api, state.plan, window.location.href)
      .then((response) => {
        if (isError(response)) {
          toast.error(response.error);
        } else {
          window.location.href = response.url;
        }
      });

  const columnHelper = createColumnHelper<DynamicTableFeatures, ISubscriptionBillingState>();
  const columns = [
    columnHelper.display({
      id: 'api',
      meta: { title: translate('billing.table.api'), size: 3 },
      cell: (info) => info.row.original.apiName,
    }),
    columnHelper.display({
      id: 'plan',
      meta: { title: translate('billing.table.plan'), size: 2 },
      cell: (info) => info.row.original.planName,
    }),
    columnHelper.display({
      id: 'state',
      meta: { title: translate('billing.table.state'), size: 2 },
      cell: (info) => {
        const badge = billingBadge(info.row.original, translate);
        return <span className={`badge ${badge.className}`}>{badge.label}</span>;
      },
    }),
    columnHelper.display({
      id: 'due',
      meta: { title: translate('billing.table.due'), size: 4 },
      cell: (info) => {
        const state = info.row.original;

        if (state.error) {
          return <span>{translate('billing.state.unavailable.description')}</span>;
        }

        return (
          <div className="d-flex flex-column">
            {state.cancelAt && (
              <span>
                {translate({ key: 'billing.cancellation.effective-at', replacements: [date(state.cancelAt)] })}
              </span>
            )}
            {state.nextCharge != null && state.periodEnd && (
              <span>
                {translate({
                  key: 'billing.next-charge',
                  replacements: [amount(state.nextCharge), date(state.periodEnd)],
                })}
              </span>
            )}
            {state.priceChange?.effectiveAt && (
              <small className="subscription-billing__price-change">
                {translate({
                  key: 'billing.price-change',
                  replacements: [
                    date(state.priceChange.effectiveAt),
                    amount(state.priceChange.costPerMonth ?? 0),
                    amount(state.priceChange.costPerRequest ?? 0),
                  ],
                })}
              </small>
            )}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      meta: { size: 2 },
      cell: (info) => {
        const state = info.row.original;
        if (state.error) return null;

        return (
          <div className="d-flex justify-content-end align-items-center gap-1">
            {state.cancelAt && (
              <button
                type="button"
                className="btn --secondary --small"
                onClick={() => undoCancellation.mutate(state.subscription)}
              >
                {translate('billing.cancellation.undo')}
              </button>
            )}
            <button
              type="button"
              className="btn --tertiary --small --icon-only"
              title={translate('billing.invoices')}
              aria-label={translate('billing.invoices')}
              onClick={() => openInvoices(state)}
            >
              <ExternalLink size={16} />
            </button>
          </div>
        );
      },
    }),
  ];

  if (statesQuery.isLoading) {
    return <Spinner />;
  } else if (!statesQuery.data || isError(statesQuery.data)) {
    return <div className="alert alert-danger">{translate('billing.states.error')}</div>;
  } else if (!statesQuery.data.length) {
    return <p className="subscription-billing__empty">{translate('billing.states.empty')}</p>;
  }

  const states = statesQuery.data;

  return (
    <DynamicTable<ISubscriptionBillingState>
      queryKey={['billing-states-table', team._id, String(statesQuery.dataUpdatedAt)]}
      columns={columns}
      fetchData={() => Promise.resolve({ items: states, total: states.length })}
      getRowId={(state) => state.subscription}
      getRowAriaLabel={(state) => `${state.apiName} - ${state.planName}`}
      persistFiltersInUrl={false}
    />
  );
};
