import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { ColumnFiltersState, createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, PaginationState, useReactTable } from "@tanstack/react-table"
import { useContext, useMemo, useState } from "react"
import Plus from 'react-feather/dist/icons/plus'

import debounce from "lodash/debounce"
import { useSearchParams } from "react-router-dom"
import Select, { MultiValue, SingleValue } from "react-select"


import { I18nContext } from "../../../contexts"
import { GlobalContext } from "../../../contexts/globalContext"
import * as Services from '../../../services'
import { IApiAuthoWithCount, IApiWithAuthorization, TOption, TOptions } from "../../../types"
import { FeedbackButton } from "../../utils/FeedbackButton"
import { Spinner } from "../../utils/Spinner"
import { arrayStringToTOps } from "../../utils/function"
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

export const ApiList = (props: ApiListProps) => {

  const pageSize = 25;
  const [selectAll, setSelectAll] = useState(false);
  const [limit, setLimit] = useState(pageSize);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

  const [searched, setSearched] = useState("");
  const [inputVal, setInputVal] = useState("")
  const [page, setPage] = useState(0);
  const [offset, setOffset] = useState(0);
  const [apisWithAuth, setApisWithAuth] = useState<IApiWithAuthorization[]>()

  const [producers, setProducers] = useState<Array<TOption>>([]);
  const [selectedProducer, setSelectedProducer] = useState<TOption | undefined>();
  const [selectedTag, setSelectedTag] = useState<TOption | undefined>(undefined);
  const [selectedCategory, setSelectedCategory] = useState<TOption | undefined>(undefined);

  const [researchTag, setResearchTag] = useState("");
  const [tags, setTags] = useState<TOptions>([]);

  const apiNbDisplayed = 10;

  const defaultColumnFilters = [{ "id": "unreadOnly", "value": true }];
  const [searchParams] = useSearchParams();
  const initialFilters = useMemo(() => {
    const f = searchParams.get('filter');
    return f ? JSON.parse(decodeURIComponent(f)) : defaultColumnFilters;
  }, [searchParams]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialFilters)

  const { tenant, customGraphQLClient, connectedUser } = useContext(GlobalContext)
  const { translate } = useContext(I18nContext)

  // --- MARK: Queries
    const myTeamsRequest = useQuery({ queryKey: ['myTeams'], queryFn: () => Services.myTeams() })
    const dataTags = useQuery({
      queryKey: ["dataTags",
        researchTag,
        props.apiGroupId,
        selectedTag?.value,
        selectedCategory?.value,
        selectedProducer?.value,
        searched
      ],
      queryFn: ({ queryKey }) => customGraphQLClient.request<{ allTags: Array<string> }>(
        Services.graphql.getAllTags,
        {
          research: queryKey[6],
          groupId: queryKey[2],
          selectedTag: queryKey[3],
          selectedCategory: queryKey[4],
          selectedTeam: queryKey[5],
          filter: queryKey[1],
          limit: 5
        }
      ).then(({ allTags }) => {
        setTags(arrayStringToTOps(allTags))
        return arrayStringToTOps(allTags)
      })
    })
    const dataRequest = useInfiniteQuery({
      queryKey: ["data",
        props.teamId,
        searched,
        selectedTag?.value,
        selectedCategory?.value,
        apiNbDisplayed,
        offset,
        props.apiGroupId,
        selectedProducer?.value,
        connectedUser._id,
        location.pathname],
      queryFn: ({ queryKey }) => {
        return customGraphQLClient.request<{ visibleApis: IApiAuthoWithCount }>(
          Services.graphql.myVisibleApis,
          {
            teamId: queryKey[1],
            research: queryKey[2],
            selectedTag: queryKey[3],
            selectedCategory: queryKey[4],
            limit: queryKey[5],
            offset: queryKey[6],
            groupId: queryKey[7],
            selectedTeam: queryKey[8]
          }).then(({ visibleApis }) => {
            setApisWithAuth(visibleApis.apis)
            setProducers(visibleApis.producers.map(p => ({ label: p.name, value: p._id })))
            return visibleApis
          }
          )
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage, pages) => {
        const totalFilteredCount = lastPage.total; //FIXME: c'est pas le bon param (better with totalFiltered like notification page)
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

        return <a href='#' onClick={() => handleSelectChange([{ label: api.name, value: api._id }], 'api')}>
          {api.name}
        </a>
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
                <span onClick={() => handleSelectChange([{ label: tag, value: tag }], 'tag')}
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
        const test = Math.round(Math.random() * 10)

        if (test < 3) {
          return <div className="d-flex gap-1">
            <span className="badge badge-custom-success">2 clés actives</span>
            <span className="badge badge-custom-danger">1 expire bientôt</span>
          </div>
        } else if (test < 7) {
          return <div className="d-flex gap-1">
            <span className="badge badge-custom-success">2 clés actives</span>
          </div>
        } else {
          return <div className="d-flex gap-1">
            <span className="badge badge-custom-warning">1 demande en attente</span>
          </div>
        }

      }
    }),
    columnHelper.display({
      id: 'action',
      enableColumnFilter: false,
      meta: { className: "action-cell" },
      cell: (info) => {
        const api = info.row.original.api;

        const starred = connectedUser.starredApis.includes(api._id)

        return (
          <div className='notification__actions'>
            <StarsButton
              starred={starred}
              toggleStar={() => console.debug("star", api.name)}
            />
            <button
              className="favorite-btn"
              style={{ background: 'none', border: 'none' }} //todo: aria-label
              onClick={() => console.debug('open actions')}
            >
              <i className="fas fa-ellipsis-vertical" />
            </button>
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
    rowCount: dataRequest.data?.pages[0].total, //FIXME: better with totalFiltered like notification page
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
  
    const handleChange = (e) => {
      setPage(0)
      setOffset(0)
      setSearched(e.target.value);
    };
  
    const debouncedResults = useMemo(() => {
      return debounce(handleChange, 500);
    }, []);



//--- MARK: Rendering
  return (
    <div className="col-12 api_list_container">
      <div className='d-flex flex-row align-items-center justify-content-between'>
        <div className='d-flex align-items-center gap-3' aria-live="polite">
          <h2 className="api_list__title" id='notif-label'>
            Liste des APIs
          </h2>
        </div>
        <button type="button" className='btn btn-outline-info'><Plus /> créer un API</button>
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
                setOffset(0);
                setPage(0);
              }}
            />
          </div>
          {(producers.length > 1 || !!selectedProducer) && <Select
            name="team-selector"
            className="team__selector filter__select reactSelect col-2"
            value={selectedProducer ? selectedProducer : null}
            placeholder={translate('apiList.team.search')}
            aria-label={translate('apiList.team.search')}
            isClearable={true}
            options={producers || []}
            onChange={(e: SingleValue<TOption>) => {
              setSelectedProducer(e || undefined);
              setPage(0)
              setOffset(0)

            }}
            classNamePrefix="reactSelect"
          />}
          <Select
            name="tag-selector"
            className="tag__selector filter__select reactSelect col-2"
            value={selectedTag ? selectedTag : null}
            placeholder={translate('apiList.tag.search')}
            aria-label={translate('apiList.tag.search')}
            isClearable={true}
            options={dataTags.data ? [...dataTags.data] : []}
            onChange={(e: SingleValue<TOption>) => {
              setSelectedTag(e || undefined);
              setPage(0)
              setOffset(0)

            }}
            onInputChange={setResearchTag}
            classNamePrefix="reactSelect"
          />
          <button className="btn btn-outline-secondary">Souscrites seulement</button>
          {/* TODO: display button only of filter active */}
          <button className='btn btn-outline-secondary' onClick={() => setColumnFilters(defaultColumnFilters)}>
            <i className='fas fa-rotate me-2' />
            {translate('notifications.page.filters.clear.label')}
          </button>
        </div>

        <div className="">{dataRequest.data?.pages[0].total} APIs</div>
      </div>
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
                {table.getRowModel().rows.map(row => {
                  return (
                    <li key={row.id} tabIndex={-1}>
                      <article className='table-row' aria-label={row.original.api.name}>
                        {row.getVisibleCells().map(cell => {
                          return (
                            <div key={cell.id} className={cell.column.columnDef.meta?.className}>
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
              {/* {dataRequest.hasNextPage && (
                    <FeedbackButton
                      type="primary"
                      className="btn btn-outline-primary a-fake"
                      onPress={() => dataRequest.fetchNextPage()}
                      onSuccess={() => console.debug("success")}
                      feedbackTimeout={100}
                      disabled={dataRequest.isFetchingNextPage}
                    >
                      {translate('notifications.page.table.more.button.label')}
                    </FeedbackButton>
                  )} */}
              <FeedbackButton
                type="info"
                className="a-fake"
                onPress={() => dataRequest.fetchNextPage()}
                feedbackTimeout={300}
                disabled={dataRequest.isFetchingNextPage}
              >
                {translate('notifications.page.table.more.button.label')}
              </FeedbackButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}