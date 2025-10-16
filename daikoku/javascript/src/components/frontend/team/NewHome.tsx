import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { ColumnFiltersState, getCoreRowModel, getSortedRowModel, PaginationState, useReactTable } from "@tanstack/react-table"
import classNames from "classnames"
import { ReactNode, useContext, useMemo, useState } from "react"
import ArrowRight from 'react-feather/dist/icons/arrow-right'
import Key from 'react-feather/dist/icons/key'
import Search from 'react-feather/dist/icons/search'
import Sliders from 'react-feather/dist/icons/sliders'
import { useNavigate, useSearchParams } from "react-router-dom"
import Select from "react-select"

import { I18nContext } from "../../../contexts"
import { GlobalContext } from "../../../contexts/globalContext"
import * as Services from '../../../services'
import { IApiAuthoWithCount, IApiWithAuthorization, isError, TOption, TOptions } from "../../../types"
import { Spinner } from "../../utils/Spinner"


type NewHomeProps = {
  teamId?: string
  apiGroupId?: string
}

export const NewHome = (props: NewHomeProps) => {

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
  const [researchCat, setResearchCat] = useState("");

  const [tags, setTags] = useState<TOptions>([]);
  const [categories, setCategories] = useState<TOptions>([]);

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

  const myTeamsRequest = useQuery({ queryKey: ['myTeams'], queryFn: () => Services.myTeams() })

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

  const navigate = useNavigate();

  //todo: columns
  const columns = []
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


  if (myTeamsRequest.isLoading) {
    return (
      <Spinner />
    )
  } else if (myTeamsRequest.data && !isError(myTeamsRequest.data)) {
    return (
      <main className='flex-grow-1 d-flex flex-column gap-3' role="main">
        <section className="">
          <div className="d-flex flex-row justify-content-between align-items-center">
            <div className="d-flex flex-column justify-content-center">
              <h1 className="jumbotron-heading">
                {tenant.title ?? tenant.name}
              </h1>
              <p>{tenant.description}</p>
            </div>
            <button className="btn btn-outline-info"><Sliders /> Reglage du tenant</button>
          </div>
        </section>
        <div className="col-12 d-flex flex-row gap-5">
          <Tile
            title="Mes APIs"
            icon={<Search />}
            description={"Synthèse des publications et consommations"}
            data={[{ label: 'Publiées', value: 18 }, { label: 'Consommées', value: 18 }]} />
          <Tile
            title="Mes clés"
            icon={<Key />}
            description={"état des clés généré pour ce tenant"}
            data={[{ label: 'Active', value: 18 }, { label: 'Proche expiration', value: 18 }]} />
          <Tile
            small
            title="Demande en cours"
            icon={<Search />}
            description={"Souscription en attente"}
            data={[{ label: 'En attente', value: 18 }]}
            action={() => console.debug("test")} />
        </div>
        <div className="col-12 api_list_container">
          <div className='d-flex flex-row align-items-center justify-content-between'>
            <div className='d-flex align-items-center gap-3' aria-live="polite">
              <h2 className="api_list__title" id='notif-label'>
                Liste des APIs
              </h2>
            </div>
            <button type="button" className='btn btn-outline-info'>créer un API</button>
          </div>
          <div className="filter-container">
            {/* <Select
              options={(myTeamsRequest.data ?? []).map(t => ({ label: t.name, value: t._id }))}
              isLoading={myTeamsRequest.isLoading || myTeamsRequest.isPending}
              classNamePrefix="daikoku-select"
              onChange={data => handleSelectChange(data, 'team')}
              value={getSelectValue('team', myTeamsRequest.data ?? [], 'name', '_id')} /> */}
          </div>
          <div className="table-container">

          </div>
        </div>
      </main>
    )
  } else {
    return <div>error</div>
  }
}

type TileProps = {
  description: string
  title: string
  icon: ReactNode
  data: { label: string, value: number }[],
  action?: () => void,
  small?: boolean
}

const Tile = (props: TileProps) => {
  return (
    <div className={classNames("dashboard-tile", { 'flex-grow-1': !props.small })}>
      <div className="tile__header d-flex flex-row align-items-center">
        <div className="flex-grow-1">
          <div className="title d-flex flex-row justify-content-start gap-3">
            <div className="icon">
              {props.icon}
            </div>
            <h3>{props.title}</h3>
          </div>
          <div className="description">
            {props.description}
          </div>
        </div>
        {!!props.action && (<button type="button" onClick={() => props.action!()}><ArrowRight /></button>)}
      </div>
      <div className="tile_data d-flex flex-row">
        {props.data.map((item, idx) => {
          return (
            <div className="data d-flex flex-column flex-grow-1" key={idx}>
              <div className="data__label">{item.label}</div>
              <div className="data__value">{item.value}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}