import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useContext, useMemo, useState } from "react"
import { MoreVertical } from "react-feather"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { I18nContext } from "../../../contexts"
import { GlobalContext } from "../../../contexts/globalContext"
import * as Services from '../../../services'
import { IApiAuthoWithCount, IApiWithAuthorization, TOption } from "../../../types"
import { isError } from "../../../types/api"
import { DynamicTable, FetchData, FetchResult, FilterDef } from "../../inputs/DynamicTable"
import { ActionWithTeamSelector } from "../../utils"
import { arrayStringToTOps } from "../../utils/function"
import { Spinner } from "../../utils/Spinner"
import StarsButton from "../api/StarsButton"

// ─── Types ───────────────────────────────────────────────────────────────────

type ApiListProps = {
  apiGroupId?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ApiList = (props: ApiListProps) => {
  const pageSize = 20;

  const { customGraphQLClient, connectedUser } = useContext(GlobalContext)
  const { translate } = useContext(I18nContext)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const myTeamsRequest = useQuery({
    queryKey: ['myTeams'],
    queryFn: () => Services.myTeams(),
  })

  // producers and tags are populated as a side-effect of fetchData
  const [producers, setProducers] = useState<Array<TOption>>([])
  const [tags, setTags] = useState<Array<string>>([])

  const askForApiAccess = (apiWithAuth: IApiWithAuthorization, teams: string[]) =>
    Services.askForApiAccess(teams, apiWithAuth.api._id).then(() => {
      toast.info(translate({ key: 'ask.api.access.info', replacements: [apiWithAuth.api.name] }))
      queryClient.invalidateQueries({ queryKey: ['apis'] })
    })

  // ─── Table columns ──────────────────────────────────────────────────────

  const columnHelper = createColumnHelper<IApiWithAuthorization>()

  const columns = useMemo(() => {
    const myTeams = myTeamsRequest.data && !isError(myTeamsRequest.data) ? myTeamsRequest.data : []

    return [
      columnHelper.display({
        id: 'favorite',
        enableColumnFilter: false,
        meta: { className: 'favorite-cell', title: translate(''), size: 1 },
        cell: (info) => {
          const api = info.row.original.api
          const starred = connectedUser.starredApis.includes(api._id)
          return (
            <div className='notification__actions d-flex flex-row gap-1 justify-content-end'>
              <StarsButton
                starred={starred}
                classnames="notification-link-color"
                toggleStar={() => Services.toggleStar(api._id)}
              />
            </div>
          )
        },
      }),
      columnHelper.display({
        id: 'api',
        meta: { className: 'api-cell', title: translate('dashboard.apis.table.header.label.api'), size: 15 },
        cell: (info) => {
          const api = info.row.original.api
          const authorizations = info.row.original.authorizations
          const isApiGroup = !!info.row.original.api.apis?.length
          const path = isApiGroup ? 'apis' : 'description'
          if (api.visibility === 'Public' || authorizations.some((a) => a.authorized)) {
            return (
              <div className="d-flex gap-2">
                <Link id={`api-${api._humanReadableId}`} to={`/${api.team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/${path}`}>
                  {api.name}
                </Link>
                {!!api.apis?.length && <span className="tag --primary --ghost">Groupe</span>}
              </div>
            )
          }
          return <div className="d-flex gap-2">
            <p id={`api-${api._humanReadableId}`}>{api.name}</p>
            {!!api.apis?.length && <span className="tag --primary --ghost">Groupe</span>}
          </div>
        },
      }),
      columnHelper.accessor('api.tags', {
        id: 'tags',
        meta: { className: 'tags-cell', title: translate('dashboard.apis.table.header.label.tags'), size: 15 },
        cell: (info) => (
          <div className="d-flex gap-1">
            {info.getValue().map((tag, idx) => (
              <span key={`${tag}-${idx}`}
                className="tag --primary"
                style={{ fontWeight: 'normal' }}
                onClick={() => {
                  // handled via filter toolbar; clicking badge is a shortcut
                }}>
                {tag}
              </span>
            ))}
          </div>
        ),
      }),
      columnHelper.display({
        id: 'team',
        meta: { className: 'team-cell', title: translate('dashboard.apis.table.header.label.team'), size: 15 },
        cell: (info) => {
          const team = info.row.original.api.team
          return <span>{team.name}</span>
        },
      }),
      columnHelper.display({
        id: 'Status',
        meta: { className: 'status-cell', title: translate('dashboard.apis.table.header.label.status'), size: 15 },
        cell: (info) => {
          const api = info.row.original.api
          const apiState = api.state
          return (
            <div className="d-flex gap-1 status">
              {(apiState === 'created') && (
                <span className="badge --inactive --state d-flex align-items-center gap-2" style={{ border: 'none' }}
                  onClick={() => navigate(`/${api.team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/apikeys`)}>
                  <span>{translate('api.created')}</span>
                </span>
              )}
              {(apiState === 'published') && (
                <span className="badge --success --state d-flex align-items-center gap-2" style={{ border: 'none' }}
                  onClick={() => navigate(`/${api.team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/apikeys`)}>
                  <span>{translate('api.published')}</span>
                </span>
              )}
              {apiState === 'deprecated' && (
                <span className="badge --warning --state d-flex align-items-center gap-2" style={{ border: 'none' }}
                  onClick={() => navigate(`/${api.team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/apikeys`)}>
                  <span>{translate('api.deprecated')}</span>
                </span>
              )}
              {(apiState === 'blocked') && (
                <span className="badge --inactive --state d-flex align-items-center gap-2" style={{ border: 'none' }}>
                  <span>{translate('api.blocked')}</span>
                </span>
              )}
              {!apiState && (
                <span className="badge --info --state d-flex align-items-center gap-2" style={{ border: 'none' }}>
                  <span>{'Stateless'}</span>
                </span>
              )}
            </div>
          )
        },
      }),
      columnHelper.display({
        id: translate('dashboard.apis.table.header.label.subscriptions'),
        meta: { className: 'subscription-cell d-flex gap-2 align-items-center', title: translate('dashboard.apis.table.header.label.subscriptions'), size: 15 },
        cell: (info) => {
          const subscriptionCount = info.row.original.subscriptionCount
          const subscriptionDemandsCount = info.row.original.subscriptionDemands.length
          return (
            <>
              <span>
                {`${subscriptionCount} ${translate({ key: 'dashboard.apis.table.header.label.subscriptions.cells' })}${subscriptionCount > 1 || subscriptionCount === 0 ? 's' : ''}`}
              </span>
              {subscriptionDemandsCount > 0 && (
                <span className="tag --warning">{subscriptionDemandsCount} en attente</span>
              )}
            </>
          )
        },
      }),
      columnHelper.display({
        id: 'action',
        enableColumnFilter: false,
        meta: { className: 'action-cell', title: translate('dashboard.apis.table.header.label.actions'), size: 1 },
        cell: (info) => {
          const api = info.row.original.api
          const authorizations = info.row.original.authorizations
          const allTeamsAreAuthorized =
            api.visibility === 'Public' ||
            (authorizations.length === myTeams.length && authorizations.every((a) => a.authorized))
          const isPending =
            authorizations.length === myTeams.length &&
            authorizations.every((a) => a.pending && !a.authorized)
          const canRequestAccess = !allTeamsAreAuthorized && !['Private', 'AdminOnly'].includes(api.visibility)
          return (
            <div className="nav_item dropdown">
              <button
                type="button"
                className="btn btn-outline-secondary btn-icon d-flex align-items-center gap-2"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                aria-label={translate('dashboard.more.creation.option.button.label')}
              >
                <MoreVertical size={16} />
              </button>
              <div className="dropdown-menu dropdown-menu-end">
                {canRequestAccess && (
                  <ActionWithTeamSelector
                    title={translate('api.access.modal.title')}
                    description={translate({ key: 'api.access.request', replacements: [api.name] })}
                    pendingTeams={authorizations.filter((a: any) => a.pending).map((a: any) => a.team)}
                    acceptedTeams={authorizations.filter((a) => a.authorized).map((a) => a.team)}
                    teams={myTeams.filter((t) => t.type !== 'Admin')}
                    action={(teams) => askForApiAccess(info.row.original, teams)}
                    actionLabel={translate('Ask access to API')}
                    allTeamSelector={true}
                  >
                    <button className="dropdown-item">
                      <i className="far fa-comment-dots me-2" />
                      {isPending ? translate('Pending request') : translate('Access')}
                    </button>
                  </ActionWithTeamSelector>
                )}
              </div>
            </div>
          )
        },
      }),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTeamsRequest.data, connectedUser.starredApis])

  // ─── fetchData ──────────────────────────────────────────────────────────

  const fetchData: FetchData<IApiWithAuthorization> = ({ limit, offset, filters, sorting }) =>
    customGraphQLClient
      .request<{ visibleApis: IApiAuthoWithCount }>(Services.graphql.myVisibleApis, {
        filterTable: JSON.stringify(filters),
        sortingTable: JSON.stringify(sorting),
        groupId: props.apiGroupId,
        limit,
        offset,
      })
      .then(({ visibleApis }): FetchResult<IApiWithAuthorization> => {
        setProducers(
          visibleApis.producers
            .map(p => ({ label: p.team.name, value: p.team._id }))
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
        )
        setTags(visibleApis.tags.map(p => p.value))
        return {
          items: visibleApis.apis,
          total: visibleApis.total,
          totalFiltered: visibleApis.totalFiltered,
        }
      })

  // ─── Filters ────────────────────────────────────────────────────────────

  const filters: FilterDef[] = [
    {
      id: 'research',
      type: 'text',
      placeholder: translate('Search your API...'),
      debounceMs: 500,
    },
    {
      id: 'team',
      type: 'multiselect',
      labelKey: 'notifications.page.filters.team.label',
      labelKeyAll: 'notifications.page.filters.all.team.label',
      options: producers,
      isLoading: myTeamsRequest.isLoading,
    },
    {
      id: 'tag',
      type: 'multiselect',
      labelKey: 'dashboard.filters.tag.label',
      labelKeyAll: 'dashboard.filters.all.tags.label',
      options: arrayStringToTOps(tags),
    },
    {
      id: 'subscribedOnly',
      type: 'boolean',
      style: 'checkbox',
      onLabel: translate('dashboard.filters.subscribe.apis.only.label'),
      offLabel: translate('dashboard.filters.all.apis.label'),
    },
  ]

  // ─── Render ─────────────────────────────────────────────────────────────

  if (myTeamsRequest.isLoading) return <Spinner />
  if (!myTeamsRequest.data || isError(myTeamsRequest.data)) return <div>oops</div>

  return (
    <DynamicTable<IApiWithAuthorization>
      queryKey={['apis']}
      columns={columns}
      fetchData={fetchData}
      filters={filters}
      pageSize={pageSize}
      getRowId={row => row.api._id}
      countLabelKey="API"
    />
  )
}
