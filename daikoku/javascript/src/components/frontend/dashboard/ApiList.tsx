import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { ColumnFiltersState, createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, PaginationState, useReactTable } from "@tanstack/react-table"
import classNames from "classnames"
import { addMonths, isBefore } from 'date-fns'
import debounce from "lodash/debounce"
import { ChangeEvent, useContext, useMemo, useState } from "react"
import Plus from 'react-feather/dist/icons/plus'
import Unlock from 'react-feather/dist/icons/unlock'
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import Select, { components, MultiValue, OptionProps, ValueContainerProps } from "react-select"
import { toast } from "sonner"

import { I18nContext, ModalContext } from "../../../contexts"
import { GlobalContext } from "../../../contexts/globalContext"
import * as Services from '../../../services'
import { IApiAuthoWithCount, IApiWithAuthorization, ITeamSimple, TOption } from "../../../types"
import { isError } from "../../../types/api"
import { ActionWithTeamSelector, Option } from "../../utils"
import { FeedbackButton } from "../../utils/FeedbackButton"
import { arrayStringToTOps } from "../../utils/function"
import { api as API, CanIDoAction, manage } from "../../utils/permissions"
import { ApiFormRightPanel } from "../../utils/sidebar/panels/AddPanel"
import { Spinner } from "../../utils/Spinner"
import StarsButton from "../api/StarsButton"

//--- MARK: Types
type Option = {
  label: string;
  value: string;
};

type ApiListProps = {
  apiGroupId?: string
  teamId?: string
}
type ExtraProps = {
  labelKey: string;
  labelKeyAll: string;
  getCount: (data: string) => number
};

const GenericValueContainer = (
  props: ValueContainerProps<Option, true> & { selectProps: ExtraProps }
) => {
  const { translate } = useContext(I18nContext);

  const { getValue, hasValue, selectProps } = props;
  const selectedValues = getValue();
  const nbValues = selectedValues.length;

  const label = translate({ key: selectProps.labelKey, plural: nbValues > 1 })
  return (
    <components.ValueContainer {...props}>
      {!hasValue || nbValues === 0 ? (
        translate(selectProps.labelKeyAll)
      ) : (
        <>
          {label}
          <span className="ms-2 badge badge-custom">{nbValues}</span>
        </>
      )}
    </components.ValueContainer>
  );
};

export const ApiList = (props: ApiListProps) => {

  const pageSize = 3;
  const [selectAll, setSelectAll] = useState(false);
  const [limit, setLimit] = useState(pageSize);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

  const [searched, setSearched] = useState("");
  const [inputVal, setInputVal] = useState("")
  const [apisWithAuth, setApisWithAuth] = useState<IApiWithAuthorization[]>()

  const [producers, setProducers] = useState<Array<TOption>>([]);
  const [selectedProducer, setSelectedProducer] = useState<TOption | undefined>();
  const [selectedTag, setSelectedTag] = useState<TOption | undefined>(undefined);
  const [selectedCategory, setSelectedCategory] = useState<TOption | undefined>(undefined);

  const [researchTag, setResearchTag] = useState("");
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

  const dataRequest = useInfiniteQuery({
    queryKey: ["data",
      limit,
      columnFilters
    ],
    queryFn: ({ pageParam = 0 }) => {
      return customGraphQLClient.request<{ visibleApis: IApiAuthoWithCount }>(
        Services.graphql.myVisibleApis,
        {
          filterTable: JSON.stringify(columnFilters),
          sortingTable: JSON.stringify([]),
          limit,
          offset: pageParam,
        })
        .then(({ visibleApis }) => {
          setApisWithAuth(visibleApis.apis)
          setProducers(visibleApis.producers.map(p => ({ label: p.team.name, value: p.team._id })))
          setTags(visibleApis.tags.map(p => p.value))
          return visibleApis
        })
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const totalFilteredCount = lastPage.totalFiltered;
      const nextOffset = pages.length * pageSize;

      return nextOffset < totalFilteredCount ? nextOffset : undefined;
    },
    gcTime: 0
  })

  // --- MARK: Table
  const columnHelper = createColumnHelper<IApiWithAuthorization>();
  const columns = [
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

        return <Link to={`/${api.team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/description`}>
          {api.name}
        </Link>
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
                  className={`badge badge-custom-custom`}>
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
        const activeCount = info.row.original.subscriptions.length
        const pendingCount = info.row.original.subscriptionDemands.length
        const expireCount = info.row.original.subscriptions
          .filter(s => s.validUntil)
          .filter(s => isBefore(new Date(s.validUntil!), addMonths(new Date(), 1))).length

        return <div className="d-flex gap-1">
          {!!activeCount && <span className="badge badge-custom-success" onClick={() => navigate(`/${api.team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/apikeys`)}>
            {translate({ key: 'dashboard.api.list.actives.subscription.tag.label', replacements: [activeCount.toString()], plural: activeCount > 1 })}
          </span>}
          {!!expireCount && <span className="badge badge-custom-danger" onClick={() => navigate(`/${api.team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/apikeys`)}>
            {translate({ key: 'dashboard.api.list.expires.subscription.tag.label', replacements: [expireCount.toString()], plural: expireCount > 1 })}
          </span>}
          {!!pendingCount && <span className="badge badge-custom-warning">
            {translate({ key: 'dashboard.api.list.pending.subscription.tag.label', replacements: [pendingCount.toString()], plural: pendingCount > 1 })}
          </span>}
        </div>

      }
    }),
    columnHelper.display({
      id: 'action',
      enableColumnFilter: false,
      meta: { className: "action-cell" },
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
            {accessButton()}
            <StarsButton
              starred={starred}
              classnames="notification-link-color"
              toggleStar={() => Services.toggleStar(api._id)}
            />
            {/* <button
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
              className="cursor-pointer notification-link-color"
              style={{ border: 'none', background: 'none' }}
              id="dropdownMenuButton" >
              <i
                className="fas fa-ellipsis-vertical cursor-pointer"
                style={{ fontSize: '20px' }}

              />
            </button> */}
            {/* <div className="dropdown-menu" aria-labelledby="dropdownMenuButton" style={{ zIndex: 1 }}>
              <span
                className="dropdown-item cursor-pointer"
                onClick={() => console.debug('test')}
              >
                {translate("un menu qui fait quelque chose")}
              </span>
            </div> */}
          </div>
        )
      },
    })
  ]
  const defaultData = useMemo(() => [], [])
  const table = useReactTable({
    data: dataRequest.data?.pages.flatMap(
      (page) => page.apis
    ) ?? defaultData,
    columns: columns,
    getRowId: row => row.api._id,
    rowCount: dataRequest.data?.pages.flatMap(
      (page) => page.apis
    ).length ?? 0, //FIXME: better with totalFiltered like notification page
    state: {
      pagination,
      //columnFilters,
      // sorting
    },
    onPaginationChange: setPagination,
    // onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    onColumnFiltersChange: setColumnFilters,
    // getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSubRowSelection: true,
    enableRowSelection: row => {
      const notification = row.original;
      return false;
      // return notification.status.status === 'Pending' && notification.notificationType.value === 'AcceptOnly';
    },
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

  const createApi = (teamId?: string) => {
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
          action: (teams) => createApi(teams[0]),
          actionLabel: translate('Create')
        });
      } else {
        const team = myTeamsRequest.data.find((t) => teamId === t._id);

        if (!team) {
          toast.warning('toast.no.team.found')
        } else {
          return openRightPanel({
            title: translate('api.creation.right.panel.title'),
            content: <ApiFormRightPanel team={team} apigroup={false} handleSubmit={(api) => Services.createTeamApi(team._id, api)
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

  const getTotalForTeam = (teamId: string) => {
    return Option(dataRequest.data?.pages[0].producers.find(t => t.team._id === teamId))
      .map(team => team.total)
      .getOrNull()
  }

  const getTotalForTags = (tag: string) => {
    return Option(dataRequest.data?.pages[0].tags.find(t => t.value === tag))
      .map(tag => tag.total)
      .getOrNull()
  }


  const menuStyle = {
    MenuPortal: (base) => ({ ...base, zIndex: 9999 }),
    menu: (base) => ({
      ...base,
      width: 'max-content',
      minWidth: '100%',
      zIndex: 100,
    }),
    menuList: (base) => ({
      ...base,
      whiteSpace: 'nowrap',
    }),
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

  const CustomOption = (props: OptionProps<Option, true> & { selectProps: ExtraProps }) => {
    const { data, innerRef, innerProps } = props;
    const total = props.selectProps.getCount(data.value)

    return (
      <div ref={innerRef} {...innerProps} className="d-flex justify-content-between align-items-center px-3 py-2 cursor-pointer select-menu-item gap-2">
        <span>{data.label}</span>

        {!!total && <span className="badge badge-custom-warning">
          {total}
        </span>}
      </div>
    );
  };

  const clearFilter = (id: string, value: string) => {
    const columnFilterValues = columnFilters.find(c => c.id === id)?.value as Array<string> ?? []
    setColumnFilters([...columnFilters.filter(c => c.id !== id), { id, value: columnFilterValues.filter(v => v !== value) }])
  }

  const displayFilters = () => {
    if (!columnFilters.length) {
      return null
    } else {
      const filterOrder = ['research', 'team', 'tag']

      const myTeams = myTeamsRequest.data as ITeamSimple[]


      return (
        <div className='mt-2 d-flex flex-wrap flex-row gap-2'>
          {columnFilters
            .sort((a, b) => filterOrder.indexOf(a.id) - filterOrder.indexOf(b.id))
            .flatMap(f => {
              switch (true) {
                case f.id === 'team':
                  return ((f.value as Array<string>)
                    .map(value => {
                      const teamName = myTeams.find(t => t._id === value)?.name;
                      return (
                        <button className='selected-filter d-flex gap-2 align-items-center' onClick={() => clearFilter(f.id, value)}>
                          {teamName}
                          <i className='fas fa-xmark' />
                        </button>
                      )
                    }))
                case f.id === 'tag':
                  return ((f.value as Array<string>)
                    .map(tag => {
                      return (
                        <button className='selected-filter d-flex gap-2 align-items-center' onClick={() => clearFilter(f.id, tag)}>
                          {tag}
                          <i className='fas fa-xmark' />
                        </button>
                      )
                    }))
              }
            })}
        </div>
      )
    }
  }


  //--- MARK: Rendering
  if (myTeamsRequest.isLoading) {
    return <Spinner />
  } else if (myTeamsRequest.data && !isError(myTeamsRequest.data)) {

    const subscribedOnly = !!columnFilters.find(f => f.id === 'subscribedOnly')?.value
    const canCreateApi = !tenant.creationSecurity || myTeamsRequest.data.some(t => t.apisCreationPermission)

    return (
      <div className="col-12 api_list_container">
        <div className='d-flex flex-row align-items-center justify-content-between'>
          <div className='d-flex align-items-center gap-3' aria-live="polite">
            <h2 className="api_list__title" id='notif-label'>
              Liste des APIs
            </h2>
          </div>
          {canCreateApi && (
            <button type="button" className='btn btn-outline-info d-flex align-items-center gap-2' onClick={() => createApi()}>
              <Plus />
              <p className="m-0">{translate('dashboard.create.api.button.label')}</p>
            </button>
          )}
        </div>
        <div className="filter-container mt-3 d-flex justify-content-between">
          <div className="d-flex align-items-center gap-2 flex-grow-1">
            <div className="col-2">
              <input
                type="text"
                className="form-control"
                placeholder={translate('Search your API...')}
                aria-label="Search your API"
                value={inputVal}
                onChange={(e) => {
                  setInputVal(e.target.value)
                  debouncedResults(e)
                }}
              />
            </div>
            <Select
              isMulti //@ts-ignore
              components={{ ValueContainer: GenericValueContainer, Option: CustomOption }}
              options={(producers)}
              isLoading={myTeamsRequest.isLoading || myTeamsRequest.isPending}
              closeMenuOnSelect={true}
              labelKey={"dashboard.filters.team.label"}
              labelKeyAll={"dashboard.filters.all.team.label"}
              getCount={getTotalForTeam}
              classNamePrefix="daikoku-select"
              className="team__selector filter__select reactSelect col-2"
              styles={menuStyle}
              onChange={data => handleSelectChange(data, 'team')}
              value={getSelectValue('team', producers, 'name', '_id')} />

            <Select
              isMulti //@ts-ignore
              components={{ ValueContainer: GenericValueContainer, Option: CustomOption }}
              options={arrayStringToTOps(tags)}
              isLoading={dataRequest.isLoading}
              closeMenuOnSelect={true}
              labelKey={"dashboard.filters.tag.label"}
              labelKeyAll={"dashboard.filters.all.tags.label"}
              getCount={getTotalForTags}
              classNamePrefix="daikoku-select"
              className="tag__selector filter__select reactSelect col-2"
              styles={menuStyle}
              onChange={data => handleSelectChange(data, 'tag')}
              value={getSelectStringValue('tag', tags)} />


            <button
              className={classNames('btn btn-outline-secondary', { active: subscribedOnly })}
              aria-pressed={subscribedOnly}
              onClick={() => {
                const filters = columnFilters.filter(f => f.id !== 'subscribedOnly')
                setColumnFilters([...filters, { id: 'subscribedOnly', value: true }])
              }}>{translate('API souscrite seulement')}
            </button>

            {/* TODO: display button only of filter active */}
            <button className='btn btn-outline-secondary' onClick={() => setColumnFilters(defaultColumnFilters)}>
              <i className='fas fa-rotate me-2' />
              {translate('notifications.page.filters.clear.label')}
            </button>
          </div>

          <div className="">{dataRequest.data?.pages[0].totalFiltered} APIs</div>

        </div>
        {displayFilters()}
        <div className="table-container mt-3">
          {dataRequest.isLoading && <Spinner />}
          {dataRequest.data && (
            <>
              <div className="api-table table-rows">
                <div className='select-all-row table-row'>
                  {/* <label className='notification-table-header'>
                        <input
                          type="checkbox"
                          aria-label={translate('notifications.page.table.select.all.label')}
                          className='form-check-input'
                          checked={table.getIsAllPageRowsSelected()}
                          onChange={(e) => {
                            if (selectAll)
                              setSelectAll(!selectAll)
                            table.getToggleAllPageRowsSelectedHandler()(e)
                          }}
                        />
  
                      </label> */}
                  {/* {(table.getIsSomeRowsSelected() || table.getIsAllRowsSelected()) ? translate({ key: "notifications.page.table.selected.count.label", plural: (selectAll ? totalSelectable : table.getSelectedRowModel().rows.length) > 1, replacements: [selectAll ? `${totalSelectable}` : `${table.getSelectedRowModel().rows.length}`] }) : null} */}
                  {/* {(!!totalSelectable && (table.getIsSomeRowsSelected() || table.getIsAllRowsSelected()) || selectAll) && (
                        <button className='ms-2 btn btn-sm btn-outline-secondary' onClick={handleBulkRead}>{translate('notifications.page.table.read.bulk.action.label')}</button>
                      )} */}
                  {/* {!selectAll && table.getIsAllPageRowsSelected() && table.getSelectedRowModel().rows.length < totalSelectable && (
                        <button className='btn btn-sm btn-outline-secondary ms-3' onClick={() => setSelectAll(true)}>{translate({ key: 'notifications.page.table.select.really.all.label', replacements: [totalSelectable.toLocaleString()] })}</button>
                      )} */}
                  {(!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) && <span>{translate('dashboard.apis.table.header.label.api')}</span>}
                  {(!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) && <span>{translate('dashboard.apis.table.header.label.tags')}</span>}
                  {(!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) && <span>{translate('dashboard.apis.table.header.label.team')}</span>}
                  {(!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) && <span>{translate('dashboard.apis.table.header.label.status')}</span>}
                  {(!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) && <span className="text-end">{translate('dashboard.apis.table.header.label.actions')}</span>}
                </div>
                <ul className='table-rows'>
                  {table.getRowModel().rows.map((row, idx) => {
                    return (
                      <li key={`${row.id}-${idx}`} tabIndex={-1}>
                        <article className='table-row' aria-label={row.original.api.name}>
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
              <div className="mt-3 d-flex justify-content-center">
                {dataRequest.hasNextPage && (
                  <FeedbackButton
                    type="info"
                    className="a-fake"
                    onPress={() => dataRequest.fetchNextPage()}
                    feedbackTimeout={300}
                    disabled={dataRequest.isFetchingNextPage}
                  >
                    {translate('notifications.page.table.more.button.label')}
                  </FeedbackButton>
                )}
              </div>
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