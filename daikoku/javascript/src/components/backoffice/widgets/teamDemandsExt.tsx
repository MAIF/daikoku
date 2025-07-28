import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import RefreshCcw from 'react-feather/dist/icons/refresh-ccw';

import { I18nContext } from '../../../contexts';
import * as Services from '../../../services';
import { ITeamSimple } from '../../../types';
import { FeedbackButton } from '../../utils/FeedbackButton';
import { Widget } from './widget';
import { GlobalContext } from '../../../contexts/globalContext';
import { ITeamSubscriptionDemandsGQL } from './teamDemands';



type LastDemandsProps = {
  team: ITeamSimple
}
export const LastDemandsExt = (props: LastDemandsProps) => {
  const { translate } = useContext(I18nContext);
  const { customGraphQLClient } = useContext(GlobalContext);

  const GET_LAST_DEMANDS = `
    query GetLastDemands($teamId: String!, $limit: Int, $offset: Int) {
      subscriptionDemandsForAdmin(teamId: $teamId , limit: $limit, offset: $offset) {
        total
        subscriptionDemands {
          id
          api {
            name
          }
          plan {
            customName
            type
          }
          steps {
            id
            state
            step {
              name
              title
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

  const { isLoading, isError, data } = useQuery({
    queryKey: ["widget", "widget_last_demands_ext"],
    queryFn: () => customGraphQLClient.request<{ subscriptionDemandsForAdmin: ITeamSubscriptionDemandsGQL }>(
      GET_LAST_DEMANDS,
      { teamId: props.team._id, offset: 0, limit: 5 }
    )
  })

  const runProcess = (demandId: string) => {
    return Services.rerunProcess(props.team._id, demandId)
  }


  return (
    <Widget isLoading={isLoading} isError={isError} size="small" title={translate("widget.demands.ext.title")}>
      <div className='d-flex flex-column'>
        {data && data.subscriptionDemandsForAdmin.total === 0 && <span className='widget-list-default-item'>{translate('widget.demands.no.demands')}</span>}
        {data && data.subscriptionDemandsForAdmin.total > 0 && data.subscriptionDemandsForAdmin.subscriptionDemands
          .map((d: any) => {

            const actualStep = d.steps.find(s => ['inProgress', 'waiting'].includes(s.state))
            const reRunable = actualStep && actualStep.step.name !== 'payment'

            return (
              <div className='d-flex flex-row justify-content-between align-items-center widget-list-item'>
                <div className='d-flex flex-column justify-content-between'>
                  <div className='item-title'><i className="fas fa-users me-2" />{d.team.name}</div>
                  <div className='ms-1'>{d.api.name} / {d.plan.customName}</div>
                  {actualStep && <i>{actualStep.step.name} - {actualStep.step.title}</i>}
                </div>
                {reRunable && <FeedbackButton
                  type="primary"
                  className="ms-1 btn-sm"
                  onPress={() => runProcess(d.id)}
                  onSuccess={() => console.debug("success")}
                  feedbackTimeout={100}
                  disabled={false}
                ><RefreshCcw /></FeedbackButton>}
              </div>
            )
          })}
      </div>
    </Widget>
  )
}