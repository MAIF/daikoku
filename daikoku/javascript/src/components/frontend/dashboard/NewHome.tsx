import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ColumnFiltersState, PaginationState } from "@tanstack/react-table"
import { useContext, useMemo, useState } from "react"
import Key from 'react-feather/dist/icons/key'
import Search from 'react-feather/dist/icons/search'
import Sliders from 'react-feather/dist/icons/sliders'
import { useSearchParams } from "react-router-dom"


import { I18nContext } from "../../../contexts"
import { GlobalContext } from "../../../contexts/globalContext"
import * as Services from '../../../services'
import { IApiWithAuthorization, TOption, TOptions } from "../../../types"
import { ApiList } from "./ApiList"
import { Tile } from "./Tile"

//--- MARK: Types
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


//--- MARK: NewHome
export const Dashboard = (props: NewHomeProps) => {

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

  const { tenant, customGraphQLClient, connectedUser, isTenantAdmin } = useContext(GlobalContext)
  const { translate } = useContext(I18nContext)

  const queryClient = useQueryClient();
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
          {isTenantAdmin && <button className="btn btn-outline-info"><Sliders className="me-2" />{translate('dashboard.page.tenant.setting.button.label')}</button>}
        </div>
      </section>
      <div className="d-flex flex-row gap-5">
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
          action={() => console.debug("test")} />
      </div>
      <ApiList />
    </main>
  )
}