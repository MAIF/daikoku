import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useContext } from "react"
import Key from 'react-feather/dist/icons/key'
import Search from 'react-feather/dist/icons/search'
import Sliders from 'react-feather/dist/icons/sliders'
import { useNavigate } from "react-router-dom"


import { I18nContext } from "../../../contexts"
import { GlobalContext } from "../../../contexts/globalContext"
import * as Services from '../../../services'
import { ApiList } from "./ApiList"
import { Tile } from "./Tile"
import { Spinner } from "../../utils"
import { isError } from "../../../types"

type NewHomeProps = {
  teamId?: string
  apiGroupId?: string
}

export type TDashboardData = {
  apis: {
    published: number
    consumed: number
  },
  subscriptions: {
    active: number
    expire: number
  },
  demands: {
    waiting: number
  }
}

export const Dashboard = (props: NewHomeProps) => {
  const { tenant, connectedUser, isTenantAdmin } = useContext(GlobalContext)
  const { translate } = useContext(I18nContext)

  const navigate = useNavigate()

  const queryClient = useQueryClient()
  const dashboardQuery = useQuery({
    queryKey: [`${connectedUser._id}-dashboard`],
    queryFn: () => Services.myDashboard()
  })

  return (
    <main className='flex-grow-1 d-flex flex-column gap-3' role="main">
      <section className="">
        <div className="d-flex flex-row justify-content-between align-items-center">
          <div className="d-flex flex-column justify-content-center">
            <h1 className="jumbotron-heading mt-3">
              {tenant.title ?? tenant.name}
            </h1>
            <p>{tenant.description}</p>
          </div>
          {isTenantAdmin && <button onClick={() => navigate('/settings/settings/general')}
            className="btn btn-outline-primary">
            <Sliders className="me-2" />{translate('dashboard.page.tenant.setting.button.label')}
          </button>}
        </div>
      </section>
      {!connectedUser.isGuest && <div className="d-flex flex-row gap-3">
        <Tile
          width={40}
          title={translate('dashboard.apis.tile.title')}
          icon={<Search />}
          description={translate('dashboard.apis.tile.description')}
          query={dashboardQuery}
          reset={() => queryClient.invalidateQueries({ queryKey: [`${connectedUser._id}-dashboard`] })}
          data={(data) => [
            { label: translate('dashboard.apis.tile.published.label'), value: data.apis.published },
            { label: translate('dashboard.apis.tile.consumed.label'), value: data.apis.consumed }]} />
        <Tile
          width={40}
          title={translate('dashboard.apikeys.tile.title')}
          icon={<Key />}
          description={translate('dashboard.apikeys.tile.description')}
          query={dashboardQuery}
          reset={() => queryClient.invalidateQueries({ queryKey: [`${connectedUser._id}-dashboard`] })}
          data={(data) => [
            { label: translate('dashboard.apikeys.tile.active.label'), value: data.subscriptions.active },
            { label: translate('dashboard.apikeys.tile.expire.label'), value: data.subscriptions.expire }]} />
        <Tile
          width={20}
          title={translate('dashboard.demands.tile.title')}
          icon={<Search />}
          description={translate('dashboard.demands.tile.description')}
          query={dashboardQuery}
          reset={() => queryClient.invalidateQueries({ queryKey: [`${connectedUser._id}-dashboard`] })}
          data={(data) => [{ label: translate('dashboard.demands.tile.waiting.label'), value: data.demands.waiting }]}
          action={() => navigate('/notifications?filter=[{"id":"unreadOnly","value":true},{"id":"type","value":["ApiSubscription"]}]')} />
      </div>}
      <ApiList />
    </main>
  )
}