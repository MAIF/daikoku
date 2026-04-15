import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useContext, useMemo } from "react"
import Key from 'react-feather/dist/icons/key'
import Search from 'react-feather/dist/icons/search'
import Sliders from 'react-feather/dist/icons/sliders'
import { useNavigate } from "react-router-dom"


import { I18nContext } from "../../../contexts"
import { GlobalContext } from "../../../contexts/globalContext"
import * as Services from '../../../services'
import { ApiList } from "./ApiList"
import { Tile } from "./Tile"
import { CmsViewerByPath } from "../CmsViewer"

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
  const { tenant, connectedUser, isTenantAdmin, theme } = useContext(GlobalContext)
  const { translate, language } = useContext(I18nContext)

  const navigate = useNavigate()

  const queryClient = useQueryClient()
  const dashboardQuery = useQuery({
    queryKey: [`${connectedUser._id}-dashboard`],
    queryFn: () => Services.myDashboard()
  })

  const themedLogo = useMemo(() => {
    if (theme === 'DARK' && tenant.logoDark) {
      return tenant.logoDark
    }
    return tenant.logo
  }, [theme, tenant.logo, tenant.logoDark])

  return (
    <main className='flex-grow-1 d-flex flex-column gap-3' role="main">
      <section className="">
        <div className="" style={{ marginTop: '50px', maxHeight: '155px', position: 'relative', overflowY: 'scroll' }}>
          <CmsViewerByPath path={`/customization/dashboard/description/${language.toLocaleLowerCase()}`}
            fallBack={() => (
              <div className="d-flex flex-row align-items-center gap-5" style={{ maxHeight: '155px' }}>
                {themedLogo && <img style={{ maxWidth: '25%', maxHeight: '155px', objectFit: 'contain' }} src={themedLogo} alt="logo" />}
                <div className="d-flex flex-column justify-content-center">
                  <h1 className="jumbotron-heading mt-3">
                    {tenant.title ?? tenant.name}
                  </h1>
                  <p>{tenant.description}</p>
                </div>
              </div>
            )
            } />
          {isTenantAdmin && <button onClick={() => navigate('/settings/settings/general')}
            className="btn btn-outline-primary" style={{ position: 'absolute', top: "0px", right: "10px" }}>
            <Sliders className="me-2" />{translate('dashboard.page.tenant.setting.button.label')}
          </button>}
        </div>
      </section>
      {!connectedUser.isGuest && <div className="d-flex flex-row gap-3">
        <Tile
          width={20}
          title={translate('dashboard.demands.tile.title')}
          icon={<i className="fas fa-bolt" />}
          description={translate('dashboard.demands.tile.description')}
          query={dashboardQuery}
          reset={() => queryClient.invalidateQueries({ queryKey: [`${connectedUser._id}-dashboard`] })}
          data={(data) => [{ label: translate('nouvelle apis depuis 30j jours'), value: data.apis.newlyCreated }]} />
        <Tile
          width={30}
          title={translate('dashboard.apis.tile.title')}
          icon={<Search />}
          description={translate('dashboard.apis.tile.description')}
          query={dashboardQuery}
          reset={() => queryClient.invalidateQueries({ queryKey: [`${connectedUser._id}-dashboard`] })}
          data={(data) => [
            { label: translate('deprecié'), value: data.apis.deprecated },
            { label: translate('expire bientot'), value: data.apis.deprecatedExpireSoon }]} />
        <Tile
          width={30}
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