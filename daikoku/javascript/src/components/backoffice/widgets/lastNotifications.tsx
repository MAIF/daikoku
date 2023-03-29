
import { getApolloContext, gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';

import { I18nContext } from '../../../core';
import * as Services from '../../../services';
import { ITeamSimple } from '../../../types';
import { formatPlanType } from '../../utils';
import { FeedbackButton } from '../../utils/FeedbackButton';
import { Widget } from './widget';

type Props = {
  team: ITeamSimple
}
export const LastNotifications = (props: Props) => {
  const GET_TEAM_LAST_DEMANDS = gql`
    query GetTeamLastDemands($teamId: String!, $limit: Int, $offset: Int) {
      teamSubscriptionDemands(teamId: $teamId , limit: $limit, offset: $offset) {
        count
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
  const { translate } = useContext(I18nContext);
  const { client } = useContext(getApolloContext());
  const { isLoading, isError, data } = useQuery(["widget", "widget_team_last_demands"], () => client?.query({
    query: GET_TEAM_LAST_DEMANDS,
    variables: { teamId: props.team._id, offset: 0, limit: 5 }
  }))

  const handleCheckout = (demandId: string) => {
    return Services.rerunProcess(props.team._id, demandId)
      .then(r => {
        window.location.href = r.checkoutUrl
      })
  }

  return (
    <Widget isLoading={isLoading} isError={isError} size="small" title="My InProgress demands">
      <div className='d-flex flex-column gap-1'>
        {data?.data && data.data.teamSubscriptionDemands.count === 0 && <span>no demands</span>}
        {data?.data && data.data.teamSubscriptionDemands.count > 0 && data.data.teamSubscriptionDemands.subscriptionDemands.map((d: any) => {

          const checkout = d.state === 'inProgress' && d.steps.find(s => s.state === 'inProgress').step.name === 'payment'

          return (
            <div className='d-flex flex-row justify-content-between align-items-center widget-list-item'>
              <div>{`${d.api.name} / ${d.plan.customName || formatPlanType(d.plan.type, translate)}`}</div>
              <div>{checkout && <FeedbackButton
                type="primary"
                className="ms-1"
                onPress={() => handleCheckout(d.id)}
                onSuccess={() => console.debug("success")}
                feedbackTimeout={100}
                disabled={false}
              >Checkout</FeedbackButton>}
                {!checkout && <span>{d.state}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </Widget>
  )
}