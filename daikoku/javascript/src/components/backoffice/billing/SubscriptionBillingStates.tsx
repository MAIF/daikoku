import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInDays } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { useContext } from 'react';
import { toast } from 'sonner';

import { I18nContext } from '../../../contexts';
import * as Services from '../../../services';
import { ISubscriptionBillingState, ITeamSimple, isError } from '../../../types';
import { Spinner, formatCurrency, formatDate, getCurrencySymbol } from '../../utils';

type Translate = ReturnType<typeof useBillingTranslations>;

const useBillingTranslations = () => {
  const { translate } = useContext(I18nContext);

  return {
    translate,
    date: (millis: number) =>
      formatDate(millis, translate('date.locale'), translate('date.format.without.hours')),
  };
};

const amount = (value: number, currency: string) =>
  `${formatCurrency(value)} ${getCurrencySymbol(currency) ?? currency}`;

const billingBadge = (state: ISubscriptionBillingState, { translate }: Translate) => {
  if (state.error) {
    return { className: '--neutral', label: translate('billing.state.unavailable') };
  } else if (state.legacy) {
    return { className: '--inactive', label: translate('billing.state.legacy') };
  } else if (!state.enabled) {
    return { className: '--danger', label: translate('billing.state.cut') };
  } else if (state.unpaid) {
    return { className: '--warning', label: translate('billing.state.unpaid') };
  } else if (state.cancelAt) {
    return { className: '--neutral', label: translate('billing.state.cancellation-scheduled') };
  } else {
    return { className: '--success', label: translate('billing.state.active') };
  }
};

type SubscriptionBillingCardProps = {
  team: ITeamSimple;
  state: ISubscriptionBillingState;
  onUndoCancellation: (subscription: string) => void;
};

const SubscriptionBillingCard = ({ team, state, onUndoCancellation }: SubscriptionBillingCardProps) => {
  const texts = useBillingTranslations();
  const { translate, date } = texts;
  const badge = billingBadge(state, texts);

  const openInvoices = () =>
    Services.fetchInvoices(team._id, state.api, state.plan, window.location.href).then(
      ({ url }) => (window.location.href = url)
    );

  return (
    <div className="subscription-billing__card" data-testid={`billing-${state.subscription}`}>
      <div className="subscription-billing__header">
        <div>
          <div className="subscription-billing__api">{state.apiName}</div>
          <div className="subscription-billing__plan">{state.planName}</div>
        </div>
        <span className={`badge ${badge.className}`}>{badge.label}</span>
      </div>

      {state.error && <p className="subscription-billing__line">{translate('billing.state.unavailable.description')}</p>}
      {state.legacy && <p className="subscription-billing__line">{translate('billing.state.legacy.description')}</p>}

      {state.unpaid && (
        <p className="subscription-billing__line --warning">
          {translate({
            key: 'billing.unpaid.since',
            replacements: [
              String(differenceInDays(new Date(), new Date(state.unpaid.since))),
              amount(state.unpaid.amount, state.currency),
            ],
          })}
          {state.enabled && state.unpaid.cutAt && (
            <> {translate({ key: 'billing.unpaid.cut-at', replacements: [date(state.unpaid.cutAt)] })}</>
          )}
        </p>
      )}

      {state.cancelAt && (
        <div className="subscription-billing__line d-flex align-items-center justify-content-between gap-2">
          <span>{translate({ key: 'billing.cancellation.effective-at', replacements: [date(state.cancelAt)] })}</span>
          <button className="btn btn-sm --outlined" onClick={() => onUndoCancellation(state.subscription)}>
            {translate('billing.cancellation.undo')}
          </button>
        </div>
      )}

      {state.nextCharge != null && state.periodEnd && (
        <p className="subscription-billing__line">
          {translate({
            key: 'billing.next-charge',
            replacements: [amount(state.nextCharge, state.currency), date(state.periodEnd)],
          })}
        </p>
      )}

      {state.priceChange && state.priceChange.effectiveAt && (
        <p className="subscription-billing__line --info">
          {translate({
            key: 'billing.price-change',
            replacements: [
              date(state.priceChange.effectiveAt),
              amount(state.priceChange.costPerMonth ?? 0, state.currency),
              amount(state.priceChange.costPerRequest ?? 0, state.currency),
            ],
          })}
        </p>
      )}

      {!state.legacy && !state.error && (
        <button className="btn btn-sm --ghost subscription-billing__invoices" onClick={openInvoices}>
          {translate('billing.invoices')}
          <ExternalLink size={14} className="ms-1" />
        </button>
      )}
    </div>
  );
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

  if (statesQuery.isLoading) {
    return <Spinner />;
  } else if (!statesQuery.data || isError(statesQuery.data)) {
    return <div className="alert alert-danger">{translate('billing.states.error')}</div>;
  }

  return (
    <div className="subscription-billing section p-2">
      <h2 className="subscription-billing__title">{translate('billing.states.title')}</h2>
      {!statesQuery.data.length && <p className="subscription-billing__empty">{translate('billing.states.empty')}</p>}
      <div className="subscription-billing__cards">
        {statesQuery.data.map((state) => (
          <SubscriptionBillingCard
            key={state.subscription}
            team={team}
            state={state}
            onUndoCancellation={(subscription) => undoCancellation.mutate(subscription)}
          />
        ))}
      </div>
    </div>
  );
};
