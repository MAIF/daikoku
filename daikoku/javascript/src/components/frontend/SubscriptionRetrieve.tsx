import { useContext, useEffect } from 'react';
import { I18nContext, ModalContext } from '../../contexts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Services from "../../services";
import { IApi, isError, ISubscription, ITeamSimple, IUsagePlan } from '../../types';
import { GlobalContext } from '../../contexts/globalContext';
import { useNavigate, useParams } from 'react-router-dom';

export const SubscriptionRetrieve = () => {
  const { connectedUser, tenant } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);
  const navigate = useNavigate();

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') ?? ""

  const { openTeamSelectorModal, confirm, openLoginOrRegisterModal, alert } = useContext(ModalContext);
  const checkRequest = useQuery({
    queryKey: ["check"],
    queryFn: () => Services.checkTransferlink(token)
  })
  const teamRequest = useQuery({
    queryKey: ["teams"],
    queryFn: () => Services.myTeams(),
    enabled: !connectedUser.isGuest && checkRequest.data && !isError(checkRequest.data)
  })


  useEffect(() => {
    if (connectedUser.isGuest) {
      openLoginOrRegisterModal({
        tenant,
        title: translate("login.required"),
        message: translate("subscription.retrieve.login.required.message")
      })
    } else if (checkRequest.data && isError(checkRequest.data)) {
      alert({
        message: translate("subscription.retrieve.token.unavalaible")
      })
    } else if (checkRequest.data && !isError(checkRequest.data) && teamRequest.data && !isError(teamRequest.data)) {
      const data = (checkRequest.data as { subscription: ISubscription, api: IApi, plan: IUsagePlan, ownerTeam: ITeamSimple })
      openTeamSelectorModal({
        title: translate("subscription.retrieve.select.team.modal.title"),
        description: translate({
          key: "subscription.retrieve.select.team.modal.message",
          replacements: [
            data.ownerTeam.name,
            `${data.subscription.customName ?? ""} (${data.api.name}/${data.plan.customName ?? data.plan.type})` 
          ]
        }),
        teams: teamRequest.data,
        action: (team) => confirm({
          title: translate("subscription.retrieve.confirm.modal.title"),
          message: translate({
            key: "subscription.retrieve.confirm.modal.message",
            replacements: [(teamRequest.data as ITeamSimple[]).find(t => t._id === team[0])?.name || ""]
          }),
          okLabel: translate("subscription.retrieve.confirm.modal.ok.button.label"),
        })
          .then((_) => Services.retrieveSubscription(token, team[0], data.subscription._id)
          .then(() => navigate("/apis"))
        ),
        allowMultipleDemand: false,
        actionLabel: translate("subscription.retrieve.select.team.button.label")
      });
    }
  }, [teamRequest.data, checkRequest.data]);

  return <></>;
};