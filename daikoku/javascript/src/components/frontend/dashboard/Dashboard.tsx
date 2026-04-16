import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useContext, useMemo } from "react"
import Sliders from 'react-feather/dist/icons/sliders'
import { useNavigate } from "react-router-dom"


import { I18nContext } from "../../../contexts"
import { GlobalContext } from "../../../contexts/globalContext"
import * as Services from '../../../services'
import { CmsViewerByPath } from "../CmsViewer"
import { ApiList } from "./ApiList"
import { Tile } from "./Tile"

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
        <div className="organisation__header">
          <CmsViewerByPath path={`/customization/dashboard/description/${language.toLocaleLowerCase()}`}
            fallBack={() => (
              <div className="organisation_header_wrapper d-flex flex-row align-items-center gap-5">
                {themedLogo && <img className="organisation_logo" src={themedLogo} alt="logo" />}
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
            className="organisation_header_settings_button btn btn-outline-primary">
            <Sliders className="me-2" />{translate('dashboard.page.tenant.setting.button.label')}
          </button>}
        </div>
      </section>
      {!connectedUser.isGuest && <div className="d-flex flex-row gap-3">
        <Tile
          width={20}
          title={translate('dashboard.demands.tile.title')}
          icon={<i className="fas fa-clock" />}
          query={dashboardQuery}
          reset={() => queryClient.invalidateQueries({ queryKey: [`${connectedUser._id}-dashboard`] })}
          data={(data) => data.demands.waiting}
          action={() => navigate('/notifications?filter=[{"id":"unreadOnly","value":true},{"id":"type","value":["ApiSubscription"]}]')} />
        <Tile
          width={20}
          title={translate('dashboard.newly.created.apis.tile.title')}
          icon={<i className="fas fa-bolt" />}
          query={dashboardQuery}
          reset={() => queryClient.invalidateQueries({ queryKey: [`${connectedUser._id}-dashboard`] })}
          data={(data) => data.apis.newlyCreated}
        />
        <Tile
          width={30}
          title={translate('dashboard.deprecated.apis.tile.title')}
          secondaryDescription={(count) => translate({ key: 'dashboard.api.list.expires.subscription.tag.label', plural: count > 1 })}
          icon={<i className="fas fa-triangle-exclamation" />}
          query={dashboardQuery}
          reset={() => queryClient.invalidateQueries({ queryKey: [`${connectedUser._id}-dashboard`] })}
          data={(data) => data.apis.deprecated}
          dataSecondary={(data) => data.apis.deprecatedExpireSoon} />
        <Tile
          width={30}
          title={translate('dashboard.apikeys.tile.title')}
          secondaryDescription={(count) => translate({ key: 'dashboard.api.list.expires.subscription.tag.label', plural: count > 1 })}
          icon={<i className="fas fa-bolt" />}
          query={dashboardQuery}
          reset={() => queryClient.invalidateQueries({ queryKey: [`${connectedUser._id}-dashboard`] })}
          data={(data) => data.subscriptions.active}
          dataSecondary={(data) => data.subscriptions.expire} />

      </div>}
      <ApiList />
    </main>
  )
}