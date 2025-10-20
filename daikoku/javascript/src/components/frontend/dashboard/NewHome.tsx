import { ColumnFiltersState, PaginationState } from "@tanstack/react-table"
import { useContext, useMemo, useState } from "react"
import Key from 'react-feather/dist/icons/key'
import Search from 'react-feather/dist/icons/search'
import Sliders from 'react-feather/dist/icons/sliders'
import { useSearchParams } from "react-router-dom"


import { I18nContext } from "../../../contexts"
import { GlobalContext } from "../../../contexts/globalContext"
import { IApiWithAuthorization, TOption, TOptions } from "../../../types"
import { ApiList } from "./ApiList"
import { Tile } from "./Tile"

//--- MARK: Types
type NewHomeProps = {
  teamId?: string
  apiGroupId?: string
}


//--- MARK: NewHome
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
          title={translate('dashboard.apis.tile.title')}
          icon={<Search />}
          description={translate('dashboard.apis.tile.description')}
          data={[{ label: translate('dashboard.apis.tile.published.label'), value: 18 }, { label: translate('dashboard.apis.tile.consumed.label'), value: 18 }]} />
        <Tile
          title={translate('dashboard.apikeys.tile.title')}
          icon={<Key />}
          description={translate('dashboard.apikeys.tile.description')}
          data={[{ label: translate('dashboard.apikeys.tile.active.label'), value: 18 }, { label: translate('dashboard.apikeys.tile.expire.label'), value: 18 }]} />
        <Tile
          small
          title={translate('dashboard.demands.tile.title')}
          icon={<Search />}
          description={translate('dashboard.demands.tile.description')}
          data={[{ label: translate('dashboard.demands.tile.waiting.label'), value: 18 }]}
          action={() => console.debug("test")} />
      </div>
      <ApiList />
    </main>
  )
}