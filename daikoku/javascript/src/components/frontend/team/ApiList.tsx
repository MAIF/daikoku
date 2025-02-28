import { getApolloContext } from "@apollo/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import classNames from 'classnames';
import debounce from "lodash/debounce";
import sortBy from 'lodash/sortBy';
import { useContext, useEffect, useMemo, useState } from 'react';
import Grid from 'react-feather/dist/icons/grid';
import List from 'react-feather/dist/icons/list';
import Pagination from 'react-paginate';
import { useLocation, useNavigate } from 'react-router-dom';
import Select, { SingleValue } from 'react-select';

import { I18nContext } from '../../../contexts';
import {
  IApiAuthoWithCount,
  IApiWithAuthorization,
  ITeamSimple,
  TOption,
  TOptions,
  isError
} from '../../../types';
import { ApiCard } from '../api';

import { toast } from "sonner";
import { GlobalContext } from "../../../contexts/globalContext";
import * as Services from "../../../services";
import { FilterPreview, Spinner, arrayStringToTOps, teamGQLToSimple } from "../../utils";

const GRID = 'GRID';
const LIST = 'LIST';



type TApiList = {
  teamId?: string,
  groupView?: boolean,
  myTeams?: Array<ITeamSimple>,
  teamVisible: boolean,
  redirectToApiPage: (api: IApiWithAuthorization) => void,
  apiGroupId?: string
}

export const ApiList = (props: TApiList) => {

  const { client } = useContext(getApolloContext());
  const queryClient = useQueryClient();

  const { translate } = useContext(I18nContext);
  const navigate = useNavigate();



  const { connectedUser, reloadContext } = useContext(GlobalContext);
  const location = useLocation();

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

  const [view, setView] = useState<'LIST' | 'GRID'>(LIST);
  const pageNumber = view === GRID ? 12 : 10;


  const dataRequest = useQuery({
    queryKey: ["data",
      props.teamId,
      searched,
      selectedTag?.value,
      selectedCategory?.value,
      pageNumber,
      offset,
      props.apiGroupId,
      selectedProducer?.value,
      connectedUser._id,
      location.pathname],
    queryFn: ({ queryKey }) => {
      return client!.query<{ visibleApis: IApiAuthoWithCount }>({
        query: Services.graphql.myVisibleApis,
        fetchPolicy: "no-cache",
        variables: {
          teamId: queryKey[1],
          research: queryKey[2],
          selectedTag: queryKey[3],
          selectedCategory: queryKey[4],
          limit: queryKey[5],
          offset: queryKey[6],
          groupId: queryKey[7],
          selectedTeam: queryKey[8]
        }
      }).then(({ data: { visibleApis } }) => {
        setApisWithAuth(visibleApis.apis)
        setProducers(visibleApis.producers.map(p => ({ label: p.name, value: p._id })))
        return visibleApis
      }
      )
    },
    enabled: !!client,
    gcTime: 0
  })


  const dataTags = useQuery({
    queryKey: ["dataTags", researchTag, props.apiGroupId],
    queryFn: ({ queryKey }) => {
      return client!.query<{ allTags: Array<string> }>({
        query: Services.graphql.getAllTags,
        variables: { research: queryKey[1], groupId: queryKey[2], limit: 5 }
      }).then(({ data: { allTags } }) => {
        setTags(arrayStringToTOps(allTags))
        return arrayStringToTOps(allTags)
      })
    }
  })

  const bestTags = useQuery({
    queryKey: ["bestTags"],
    queryFn: () => {
      return client!.query<{ allTags: Array<string> }>({
        query: Services.graphql.getAllTags,
        variables: { research: "", limit: 5 }
      }).then(({ data: { allTags } }) => {
        return arrayStringToTOps(allTags)
      })
    }
  })

  const dataCategories = useQuery({
    queryKey: ["dataCategories", researchCat, props.apiGroupId],
    queryFn: ({ queryKey }) => {
      return client!.query<{ allCategories: Array<string> }>({
        query: Services.graphql.getAllCategories,
        variables: { research: queryKey[1], groupId: queryKey[2], limit: 5 }
      }).then(({ data: { allCategories } }) => {
        setCategories(arrayStringToTOps(allCategories))
        return arrayStringToTOps(allCategories)
      })
    }
  })
  const bestCategories = useQuery({
    queryKey: ["bestCategories"],
    queryFn: () => {
      return client!.query<{ allCategories: Array<string> }>({
        query: Services.graphql.getAllCategories,
        variables: { research: "", limit: 5}
      }).then(({ data: { allCategories } }) => {
        return arrayStringToTOps(allCategories)
      })
    }
  })
  const askForApiAccess = (apiWithAuth: IApiWithAuthorization, teams: string[]) =>
    Services.askForApiAccess(teams, apiWithAuth.api._id)
      .then(() => {
        toast.info(translate({ key: 'ask.api.access.info', replacements: [apiWithAuth.api.name] }));
        if (dataRequest.data) {
          queryClient.invalidateQueries({ queryKey: ['data'] })
        }
      });

  const handleChange = (e) => {
    setPage(0)
    setOffset(0)
    setSearched(e.target.value);
  };

  const debouncedResults = useMemo(() => {
    return debounce(handleChange, 500);
  }, []);
  useEffect(() => {
    return () => {
      debouncedResults.cancel();
    };
  }, []);



  useEffect(() => {


  }, [dataRequest.data]);

  const redirectToTeam = (team: ITeamSimple) => {
    navigate(`/${team._humanReadableId}/settings/dashboard`);
  };

  const clearFilter = () => {
    setSelectedTag(undefined);
    setSelectedCategory(undefined);
    setSelectedProducer(undefined);
    setInputVal('')
    setSearched('');
    setPage(0)
    setOffset(0)
  };

  const setTagByBestTag = (data) => {
    setSelectedTag(data)
    setPage(0)
    setOffset(0)
  }

  const setCatByBestCat = (data) => {
    setSelectedCategory(data)
    setPage(0)
    setOffset(0)
  }

  const handlePageClick = (data) => {
    setOffset(data.selected);
    setPage(data.selected);
  };

  const user = connectedUser;

  const toggleStar = (apiWithAuthorization: IApiWithAuthorization) => {
    Services.toggleStar(apiWithAuthorization.api._id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['data'] })
        reloadContext()
      });
  };

  return (
    <section className="container">
      <div className="row mb-2">
        <div className="col-12 col-sm mb-2">
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
          className="team__selector filter__select reactSelect col-6 col-sm mb-2"
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
          className="tag__selector filter__select reactSelect col-6 col-sm mb-2"
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
        <Select
          name="category-selector"
          className="category__selector filter__select reactSelect col-6 col-sm mb-2"
          value={selectedCategory ? selectedCategory : null}
          placeholder={translate('apiList.category.search')}
          aria-label={translate('apiList.category.search')}
          isClearable={true}
          options={dataCategories.data ? [...dataCategories.data] : []}
          onChange={(e: SingleValue<TOption>) => {

            setSelectedCategory(e || undefined);
            setPage(0)
            setOffset(0)
          }}
          onInputChange={setResearchCat}
          classNamePrefix="reactSelect"
        />
      </div>
      <div className="row mb-2 view-selectors">
        <div className="col-12 col-sm-9 d-flex justify-content-end">
          <button
            className={classNames('btn btn-sm btn-outline-primary me-2', { active: view === LIST })}
            onClick={() => {
              setView(LIST)
              setPage(0)
              setOffset(0)
            }}
            aria-label={translate('view.list')}

          >
            <List />
          </button>
          <button
            className={classNames('btn btn-sm btn-outline-primary', { active: view === GRID })}
            onClick={() => {
              setView(GRID)
              setPage(0)
              setOffset(0)
            }}
            aria-label={translate('view.grid')}
          >
            <Grid />
          </button>
        </div>
      </div>
      <div className="row">
        <div
          className={classNames('section d-flex flex-column', {
            'col-12 col-sm-9': !props.groupView,
            'col-12': props.groupView,
          })}
        >
          {dataRequest.isLoading && <Spinner />}
          {apisWithAuth && dataRequest.data &&
            <>
              <div
                className={classNames('d-flex justify-content-between p-3', {
                  'flex-column': view === LIST,
                  'flex-wrap': view === GRID,
                  row: view === GRID,
                })}
              >
                <FilterPreview count={dataRequest.data.total} clearFilter={clearFilter} searched={searched} selectedTag={selectedTag} selectedProducer={selectedProducer} selectedCategory={selectedCategory} />

                {apisWithAuth.map((apiWithAuth) => {
                  const sameApis = apisWithAuth.filter(((apiWithAuth2) => apiWithAuth2.api._humanReadableId === apiWithAuth.api._humanReadableId))
                  if (props.groupView || apiWithAuth.api.isDefault) {
                    return (
                      <ApiCard
                        user={user}
                        apiWithAutho={sameApis}
                        teamVisible={props.teamVisible}
                        team={teamGQLToSimple(apiWithAuth.api.team)}
                        myTeams={props.myTeams || []}
                        askForApiAccess={(teams) => askForApiAccess(apiWithAuth, teams)}
                        redirectToApiPage={() => props.redirectToApiPage(apiWithAuth)}
                        handleTagSelect={(tag) => setSelectedTag(tags.find((t) => t.value === tag))}
                        handleTeamSelect={(team) => (producers.length > 1 || !!selectedProducer) ? setSelectedProducer({ label: team.name, value: team._id }) : {}}
                        toggleStar={() => toggleStar(apiWithAuth)}
                        handleCategorySelect={(category) => setSelectedCategory(categories.find((c) => c.value === category))}
                        view={view}
                        connectedUser={connectedUser}
                        groupView={props.groupView}
                        key={apiWithAuth.api._id}
                        apiId={apiWithAuth.api._id}
                      />
                    );
                  }
                })}
              </div>
              <div className="apis__pagination">
                <Pagination
                  previousLabel={translate('Previous')}
                  nextLabel={translate('Next')}
                  breakLabel="..."
                  breakClassName={'break'}
                  pageCount={Math.ceil(dataRequest.data.total / pageNumber)}
                  marginPagesDisplayed={1}
                  pageRangeDisplayed={5}
                  onPageChange={handlePageClick}
                  containerClassName={'pagination'}
                  pageClassName={'page-selector'}
                  forcePage={page}
                  activeClassName={'active'}
                />
              </div>
            </>
          }
        </div>
        {!props.groupView && (
          <div className="d-flex col-12 col-sm-3 text-muted flex-column px-3 mt-2 mt-sm-0">
            {!props.teamId && !connectedUser.isGuest && (
              <YourTeams teams={props.myTeams || []} redirectToTeam={redirectToTeam} />
            )}
            {!!bestTags.data && !!bestTags.data.length && (
              <Top
                className="p-3 rounded album mb-2"
                title="Top tags"
                icon="fas fa-tag me-2"
                list={bestTags.data}
                formatter={(tag) => tag.value}
                handleClick={setTagByBestTag}
              />
            )}
            {!!bestCategories.data && !!bestCategories.data.length && (
              <Top
                className="p-3 rounded album"
                title="Top categories"
                icon="fas fa-folder me-2"
                list={bestCategories.data}
                formatter={(category) => category.value}
                handleClick={setCatByBestCat}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
};

type TTopProps = {
  className?: string,
  icon: string,
  title: string,
  list: TOptions,
  formatter: (x: TOption) => string,
  handleClick: (x: TOption) => void
}
const Top = (props: TTopProps) => {
  return (
    <div className={`top__container ${props.className ? props.className : ''}`}>
      <div>
        <h5>
          <i className={props.icon} />
          {props.title}
        </h5>
      </div>
      {props.list.slice(0, 10).map((item, idx) => {
        return (
          <span
            className="badge badge-custom me-1 cursor-pointer"
            key={idx}
            onClick={() => props.handleClick(item)}
          >
            {props.formatter(item)}
          </span>
        );
      })}
    </div>
  );
};

const YourTeams = ({
  teams,
  redirectToTeam,
}: {
  teams: Array<ITeamSimple>,
  redirectToTeam: (team: ITeamSimple) => void
}) => {
  const { translate } = useContext(I18nContext);

  const [searchedTeam, setSearchedTeam] = useState<string>();
  const maybeTeams = searchedTeam
    ? teams.filter((team) => team.name.toLocaleLowerCase().includes(searchedTeam.toLocaleLowerCase()))
    : teams;
  return (
    <div className={'top__container p-3 rounded album mb-2'}>
      <div>
        <h5>
          <i className="fas fa-users me-2" />
          {translate('your teams')}
        </h5>
      </div>
      <input
        placeholder={translate('find team')}
        className="form-control"
        onChange={(e) => setSearchedTeam(e.target.value)}
      />
      <div className="d-flex flex-column">
        {sortBy(maybeTeams, (team) => team.name.toLowerCase())
          .slice(0, 5)
          .map((team) => {
            return (
              <span
                className="p-1 cursor-pointer underline-on-hover text-break level2-link"
                key={team._id}
                onClick={() => redirectToTeam(team)}
              >
                {team.name}
              </span>
            );
          })}
      </div>
    </div>
  );
};
