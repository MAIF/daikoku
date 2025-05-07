
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext } from 'react';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { ISubscriptionDemandGQL, ITeamSimple } from '../../../types';
import { FeedbackButton } from '../../utils/FeedbackButton';
import { Widget } from './widget';

type LastDemandsProps = {
  team: ITeamSimple
}
export interface ITeamSubscriptionDemandsGQL {
  total: number,
  subscriptionDemands: Array<ISubscriptionDemandGQL>
}
export const LastDemands = (props: LastDemandsProps) => {
  const GET_TEAM_LAST_DEMANDS = `
    query GetTeamLastDemands($teamId: String!, $limit: Int, $offset: Int) {
      teamSubscriptionDemands(teamId: $teamId , limit: $limit, offset: $offset) {
        total
        subscriptionDemands {
          id
          api {
            name
          }
          plan {
            customName
          }
          steps {
            id
            state
            step {
              name
            }
          }
          state
          team {
            name
          }
          from {
            name
          }
          date
        }
      }
    }
  `
  const { connectedUser, customGraphQLClient } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  const queryClient = useQueryClient()
  const { isLoading, isError, data } = useQuery({
    queryKey: ["widget", "widget_team_last_demands"],
    queryFn: () => customGraphQLClient.request<{ teamSubscriptionDemands: ITeamSubscriptionDemandsGQL }>(
      GET_TEAM_LAST_DEMANDS,
      { teamId: props.team._id, offset: 0, limit: 5 }
    )
  })
  const isAdmin = !!props.team.users.find(u => u.userId === connectedUser._id && u.teamPermission === 'Administrator') || connectedUser.isDaikokuAdmin

  const handleCheckout = (demandId: string) => {
    return Services.rerunProcess(props.team._id, demandId)
      .then(r => {
        window.location.href = r.checkoutUrl
      })
  }

  const cancelDemand = (demandId: string) => {
    confirm({
      title: translate('demand.delete.modal.title'),
      message: translate('demand.delete.modal.message')
    })
      .then(() => Services.cancelProcess(props.team._id, demandId))
      .then(() => queryClient.invalidateQueries({ queryKey: ["widget", "widget_team_last_demands"] }));
  }

  return (
    <>
      <Widget isLoading={isLoading} isError={isError} size="small" title={translate("widget.demands.title")}>
        <div className='d-flex flex-column gap-1'>
          {data && data.teamSubscriptionDemands.total === 0 && <span className='widget-list-default-item'>{translate('widget.demands.no.demands')}</span>}
          {data && data.teamSubscriptionDemands.total > 0 && data.teamSubscriptionDemands.subscriptionDemands.map((d) => {
            const checkout = d.state === 'inProgress' && d.steps.find(s => s.state === 'inProgress')?.step.name === 'payment'

            return (
              <div className='d-flex flex-column justify-content-between align-items-center widget-list-item'>
                <div className='item-title'>{`${d.api.name} / ${d.plan.customName}`}</div>
                <div className='d-flex justify-content-between w-100 my-2'>
                  {checkout && <FeedbackButton
                    type="primary"
                    className="ms-1 btn-sm"
                    onPress={() => handleCheckout(d.id)}
                    onSuccess={() => console.debug("success")}
                    feedbackTimeout={100}
                    disabled={false}
                  >Checkout</FeedbackButton>
                  }
                  {!checkout && <span className='badge bg-secondary my-2'>{translate({ key: 'widget.demands.state', replacements: [translate(d.state)] })}</span>}
                  {isAdmin && <button className='btn btn-sm btn-outline-danger ms-1' onClick={() => cancelDemand(d.id)}>{translate('Cancel')}</button>}
                </div>
              </div>
            )
          })}
        </div>
      </Widget>
    </>
  )
}