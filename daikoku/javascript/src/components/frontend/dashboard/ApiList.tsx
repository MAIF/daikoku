import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ColumnFiltersState, createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, PaginationState, useReactTable } from "@tanstack/react-table"
import classNames from "classnames"
import debounce from "lodash/debounce"
import {ChangeEvent, useContext, useMemo, useState} from "react"
import Plus from 'react-feather/dist/icons/plus'
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import Select, { StylesConfig, components, MultiValue } from "react-select"
import { toast } from "sonner"

import { I18nContext, ModalContext } from "../../../contexts"
import { GlobalContext } from "../../../contexts/globalContext"
import * as Services from '../../../services'
import { IApiAuthoWithCount, IApiWithAuthorization, TOption } from "../../../types"
import { isError } from "../../../types/api"
import { ActionWithTeamSelector, Option } from "../../utils"
import { arrayStringToTOps } from "../../utils/function"
import { api as API, CanIDoAction, manage } from "../../utils/permissions"
import { ApiFormRightPanel } from "../../utils/sidebar/panels/AddPanel"
import { Spinner } from "../../utils/Spinner"
import StarsButton from "../api/StarsButton"
import Pagination from "react-paginate";

//--- MARK: Types
type Option = {
  label: string;
  value: string;
};

type ApiListProps = {
  apiGroupId?: string
}
type ExtraProps = {
  labelKey: string;
  labelKeyAll: string;
  getCount: (data: string) => number
};

type ColourOption = {
   value: string;
   label: string;
   color?: string;
   isFixed?: boolean;
   isDisabled?: boolean;
}
const GenericPlaceholder = (props: any & { selectProps: ExtraProps }) => {
  const { translate } = useContext(I18nContext);
  const { selectProps } = props;
  const selectedValues: Option[] = selectProps.value ?? [];
  const nbValues = selectedValues.length;

  return (
    <components.Placeholder {...props}>
      {nbValues === 0 ? (
        <span>{translate(selectProps.labelKeyAll)}</span>
      ) : (
        <>
          <span>{translate({ key: selectProps.labelKey, plural: nbValues > 1 })}</span>
          <span className="ms-2 badge badge-custom">{nbValues}</span>
        </>
      )}
    </components.Placeholder>
  );
};

export const ApiList = (props: ApiListProps) => {

  const pageSize = 8;
  const [limit, _] = useState(pageSize);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

  const [inputVal, setInputVal] = useState("")

  const [producers, setProducers] = useState<Array<TOption>>([]);

  const [tags, setTags] = useState<Array<string>>([]);

  const defaultColumnFilters = [];
  const [searchParams] = useSearchParams();
  const initialFilters = useMemo(() => {
    const f = searchParams.get('filter');
    return f ? JSON.parse(decodeURIComponent(f)) : defaultColumnFilters;
  }, [searchParams]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialFilters)

  const navigate = useNavigate();

  const { tenant, customGraphQLClient, connectedUser, apiCreationPermitted } = useContext(GlobalContext)
  const { translate } = useContext(I18nContext)
  const { openRightPanel, openTeamSelectorModal } = useContext(ModalContext)

  // --- MARK: Queries
  const queryClient = useQueryClient()
  const myTeamsRequest = useQuery({ queryKey: ['myTeams'], queryFn: () => Services.myTeams() })
  // const dataTags = useQuery({
  //   queryKey: ["dataTags",
  //     researchTag,
  //     props.apiGroupId,
  //     searched
  //   ],
  //   queryFn: ({ queryKey }) => customGraphQLClient.request<{ allTags: Array<string> }>(
  //     Services.graphql.getAllTags,
  //     {
  //       research: queryKey[6],
  //       groupId: queryKey[2],
  //       selectedTag: queryKey[3],
  //       selectedCategory: queryKey[4],
  //       selectedTeam: queryKey[5],
  //       filter: queryKey[1],
  //       limit: 5
  //     }
  //   ).then(({ allTags }) => {
  //     setTags(arrayStringToTOps(allTags))
  //     return arrayStringToTOps(allTags)
  //   })
  // })

  const askForApiAccess = (apiWithAuth: IApiWithAuthorization, teams: string[]) =>
    Services.askForApiAccess(teams, apiWithAuth.api._id)
      .then(() => {
        toast.info(translate({ key: 'ask.api.access.info', replacements: [apiWithAuth.api.name] }));
        if (dataRequest.data) {
          queryClient.invalidateQueries({ queryKey: ['data'] })
        }
      });

  const [page, setPage] = useState(0);

  const handlePageClick = (data) => {
    setPage(data.selected);
    setOffset(data.selected)
  };
  const [offset, setOffset] = useState<number>(0)

  const dataRequest = useQuery({
    queryKey: ["listOfMyVisiblesApis", limit, columnFilters, offset],
    queryFn: () => {
      return customGraphQLClient.request<{ visibleApis: IApiAuthoWithCount }>(
        Services.graphql.myVisibleApis,
        {
          filterTable: JSON.stringify(columnFilters),
          sortingTable: JSON.stringify([]),
          groupId: props.apiGroupId,
          limit,
          offset: page * limit,
        }
      ).then(({ visibleApis }) => {
        setProducers(visibleApis.producers
          .map(p => ({ label: p.team.name, value: p.team._id }))
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })))
        setTags(visibleApis.tags.map(p => p.value))
        return visibleApis
      })
  }}
  )
  // --- MARK: Table
  const columnHelper = createColumnHelper<IApiWithAuthorization>();
  const columns = [
    // columnHelper.display({
    //   id: 'select',
    //   header: ({ table }) => (
    //     <input
    //       type="checkbox"
    //       checked={table.getIsAllRowsSelected()}
    //       onChange={table.getToggleAllRowsSelectedHandler()}
    //     />
    //   ),
    //   cell: ({ row }) => (
    //     <input
    //       type="checkbox"
    //       checked={row.getIsSelected()}
    //       disabled={!row.getCanSelect()}
    //       onChange={row.getToggleSelectedHandler()}
    //     />
    //   ),
    // }),
    columnHelper.display({
      id: 'favorite',
      enableColumnFilter: false,
      meta: { className: "favorite-cell" },
      cell: (info) => {
        const api = info.row.original.api;
        const myTeams = !isError(myTeamsRequest.data) && myTeamsRequest.data ? myTeamsRequest.data : []
        const starred = connectedUser.starredApis.includes(api._id)
        const authorizations = info.row.original.authorizations
        const allTeamsAreAuthorized =
          api.visibility === 'Public' || (authorizations.length === myTeams.length && authorizations.every((a) => a.authorized));
        const isPending =
          authorizations.length === myTeams.length && authorizations.every((a) => a.pending && !a.authorized);
        const accessButton = () => {
          if (
            !allTeamsAreAuthorized &&
            !['Private', 'AdminOnly'].includes(api.visibility)
          ) {
            return (
              <ActionWithTeamSelector
                title={translate("api.access.modal.title")}
                description={translate({ key: 'api.access.request', replacements: [api.name] })}
                pendingTeams={authorizations.filter((auth: any) => auth.pending).map((auth: any) => auth.team)}
                acceptedTeams={authorizations
                  .filter((auth) => auth.authorized)
                  .map((auth) => auth.team)}
                teams={myTeams?.filter((t) => t.type !== 'Admin')}
                action={(teams) => askForApiAccess(info.row.original, teams)}
                actionLabel={translate("Ask access to API")}
                allTeamSelector={true}
              >
                {isPending ? (
                  <button className="btn btn-sm btn-outline-info">
                    {translate('Pending request')}
                  </button>
                ) : (
                  <button className="btn btn-sm btn-outline-info">
                    <i className="far fa-comment-dots me-2" />{translate('Access')}
                  </button>
                )}
              </ActionWithTeamSelector>
            );
          }
          return null;
        };

        return (
          <div className='notification__actions d-flex flex-row gap-1 justify-content-end'>
            {/*{accessButton()}*/}
            <StarsButton
              starred={starred}
              classnames="notification-link-color"
              toggleStar={() => Services.toggleStar(api._id)}
            />
          </div>
        )
      },
    })
    ,
    // columnHelper.display({
    //   id: 'select',
    //   meta: { className: "select-cell" },
    //   cell: ({ row }) => {
    //     const notification = row.original;
    //     if (row.getCanSelect())
    //       return (
    //         <>
    //           <input
    //             type="checkbox"
    //             className={classNames('form-check-input select-input')}
    //             checked={row.getIsSelected() || row.getCanSelect() && selectAll}
    //             disabled={!row.getCanSelect()}
    //             onChange={row.getToggleSelectedHandler()}
    //           />
    //           <span className={classNames('indicator flex-grow-1 d-flex justify-content-end')} />
    //         </>
    //       )
    //   }
    // }),
    columnHelper.display({
      id: 'api',
      meta: { className: "api-cell" },
      cell: (info) => {
        const api = info.row.original.api;
        const authorizations = info.row.original.authorizations;
        const isApiGroup = !!info.row.original.api.apis?.length;
        const path = isApiGroup ? 'apis' : 'description';
        if (api.visibility === 'Public' || authorizations.some((a) => a.authorized)) {
          return <Link id={`api-${api._humanReadableId}`} to={`/${api.team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/${path}`}>
            {api.name}
          </Link>
        } else {
          return <p id={`api-${api._humanReadableId}`}>{api.name}</p>
        }
      }
    }),
    columnHelper.accessor('api.tags', {
      id: 'tags',
      meta: { className: "tags-cell" },
      // enableColumnFilter: true,
      cell: (info) => {
        const tags = info.getValue();
        return (
          <div className="d-flex gap-1">
            {tags.map((tag, idx) => {
              return (
                <span key={`${tag}-${idx}`} onClick={() => handleSelectChange([{ label: tag, value: tag }], 'tag')}
                  className={`badge badge-custom-primary`} style={{fontWeight:"normal"}}>
                  {tag}
                </span>
              )
            })}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'team',
      meta: { className: "team-cell" },
      cell: (info) => {
        const team = info.row.original.api.team;

        return <a href='#' onClick={() => handleSelectChange([{ label: team.name, value: team._id }], 'team')}>
          {team.name}
        </a>
      }
    }),
    columnHelper.display({
      id: 'Status',
      meta: { className: "status-cell" },
      cell: (info) => {

        const api = info.row.original.api
        const apiState = info.row.original.api.state
        return <div className="d-flex gap-1 status ">
          {(apiState === 'published' || apiState == 'created') &&
            <span
              className="badge badge-custom-success d-flex align-items-center gap-2"
              style={{ border: 'none'}}
              onClick={() => navigate(`/${api.team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/apikeys`)}>
              {/*<span className="bg-success rounded-circle"></span>*/}
              <span>{translate("api.published")}</span>
            </span>}
          { apiState == 'deprecated' &&
            <span
            className="badge badge-custom-warning d-flex align-items-center gap-2"
            style={{ border: 'none'}}
            onClick={() => navigate(`/${api.team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/apikeys`)}>
              {/*<span className="bg-warning rounded-circle"></span>*/}
              <span>{translate("api.deprecated")}</span>
            </span>
            }
          {(apiState == 'blocked' || apiState == 'deleted')  &&
            <span
              className="badge badge-custom-danger d-flex align-items-center gap-2"
              style={{ border: 'none'}}>
              {/*<span className="bg-danger rounded-circle"></span>*/}
              <span>{translate("api.blocked")}</span>
            </span>
          }
          {(!apiState)  &&
            <span
              className="badge badge-custom-info d-flex align-items-center gap-2"
              style={{ border: 'none'}}>
              {/*<span className="bg-info rounded-circle"></span>*/}
              <span>{"Stateless"}</span>
            </span>
          }
        </div>
      }
    }),
    columnHelper.display({
      id: translate("dashboard.apis.table.header.label.subscriptions"),
      meta: { className: "subscription-cell d-flex gap-2 align-items-center" },
      cell: (info) => {
        const subscriptionCount = info.row.original.subscriptionCount;
        const subscriptionDemandsCount = info.row.original.subscriptionDemands.length
        return (
        <>
          <a href='#' onClick={() => handleSelectChange([{ label: "subscriptionCount", value: subscriptionCount.toString() }], 'subscriptions')}>
            {`${subscriptionCount} ${translate({ key: 'dashboard.apis.table.header.label.subscriptions.cells' })}${subscriptionCount > 1 || subscriptionCount == 0 ? 's' : ''}`}
          </a>
          {subscriptionDemandsCount > 0 &&
          <span className="badge badge-custom-demands-subscription">{subscriptionDemandsCount} en attente</span>}
        </>)
      }
    })
    //,
    // columnHelper.display({
    //   id: 'action',
    //   enableColumnFilter: false,
    //   meta: { className: "action-cell" },
    //   cell: (info) => {
    //     const api = info.row.original.api;
    //     const myTeams = !isError(myTeamsRequest.data) && myTeamsRequest.data ? myTeamsRequest.data : []
    //
    //     const starred = connectedUser.starredApis.includes(api._id)
    //     const authorizations = info.row.original.authorizations
    //     const allTeamsAreAuthorized =
    //       api.visibility === 'Public' || (authorizations.length === myTeams.length && authorizations.every((a) => a.authorized));
    //     const isPending =
    //       authorizations.length === myTeams.length && authorizations.every((a) => a.pending && !a.authorized);
    //
    //
    //     // const accessButton = () => {
    //     //   if (
    //     //     !allTeamsAreAuthorized &&
    //     //     !['Private', 'AdminOnly'].includes(api.visibility)
    //     //   ) {
    //     //     return (
    //     //       <ActionWithTeamSelector
    //     //         title={translate("api.access.modal.title")}
    //     //         description={translate({ key: 'api.access.request', replacements: [api.name] })}
    //     //         pendingTeams={authorizations.filter((auth: any) => auth.pending).map((auth: any) => auth.team)}
    //     //         acceptedTeams={authorizations
    //     //           .filter((auth) => auth.authorized)
    //     //           .map((auth) => auth.team)}
    //     //         teams={myTeams?.filter((t) => t.type !== 'Admin')}
    //     //         action={(teams) => askForApiAccess(info.row.original, teams)}
    //     //         actionLabel={translate("Ask access to API")}
    //     //         allTeamSelector={true}
    //     //       >
    //     //         {isPending ? (
    //     //
    //     //
    //     //           <button className="btn btn-sm btn-outline-info">
    //     //             {translate('Pending request')}
    //     //           </button>
    //     //         ) : (
    //     //           <button className="btn btn-sm btn-outline-info">
    //     //             <i className="far fa-comment-dots me-2" />{translate('Access')}
    //     //           </button>
    //     //         )}
    //     //       </ActionWithTeamSelector>
    //     //     );
    //     //   }
    //     //   return null;
    //     // };
    //
    //     return (
    //
    //       <div className="nav_item dropdown">
    //         <button type="button" className='btn btn-outline-secondary btn-icon d-flex align-items-center gap-2'
    //                 data-bs-toggle="dropdown" aria-expanded="false" aria-label={translate('dashboard.more.creation.option.button.label')}>
    //           <MoreVertical />
    //         </button>
    //         <div className="dropdown-menu">
    //           <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
    //             <div className="blocks">
    //               <div className="mb-3 block">
    //                 <div className="ms-2 block__entries block__border d-flex flex-column">
    //
    //                 </div>
    //               </div>
    //             </div>
    //           </div>
    //         </div>
    //       </div>
    //     )
    //   },
    // })
  ]
  const defaultData = useMemo(() => [], [])
  const table = useReactTable({
    data: dataRequest.data?.apis ?? defaultData,
    columns: columns,
    getRowId: row => row.api._id,
    rowCount: dataRequest.data?.apis.flatMap(
      (page) => page.api
    ).length ?? 0, //FIXME: better with totalFiltered like notification page
    state: {
      pagination,
      columnFilters
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    onColumnFiltersChange: setColumnFilters,
    getSortedRowModel: getSortedRowModel(),
    enableMultiRowSelection: true,
    enableSubRowSelection: true,
    enableRowSelection: true
  })

  //--- MARK: functions

  const handleSelectChange = (data: MultiValue<Option>, id: string) => {
    const filters = columnFilters.filter(f => f.id !== id)

    setColumnFilters([...filters, { id, value: data.map(d => d.value) }])
  }

  const debouncedResults = useMemo(() => {
    return debounce((e: ChangeEvent<HTMLInputElement>) => {
      setColumnFilters(prev => {
        const filters = prev.filter(f => f.id !== 'research')
        return [...filters, { id: 'research', value: e.target.value }]
      })
    }, 500);
  }, []);

  const createApi = ({ teamId, isApiGroup = false }: { teamId?: string, isApiGroup?: boolean }) => {
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
          actionLabel: translate('Create')
        });
      } else {
        const team = myTeamsRequest.data.find((t) => teamId === t._id);

        if (!team) {
          toast.warning('toast.no.team.found')
        } else {
          return openRightPanel({
            title: isApiGroup ? translate('apigroup.creation.right.panel.title') : translate('api.creation.right.panel.title'),
            content: <ApiFormRightPanel team={team} apigroup={isApiGroup} handleSubmit={(api) => Services.createTeamApi(team._id, api)
              .then((maybeApi) => {
                queryClient.invalidateQueries({ queryKey: ["data"] })
                return maybeApi
              })
              .then((maybeApi) => {
                toast.success(translate({ key: "api.created.successful.toast", replacements: [api.name] }))
                return maybeApi
              })
              .then((maybeApi) => {
                if (!isError(maybeApi)) {
                  navigate(`/${team._humanReadableId}/${maybeApi._humanReadableId}/${maybeApi.currentVersion}/description`)
                }
              })
            } />
          })
        }
      }
    }
  };

  const getSelectValue = <T extends object>(id: string, data: Array<T>, labelKey: string, idKey: string): Array<{ label: string, value: string }> => {
    const filter = columnFilters.find(f => f.id === id);
    const selectedValues = filter?.value as Array<string> ?? [];
    return data
      .filter(t => selectedValues.includes(t[idKey]))
      .map(t => ({ label: t[labelKey], value: t[idKey] }));
  }

  const getSelectStringValue = (id: string, data: Array<string>): Array<{ label: string, value: string }> => {
    const filter = columnFilters.find(f => f.id === id);
    const selectedValues = filter?.value as Array<string> ?? [];
    return data
      .filter(t => selectedValues.includes(t))
      .map(t => ({ label: t, value: t }));
  }

  //--- MARK: Rendering
  if (myTeamsRequest.isLoading) {
    return <Spinner />
  } else if (myTeamsRequest.data && !isError(myTeamsRequest.data)) {

    const subscribedOnly = !!columnFilters.find(f => f.id === 'subscribedOnly')?.value
    const canCreateApi = !connectedUser.isGuest && !props.apiGroupId && (!tenant.creationSecurity || myTeamsRequest.data.some(t => t.apisCreationPermission))
    const totalPages = Math.ceil((dataRequest.data?.total ?? 0) / limit);
    const colourStyles: StylesConfig<ColourOption, true> = {
      control: (styles) => ({ ...styles }),
      option: (styles, { isDisabled, isFocused, isSelected }) => {
        return {
          ...styles,
          backgroundColor: isDisabled
            ? undefined
            : isSelected
              ? 'white'
              : isFocused
                ? '#93c5fd'
                : 'white',
          color: isDisabled ? '#93c5fd' : 'black',
          cursor: isDisabled ? 'not-allowed' : 'defaults',

          ':active': {
            ...styles[':active'],
            backgroundColor: !isDisabled ? 'white' : undefined,
          },
        };
      },
      multiValue: (styles) =>  ({
        ...styles,
        backgroundColor: "#29438D",
      }),
      multiValueLabel: (styles) => ({
        ...styles,
        color: 'white',
      }),
      multiValueRemove: (styles, { data }) => ({
        ...styles,
        color: "white",
        ':hover': {
          backgroundColor: "#a9cbea",
          color: 'white',
        },
      }),
    };

    return (
      <div className="col-12 api_list_container">
        <div className='d-flex flex-row align-items-center justify-content-between'>
          <div className='d-flex align-items-center gap-3' aria-live="polite">
            <h2 className="api_list__title" id='notif-label'>
              {translate("dashboard.api.list.title")}
            </h2>
          </div>
          {canCreateApi && (
            <div className="d-flex gap-1">
              <button type="button" className='btn btn-outline-primary d-flex align-items-center gap-2' onClick={() => createApi({})}>
                <Plus />
                <p className="m-0">{translate('dashboard.create.api.button.label')}</p>
              </button>

              <div className="nav_item dropdown" style={{ color: '#fff' }}>
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
          )}
        </div>
        <div className="filter-container mt-3 d-flex justify-content-between">
          <div className="d-flex align-items-end gap-2 flex-grow-1">
            <div className="position-relative col-2">
              <input
                type="text"
                className="form-control pe-5"
                placeholder={translate('Search your API...')}
                aria-label="Search your API"
                value={inputVal}
                onChange={(e) => {
                  setInputVal(e.target.value)
                  debouncedResults(e)
                }}
              />
              <i
                className="fas fa-search position-absolute"
                style={{ right: '12px', top: '10%', marginTop: '7px' }}
              />
            </div>
              <Select
                isMulti //@ts-ignore
                className="basic-multi-select position-relative col-3"
                classNamePrefix="select"
                options={(producers)}
                isLoading={myTeamsRequest.isLoading || myTeamsRequest.isPending}
                closeMenuOnSelect={false}
                // styles={menuStyle}
                styles={colourStyles}
                onChange={data => handleSelectChange(data, 'team')}
                value={getSelectValue('team', producers, 'label', 'value')}/>
            <Select
              isMulti //@ts-ignore
              className="basic-multi-select position-relative col-3"
              classNamePrefix="select"
              options={arrayStringToTOps(tags)}
              isLoading={dataRequest.isLoading}
              closeMenuOnSelect={false}
              styles={colourStyles}
              onChange={data => handleSelectChange(data, 'tag')}
              value={getSelectStringValue('tag', tags)}/>
            <div className="position-relative  col-2">
              <div className="form-check form-switch">
                <input
                  className={classNames('form-check-input', {active: subscribedOnly})}
                  type="checkbox"
                  role="switch"
                  id="flexSwitchCheckDefault"
                  aria-pressed={subscribedOnly}
                  checked={columnFilters.some(f => f.id === 'subscribedOnly' && f.value)}
                  onClick={() => {
                    const isActive = columnFilters.some(f => f.id === 'subscribedOnly' && f.value);
                    setColumnFilters(
                      isActive
                        ? columnFilters.filter(f => f.id !== 'subscribedOnly')
                        : [...columnFilters.filter(f => f.id !== 'subscribedOnly'), { id: 'subscribedOnly', value: true }]
                    );
                  }}
                />
                <label className="form-check-label" htmlFor="flexSwitchCheckDefault">
                  {translate('dashboard.filters.subscribe.apis.only.label')}
                </label>
              </div>
            </div>

            {!!columnFilters.length &&
              <button className='btn btn-outline-secondary' onClick={() => setColumnFilters(defaultColumnFilters)}>
                <i className='fas fa-rotate me-2'/>
                {translate('notifications.page.filters.clear.label')}
              </button>}
          </div>
        </div>
        <div style={{color:"#8a8a8a", marginTop: '10px'}}>
          {
            table.getSelectedRowModel().rows.length !== 0 ? (
              <div className="d-flex" style={{backgroundColor:"lightgray"}}>
                <div className="p-2 flex-grow-1">
                  <strong>{table.getSelectedRowModel().rows.length}</strong>{translate({ key: "dashboard.apis.selected.count", replacements: [dataRequest.data ? dataRequest.data.totalFiltered.toString() : ""]})}
                </div>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => {}}>
                  <div className="d-flex gap-2 ">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor"
                       className="bi bi-key" viewBox="0 0 16 16">
                    <path
                      d="M0 8a4 4 0 0 1 7.465-2H14a.5.5 0 0 1 .354.146l1.5 1.5a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708 0L13 9.207l-.646.647a.5.5 0 0 1-.708 0L11 9.207l-.646.647a.5.5 0 0 1-.708 0L9 9.207l-.646.647A.5.5 0 0 1 8 10h-.535A4 4 0 0 1 0 8m4-3a3 3 0 1 0 2.712 4.285A.5.5 0 0 1 7.163 9h.63l.853-.854a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.793-.793-1-1h-6.63a.5.5 0 0 1-.451-.285A3 3 0 0 0 4 5"/>
                    <path d="M4 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/>
                  </svg>
                  {translate("dashboard.filters.selected.apis.apiKeys.subscribe.button")}
                  </div>
                </button>
              </div>
            ) : (
              getSelectValue('team', producers, 'label', 'value').length > 0 || getSelectValue('tags', producers, 'label', 'value').length > 0) ? (
              <div><strong>{dataRequest.data?.totalFiltered}</strong>{translate({ key: "dashboard.apis.filterd.count", replacements: [dataRequest.data ? dataRequest.data.total.toString() : ""]})}

              </div>
            ) : (
              <div><strong>{dataRequest.data?.totalFiltered}</strong> APIs</div>
            )
          }
        </div>
        <div className="table-container mt-3">
          {dataRequest.isLoading && <Spinner/>}

          {dataRequest.data && (
            <>
              <div className="api-table table-rows">
                <div className='select-all-row table-row table-header'>
                  {/*<input*/}
                  {/*  type="checkbox"*/}
                  {/*  checked={table.getIsAllRowsSelected()}*/}
                  {/*  onChange={table.getToggleAllRowsSelectedHandler()}*/}
                  {/*/>*/}
                   <span>{translate('')}</span>
                   <span>{translate('dashboard.apis.table.header.label.api')}</span>
                   <span>{translate('dashboard.apis.table.header.label.tags')}</span>
                   <span>{translate('dashboard.apis.table.header.label.team')}</span>
                   <span>{translate('dashboard.apis.table.header.label.status')}</span>
                   <span>{translate('dashboard.apis.table.header.label.subscriptions')}</span>
                   {/*<span className="text-end">{translate('dashboard.apis.table.header.label.actions')}</span>*/}
                </div>
                <ul className='table-rows' role="list">
                  {table.getRowModel().rows.map((row, idx) => {
                    return (
                      <li key={`${row.id}-${idx}`} tabIndex={-1} role="listitem" aria-labelledby={`api-${row.original.api._humanReadableId}`}>
                        <article className='table-row' aria-labelledby={`api-${row.original.api._humanReadableId}`}>
                          {row.getVisibleCells().map((cell, idx) => {
                            return (
                              <div key={`${cell.id}-${idx}`} className={cell.column.columnDef.meta?.className}>
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext()
                                )}
                              </div>
                            )
                          })}
                        </article>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <div className="apis__pagination d-flex justify-content-center align-items-center" style={{ width: '100%' }}>
                <Pagination
                  previousLabel={translate('Previous')}
                  nextLabel={translate('Next')}
                  breakLabel={'...'}
                  breakClassName={'break'}
                  pageCount={Math.ceil(dataRequest.data.total / limit)}
                  marginPagesDisplayed={1}
                  pageRangeDisplayed={5}
                  onPageChange={(data) => handlePageClick(data)}
                  containerClassName={'pagination'}
                  pageClassName={'page-selector'}
                  forcePage={page}
                  activeClassName={'active'} />
              </div>
              {/*<div className="mt-3 d-flex justify-content-center">*/}
              {/*  <nav aria-label="Page navigation example">*/}
              {/*    <ul className="pagination">*/}
              {/*      <li className="page-item">*/}
              {/*      <button className="page-link" onClick={() => setPage(p => p - 1)} disabled={page === 0}>*/}
              {/*        Précédent*/}
              {/*      </button>*/}
              {/*      </li>*/}
              {/*      {Array.from({ length: totalPages }, (_, i) => (*/}
              {/*        <button*/}
              {/*          key={i}*/}
              {/*          onClick={() => setPage(i)}*/}
              {/*          className={`page-link ${page === i ? 'page-link active' : 'page-link '}`}*/}
              {/*        >*/}
              {/*          {i + 1}*/}
              {/*        </button>*/}
              {/*      ))}*/}
              {/*      <li className="page-item">*/}
              {/*      <button className="page-link" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>*/}
              {/*        Suivant*/}
              {/*      </button>*/}
              {/*      </li>*/}

              {/*    </ul>*/}
              {/*  </nav>*/}
              {/*</div>*/}
            </>
          )}
        </div>
      </div>
    )
  } else {
    return ( //FIXME: alert with button to reload
      <div>oops</div>
    )
  }
}
