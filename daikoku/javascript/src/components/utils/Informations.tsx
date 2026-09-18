import { useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Info, XOctagon } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { QUERY_KEYS } from '../../constants/queryKeys';
import { I18nContext, ModalContext } from '../../contexts';
import { GlobalContext } from "../../contexts/globalContext";
import * as Services from '../../services';
import { IApi, isError, ISubscriptionDemand } from '../../types';
import { Spinner } from './Spinner';

const CLOSED_DEMAND_STATES = ['accepted', 'refused', 'canceled'];

const isPaymentPending = (demand: ISubscriptionDemand) =>
  !CLOSED_DEMAND_STATES.includes(demand.state) &&
  demand.steps.some((s) => s.step.type === 'payment' && !CLOSED_DEMAND_STATES.includes(s.state));

const useSubscriptionDemand = (
  teamId: string | null,
  demandId: string | null,
  { enabled, pollWhilePaymentPending }: { enabled: boolean; pollWhilePaymentPending: boolean }
) => {
  const demandQuery = useQuery({
    queryKey: QUERY_KEYS.subscriptionDemand(teamId!, demandId!),
    queryFn: () => Services.getSubscriptionDemand(teamId!, demandId!),
    enabled: enabled && !!teamId && !!demandId,
    // The subscription is materialised by the Stripe webhook, which can land after the redirect.
    refetchInterval: (query) => {
      const demand = query.state.data;
      return pollWhilePaymentPending && demand && !isError(demand) && isPaymentPending(demand)
        ? 2000
        : false;
    },
  });

  return demandQuery.data && !isError(demandQuery.data) ? demandQuery.data : undefined;
};

const InformationIcon = (props: {
  error: boolean;
  waitingForStripe: boolean;
  paymentCanceled: boolean;
}) => {
  if (props.error) {
    return <XOctagon size="4.5rem" className="color-danger" />;
  }

  if (props.waitingForStripe) {
    return <Spinner width={72} />;
  }

  if (props.paymentCanceled) {
    return <Info size="4.5rem" />;
  }

  return <CheckCircle size="4.5rem" className="color-success" />;
};

const InformationAction = (props: {
  teamId: string | null;
  demandId: string | null;
  resumablePayment: boolean;
  api?: IApi;
}) => {
  const { translate } = useContext(I18nContext);
  const navigate = useNavigate();

  const resumePayment = () =>
    Services.rerunProcess(props.teamId!, props.demandId!).then((response) => {
      if (isError(response)) {
        toast.error(translate(response.error));
      } else {
        window.location.href = response.checkoutUrl;
      }
    });

  if (props.resumablePayment) {
    return (
      <button type="button" className="btn --primary --small" onClick={resumePayment}>
        {translate('informations.page.resume.payment.button.label')}
      </button>
    );
  }

  if (props.api) {
    const { team, _humanReadableId, currentVersion } = props.api;
    return (
      <button
        type="button"
        className="btn --primary --small"
        onClick={() =>
          navigate(`/${team}/${_humanReadableId}/${currentVersion}/apikeys?team=${props.teamId}`)
        }
      >
        {translate('notif.api.demand.accept.see_key')}
      </button>
    );
  }

  return (
    <button type="button" className="btn --primary --small" onClick={() => navigate('/apis')}>
      {translate('informations.page.go.back.button.label')}
    </button>
  );
};

export const Informations = () => {
  const { translate } = useContext(I18nContext);
  const { tenant } = useContext(GlobalContext);
  const { openJoinTeamModal } = useContext(ModalContext);

  const [searchParams] = useSearchParams();

  const error = searchParams.get('error');
  const invitationToken = searchParams.get('invitation-token');
  const teamId = searchParams.get('team');
  const demandId = searchParams.get('demand');
  const paymentReceived = searchParams.get('message') === 'subscription-payment-received';
  const paymentCanceled = searchParams.get('message') === 'subscription-payment-canceled';

  const demand = useSubscriptionDemand(teamId, demandId, {
    enabled: paymentReceived || paymentCanceled,
    pollWhilePaymentPending: paymentReceived,
  });

  const apiQuery = useQuery({
    queryKey: QUERY_KEYS.visibleApiById(demand?.api!),
    queryFn: () => Services.getVisibleApiWithId(demand!.api),
    enabled: demand?.state === 'accepted',
  });
  const api = apiQuery.data && !isError(apiQuery.data) ? apiQuery.data : undefined;

  const messageId =
    paymentReceived && demand?.state === 'accepted'
      ? 'subscription-payment-active'
      : searchParams.get('message');

  const waitingForStripe = paymentReceived && (!demand || isPaymentPending(demand));
  const resumablePayment = paymentCanceled && !!demand && isPaymentPending(demand);

  const title = error
    ? translate('informations.page.error.title')
    : translate(`informations.page.${messageId}.title`);
  const description = error ?? translate(`informations.page.${messageId}.description`);

  useEffect(() => {
    if (invitationToken) {
      openJoinTeamModal();
    }
  }, [invitationToken]);


  return (
    <main className='flex-grow-1' role="main">
      <section className="">
        <div className="d-flex flex-row justify-content-between align-items-center">
          <div className="d-flex flex-column justify-content-center">
            <h1 className="jumbotron-heading mt-3">
              {tenant.title ?? tenant.name}
            </h1>
            <p>{tenant.description}</p>
          </div>
        </div>
      </section>
      {(!!messageId || error) && <div className="mx-auto information-cartridge">
        <div className="d-flex flex-column align-items-center justify-content-center gap-3">
          <InformationIcon
            error={!!error}
            waitingForStripe={waitingForStripe}
            paymentCanceled={paymentCanceled}
          />
          <h2 className="information-title">{title}</h2>
          <p className="information-description">{description}</p>
        </div>
        <div className="inforamtion-footer d-flex justify-content-end mt-5">
          <InformationAction
            teamId={teamId}
            demandId={demandId}
            resumablePayment={resumablePayment}
            api={api}
          />
        </div>
      </div>
      }
    </main>
  )
}
