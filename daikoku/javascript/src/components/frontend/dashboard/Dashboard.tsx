import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useContext } from "react"
import { Link, useNavigate } from "react-router-dom"


import { I18nContext, ModalContext } from "../../../contexts"
import { GlobalContext } from "../../../contexts/globalContext"
import * as Services from '../../../services'
import { isError } from "../../../types"
import { ApiList } from "./ApiList"
import { toast } from "sonner"
import { manage, api as API, CanIDoAction } from "../../utils/permissions"
import { ApiFormRightPanel } from "../../utils/sidebar/panels"
import MoreVertical from "react-feather/dist/icons/more-vertical"

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
  const { tenant, connectedUser, unreadNotificationsCount, apiCreationPermitted } = useContext(GlobalContext)
  const { translate } = useContext(I18nContext)
  const { openTeamSelectorModal, openRightPanel } = useContext(ModalContext);

  const queryClient = useQueryClient();

  const navigate = useNavigate()

  const myTeamsRequest = useQuery({
    queryKey: ['myTeams'],
    queryFn: () => Services.myTeams(),
  });

  // const canCreateApi =
  //     !connectedUser.isGuest &&
  //     (!tenant.creationSecurity || myTeamsRequest.data.some(t => t.apisCreationPermission))

  const canCreateApi = true

  // ─── Create API ─────────────────────────────────────────────────────────

  const createApi = ({ teamId, isApiGroup = false }: { teamId?: string; isApiGroup?: boolean }) => {
    if (apiCreationPermitted && !myTeamsRequest.isLoading && myTeamsRequest.data && !isError(myTeamsRequest.data)) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translate('api.creation.title.modal'),
          description: translate('api.creation.description.modal'),
          teams: myTeamsRequest.data
            .filter((t) => t.type !== 'Admin')
            .filter((t) => !tenant.creationSecurity || t.apisCreationPermission)
            .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: (teams) => createApi({ teamId: teams[0], isApiGroup }),
          actionLabel: translate('Create'),
        })
      }
      const team = myTeamsRequest.data.find((t) => teamId === t._id)
      if (!team) {
        toast.warning('toast.no.team.found')
      } else {
        return openRightPanel({
          title: isApiGroup
            ? translate('apigroup.creation.right.panel.title')
            : translate('api.creation.right.panel.title'),
          content: (
            <ApiFormRightPanel
              team={team}
              apigroup={isApiGroup}
              handleSubmit={(api) =>
                Services.createTeamApi(team._id, api).then((maybeApi) => {
                  queryClient.invalidateQueries({ queryKey: ['apis'] })
                  toast.success(translate({ key: 'api.created.successful.toast', replacements: [api.name] }))
                  if (!isError(maybeApi)) {
                    navigate(`/${team._humanReadableId}/${maybeApi._humanReadableId}/${maybeApi.currentVersion}/description`)
                  }
                })
              }
            />
          ),
        })
      }
    }
  }


  return (
    <main className='flex-grow-1 d-flex flex-column gap-3 main' role="main" >
      <section className="">
        <div className="organisation__header d-flex flex-row justify-content-between align-items-start">
          <h1 className="jumbotron-heading fw-bold">
            {tenant.title ?? tenant.name}
          </h1>
          <div className="d-flex flex-column gap-3 justify-content-end">
            {!!unreadNotificationsCount && (
              <button
                onClick={() => navigate('/notifications?filter=[{"id":"unreadOnly","value":true},{"id":"type","value":["ApiSubscription","ApiAccess"]}]')}
                className="btn btn-outline-secondary">
                <div className="d-flex gap-2 align-items-center">
                  {translate('dashboard.demands.tile.title')}
                  <span className="number-indicator">{unreadNotificationsCount}</span>
                </div>
              </button>
            )}
            <div className="d-flex justify-content-end gap-1">
              <button type="button"
                className='btn btn-outline-primary d-flex align-items-center gap-2'
                onClick={() => createApi({})}>
                <p className="m-0">{translate('dashboard.create.api.button.label')}</p>
              </button>
              <div className="nav_item dropdown" style={{ color: '#fff' }}>
                <button type="button"
                  className='btn btn-outline-primary btn-icon d-flex align-items-center gap-2'
                  data-bs-toggle="dropdown" aria-expanded="false"
                  aria-label={translate('dashboard.more.creation.option.button.label')}>
                  <MoreVertical />
                </button>
                <div className="dropdown-menu">
                  <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
                    <div className="blocks">
                      <div className="mb-3 block">
                        <div className="ms-2 block__entries block__border d-flex flex-column">
                          <Link to={'#'} onClick={() => createApi({ isApiGroup: true })} className="block__entry__link">
                            {translate('dashboard.create.apigroup.button.label')}
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <h2 className="api_list__title" id='api-list-label'>
        {translate('dashboard.api.list.title')}
      </h2>
      <ApiList />
    </main>
  )
}
