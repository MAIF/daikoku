import { getApolloContext, gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import RefreshCcw from 'react-feather/dist/icons/refresh-ccw';

import { I18nContext } from '../../../core';
import * as Services from '../../../services';
import { ITeamSimple } from '../../../types';
import { formatPlanType } from '../../utils';
import { FeedbackButton } from '../../utils/FeedbackButton';
import { Widget } from './widget';



type LastDemandsProps = {
  team: ITeamSimple
}
export const LastDemandsExt = (props: LastDemandsProps) => {
  const { translate } = useContext(I18nContext);
  const { client } = useContext(getApolloContext());

  const GET_LAST_DEMANDS = gql`
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

  const { isLoading, isError, data } = useQuery(["widget", "widget_last_demands_ext"], () => client?.query({
    query: GET_LAST_DEMANDS,
    variables: { teamId: props.team._id, offset: 0, limit: 5 }
  }))

  const runProcess = (demandId: string) => {
    return Services.rerunProcess(props.team._id, demandId)
  }


  return (
    <Widget isLoading={isLoading} isError={isError} size="small" title={translate("widget.demands.ext.title")}>
      <div className='d-flex flex-column'>
        {data?.data && data.data.subscriptionDemandsForAdmin.total === 0 && <span className='widget-list-default-item'>{translate('widget.demands.no.demands')}</span>}
        {data?.data && data.data.subscriptionDemandsForAdmin.total > 0 && data.data.subscriptionDemandsForAdmin.subscriptionDemands
          .map((d: any) => {
            const actualStep = d.state === 'inProgress' && d.steps.find(s => s.state === 'inProgress')
            const reRunable = actualStep.step.name !== 'payment'

            return (
              <div className='d-flex flex-row justify-content-between align-items-center widget-list-item'>
                <div className='d-flex flex-column justify-content-between'>
                  <div className='item-title'><i className="fas fa-users me-2"/>{d.team.name}</div>
                  <div className='ms-1'>{d.api.name} / {d.plan.customName || formatPlanType(d.plan.type, translate)}</div>
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