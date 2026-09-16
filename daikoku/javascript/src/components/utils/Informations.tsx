import { useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, XOctagon } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { QUERY_KEYS } from '../../constants/queryKeys';
import { I18nContext, ModalContext } from '../../contexts';
import { GlobalContext } from "../../contexts/globalContext";
import * as Services from '../../services';
import { isError, ISubscriptionDemand } from '../../types';

const CLOSED_DEMAND_STATES = ['accepted', 'refused', 'canceled'];

const isPaymentPending = (demand: ISubscriptionDemand) =>
  !CLOSED_DEMAND_STATES.includes(demand.state) &&
  demand.steps.some((s) => s.step.type === 'payment' && !CLOSED_DEMAND_STATES.includes(s.state));

export const Informations = () => {
  const { translate } = useContext(I18nContext);
  const { tenant } = useContext(GlobalContext);
  const { openJoinTeamModal } = useContext(ModalContext);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const error = searchParams.get('error');
  const invitationToken = searchParams.get('invitation-token');
  const teamId = searchParams.get('team');
  const demandId = searchParams.get('demand');
  const paymentReceived = searchParams.get('message') === 'subscription-payment-received';

  // The subscription is materialised by the Stripe webhook, which can land after the redirect.
  const demandQuery = useQuery({
    queryKey: QUERY_KEYS.subscriptionDemand(teamId!, demandId!),
    queryFn: () => Services.getSubscriptionDemand(teamId!, demandId!),
    enabled: paymentReceived && !!teamId && !!demandId,
    refetchInterval: (query) => {
      const demand = query.state.data;
      return demand && !isError(demand) && isPaymentPending(demand) ? 2000 : false;
    },
  });
  const demand = demandQuery.data && !isError(demandQuery.data) ? demandQuery.data : undefined;

  const apiQuery = useQuery({
    queryKey: QUERY_KEYS.visibleApiById(demand?.api!),
    queryFn: () => Services.getVisibleApiWithId(demand!.api),
    enabled: demand?.state === 'accepted',
  });
  const api = apiQuery.data && !isError(apiQuery.data) ? apiQuery.data : undefined;

  const messageId = (() => {
    if (!paymentReceived || !demand || isPaymentPending(demand)) return searchParams.get('message');
    if (demand.state === 'accepted') return 'subscription-payment-active';
    if (!CLOSED_DEMAND_STATES.includes(demand.state)) return 'subscription-payment-validation';
    return searchParams.get('message');
  })();

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
          {!!messageId && !error && <CheckCircle size='4.5rem' className="color-success" />}
          {!!error && <XOctagon size='4.5rem' className="color-danger" />}
          {
            !!messageId && (
              <>
                <h2 className="information-title">{translate(`informations.page.${messageId ?? 'unknown'}.title`)}</h2>
                <p className="information-description">{translate(`informations.page.${messageId ?? 'unknown'}.description`)}</p>
              </>
            )}
          {
            !!error && (
              <>
                <h2 className="information-title">{translate(`informations.page.error.title`)}</h2>
                <p className="information-description">{error}</p>
              </>
            )}
        </div>
        <div className="inforamtion-footer d-flex justify-content-end mt-5">
          {api ? (
            <div
              className="btn --primary --small"
              onClick={() => navigate(`/${api.team}/${api._humanReadableId}/${api.currentVersion}/apikeys?team=${teamId}`)}
            >
              {translate('notif.api.demand.accept.see_key')}
            </div>
          ) : (
            <div className="btn --primary --small" onClick={() => navigate("/apis")}>
              {translate('informations.page.go.back.button.label')}
            </div>
          )}
        </div>
      </div>
      }
    </main>
  )
}
