import {useQuery} from "@tanstack/react-query"
import {useContext, useState} from "react"
import {useNavigate} from "react-router-dom"


import {I18nContext} from "../../../contexts"
import {GlobalContext} from "../../../contexts/globalContext"
import * as Services from '../../../services'
import {isError} from "../../../types"
import {ApiList} from "./ApiList"
import {manage, api as API, CanIDoAction} from "../../utils/permissions"
import {CreateApiSideSheet} from "../apiEditor/sheets/CreateApiSideSheet"

type NewHomeProps = {
  teamId?: string
  apiGroupId?: string
}

export type TDashboardData = {
  apis: {
    published: number
    deprecated: number
    deprecatedExpireSoon: number
    newlyCreated: number
  },
  subscriptions: {
    active: number
    expire: number
  },
  demands: {
    waiting: number
  }
}

export const Dashboard = (_: NewHomeProps) => {
  const {tenant, connectedUser, unreadNotificationsCount, apiCreationPermitted} = useContext(GlobalContext)
  const {translate} = useContext(I18nContext)
  const navigate = useNavigate()

  const [creating, setCreating] = useState(false)

  const myTeamsRequest = useQuery({
    queryKey: ['myTeams'],
    queryFn: () => Services.myTeams(),
  });

  const myTeams = myTeamsRequest.data && !isError(myTeamsRequest.data) ? myTeamsRequest.data : []

  const creationTeams = myTeams
    .filter((t) => t.type !== 'Admin')
    .filter((t) => !tenant.creationSecurity || t.apisCreationPermission)
    .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted))

  const canCreateApi = !connectedUser.isGuest && creationTeams.length > 0

  return (
    <main className='flex-grow-1 d-flex flex-column gap-3 main' role="main">
      <section className="">
        <div className="organisation__header d-flex flex-row justify-content-between align-items-start">
          <h1 className="jumbotron-heading fw-bold">
            {tenant.title ?? tenant.name}
          </h1>
          {!!unreadNotificationsCount && (
            <button
              onClick={() =>
                navigate('/notifications?filter=[{"id":"unreadOnly","value":true},{"id":"type","value":[' +
                  '"ApiSubscription",' +
                  '"ApiAccess",' +
                  '"CheckoutForSubscription",' +
                  '"TransferApiOwnership",' +
                  '"ApiSubscriptionDemand"]}]')}
              className="btn --secondary">
              <div className="d-flex gap-2 align-items-center">
                {translate('dashboard.demands.tile.title')}
                <span className="number-indicator">{unreadNotificationsCount}</span>
              </div>
            </button>
          )}
        </div>
      </section>
      <div className="d-flex gap-3 justify-content-between">
        <div>
          <h2 className="api_list__title" id='api-list-label'>
            {translate('dashboard.api.list.title')}
          </h2>
        </div>
        <div>

          {canCreateApi && (
            <button type="button" className='btn --primary' onClick={() => setCreating(true)}>
              {translate('dashboard.create.api.button.label')}
            </button>
          )}
        </div>
      </div>
      <ApiList/>

      {creating && <CreateApiSideSheet teams={creationTeams} onClose={() => setCreating(false)} />}
    </main>
  )
}
