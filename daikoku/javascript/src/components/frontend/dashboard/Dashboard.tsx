import { useQuery } from "@tanstack/react-query"
import { useContext } from "react"
import Clock from 'react-feather/dist/icons/clock'
import { useNavigate } from "react-router-dom"


import { I18nContext } from "../../../contexts"
import { GlobalContext } from "../../../contexts/globalContext"
import * as Services from '../../../services'
import { isError } from "../../../types"
import { ApiList } from "./ApiList"
import {Sliders} from "react-feather";

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
  const { tenant, connectedUser, isTenantAdmin } = useContext(GlobalContext)
  const { translate } = useContext(I18nContext)

  const navigate = useNavigate()

  const dashboardQuery = useQuery({
    queryKey: [`${connectedUser._id}-dashboard`],
    queryFn: () => Services.myDashboard()
  })

  return (
    <main className='flex-grow-1 d-flex flex-column gap-3 main' role="main" >
      <section className="">
        <div className="organisation__header d-flex flex-row space-between align-items-start">
          <h1 className="jumbotron-heading">
            {tenant.title ?? tenant.name}
          </h1>
          <div className="d-flex gap-3 justify-content-end flex-grow-1">
            {dashboardQuery.data && !isError(dashboardQuery.data) && !!dashboardQuery.data?.demands.waiting && (
              <button
                onClick={() => navigate('/notifications?filter=[{"id":"unreadOnly","value":true},{"id":"type","value":["ApiSubscription","ApiAccess"]}]')}
                className="btn btn-outline-secondary">
                <Clock className="me-2" />{translate('dashboard.demands.tile.title')}
              </button>
            )}
          </div>
        </div>
      </section>
      <ApiList />
    </main>
  )
}
