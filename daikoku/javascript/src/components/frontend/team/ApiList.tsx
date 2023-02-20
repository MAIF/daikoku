import classNames from 'classnames';

import sortBy from 'lodash/sortBy';
import React, {useContext, useEffect, useMemo, useState} from 'react';
import { Grid, List } from 'react-feather';
import Pagination from 'react-paginate';
import {useLocation, useNavigate} from 'react-router-dom';
import Select, { SingleValue } from 'react-select';

import {useDispatch, useSelector} from 'react-redux';
import {I18nContext, updateUser} from '../../../core';
import {
  IState,
  IApiAuthoWithCount,
  IApiWithAuthorization,
  isError,
  ITeamSimple,
  IUserSimple,
  TOption,
  TOptions
} from '../../../types';
import { ApiCard } from '../api';

import {getApolloContext} from "@apollo/client";
import {useQuery} from "@tanstack/react-query";
import * as Services from "../../../services";
import {arrayStringToTOps, Spinner, FilterPreview} from "../../utils";

import debounce from "lodash/debounce";
import {toastr} from "react-redux-toastr";
import queryClient from "../../utils/queryClient";

const GRID = 'GRID';
const LIST = 'LIST';



type TApiList = {
  teams: Array<ITeamSimple>,
  team?: ITeamSimple,
  groupView?: boolean,
  myTeams?: Array<ITeamSimple>,
  teamVisible: boolean,
  redirectToApiPage: (api: IApiWithAuthorization) => void,
  redirectToEditPage: (api: IApiWithAuthorization, teams: Array<ITeamSimple>, myTeams: Array<ITeamSimple>) => void,
  apiGroupId?: string
}

export const ApiList = (props: TApiList) => {

  const { client } = useContext(getApolloContext());

  const { translate } = useContext(I18nContext);
  const navigate = useNavigate();



  const connectedUser = useSelector<IState, IUserSimple>((state) => state.context.connectedUser);
  const location = useLocation();

  const dispatch = useDispatch();

  const [searched, setSearched] = useState("");
  const [inputVal, setInputVal] = useState("")
  const [page, setPage] = useState(0);
  const [offset, setOffset] = useState(0);
  const [apisWithAuth, setApisWithAuth] = useState<IApiWithAuthorization[]>()

  const [selectedTag, setSelectedTag] = useState<TOption | undefined>(undefined);
  const [selectedCategory, setSelectedCategory] = useState<TOption | undefined>(undefined);

  const [researchTag, setResearchTag] = useState("");
  const [researchCat, setResearchCat] = useState("");

  const [tags, setTags] = useState<TOptions>([]);
  const [categories, setCategories] = useState<TOptions>([]);

  const [view, setView] = useState<'LIST' | 'GRID'>(LIST);
  const pageNumber = view === GRID ? 12 : 10;



  const dataRequest = useQuery({
    queryKey: ["data", searched, connectedUser._id, location.pathname, props.team?._id, selectedTag?.value, selectedCategory?.value, pageNumber, offset, props.apiGroupId ],
    queryFn: ({ queryKey }) => {
      return client!.query<{ visibleApis: IApiAuthoWithCount }>({
        query: Services.graphql.myVisibleApis,
        fetchPolicy: "no-cache",
        variables: {teamId: queryKey[4] , research: queryKey[1], selectedTag: queryKey[5], selectedCategory: queryKey[6], limit: queryKey[7], offset: queryKey[8], groupId:  queryKey[9]}
      }).then(({ data: { visibleApis }}) => {
        setApisWithAuth(visibleApis.apis)
        return visibleApis
        }
      )
    },
    enabled: !!client,
    cacheTime: 0
  })


  const dataTags = useQuery({
    queryKey: ["dataTags", researchTag],
    queryFn: ({queryKey}) => {
      return client!.query<{allTags: Array<string>}>({
        query: Services.graphql.getAllTags,
        variables: {research: queryKey[1]}
      }).then(({data: {allTags}}) => {
        setTags(arrayStringToTOps(allTags))
        return arrayStringToTOps(allTags)
      })
    }
  })

  const bestTags = useQuery({
    queryKey: ["bestTags"],
    queryFn: () => {
      return client!.query<{allTags: Array<string>}>({
        query: Services.graphql.getAllTags,
        variables: {research: ""}
      }).then(({data: {allTags}}) => {
        return arrayStringToTOps(allTags)
      })
    }
  })

  const dataCategories = useQuery({
    queryKey: ["dataCategories", researchCat],
    queryFn: ({queryKey}) => {
      return client!.query<{allCategories: Array<string>}>({
        query: Services.graphql.getAllCategories,
        variables: {research: queryKey[1]}
      }).then(({data: {allCategories}}) => {
        setCategories(arrayStringToTOps(allCategories))
        return arrayStringToTOps(allCategories)
      })
    }
  })
  const bestCategories = useQuery({
    queryKey: ["bestCategories"],
    queryFn: () => {
      return client!.query<{allCategories: Array<string>}>({
        query: Services.graphql.getAllCategories,
        variables: {research: ""}
      }).then(({data: {allCategories}}) => {
        return arrayStringToTOps(allCategories)
      })
    }
  })
  const askForApiAccess = (apiWithAuth: IApiWithAuthorization, teams: string[]) =>
    Services.askForApiAccess(teams, apiWithAuth.api._id)
      .then(() => {
        toastr.info(translate('Info'), translate({ key: 'ask.api.access.info', replacements: [apiWithAuth.api.name] }));
        if (dataRequest.data) {
          queryClient.invalidateQueries(['data'])
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
    navigate(`/${team._humanReadableId}/settings`);
  };

  const clearFilter = () => {
    setSelectedTag(undefined);
    setSelectedCategory(undefined);
    setInputVal('')
    setSearched('');
    setPage(0)
    setOffset(0)
  };

  const setTagByBestTag = (data) =>{
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
    setOffset(data.selected * pageNumber);
    setPage(data.selected);
  };

  const user = connectedUser;

  const toggleStar = (apiWithAuthorization: IApiWithAuthorization) => {
    Services.toggleStar(apiWithAuthorization.api._id).then((res) => {
      if (!isError(res)) {
        const alreadyStarred = connectedUser.starredApis.includes(apiWithAuthorization.api._id);

        setApisWithAuth(
          apisWithAuth!.map((apiWithAuth) => {

            if (apiWithAuth.api._id === apiWithAuthorization.api._id) apiWithAuth.api.stars += alreadyStarred ? -1 : 1;
            return apiWithAuth;
          }),
        );

        dispatch(updateUser({
          ...connectedUser,
          starredApis: alreadyStarred
            ? connectedUser.starredApis.filter((id: any) => id !== apiWithAuthorization.api._id)
            : [...connectedUser.starredApis, apiWithAuthorization.api._id],
        }));
      }
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
        <Select
          name="tag-selector"
          className="tag__selector filter__select reactSelect col-6 col-sm mb-2"
          value={selectedTag ?selectedTag : null}
          placeholder={translate('apiList.tag.search')}
          isClearable={true}
          options={ dataTags.data ? [...dataTags.data] : [] }
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
          isClearable={true}
          options={ dataCategories.data ?  [...dataCategories.data] : []}
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
            className={classNames('btn btn-sm btn-access-negative me-2', {active: view === LIST})}
            onClick={() => {
              setView(LIST)
              setPage(0)
              setOffset(0)
            }}

          >
            <List/>
          </button>
          <button
            className={classNames('btn btn-sm btn-access-negative', {active: view === GRID})}
            onClick={() => {
              setView(GRID)
              setPage(0)
              setOffset(0)
            }}
          >
            <Grid/>
          </button>
        </div>
      </div>
      <div className="row">
        {dataRequest.isLoading && <Spinner/>}
        {apisWithAuth && dataRequest.data &&
            <div
                className={classNames('section d-flex flex-column', {
                  'col-12 col-sm-9': !props.groupView,
                  'col-12': props.groupView,
                })}
            >
              <div
                  className={classNames('d-flex justify-content-between p-3', {
                    'flex-column': view === LIST,
                    'flex-wrap': view === GRID,
                    row: view === GRID,
                  })}
              >
                <FilterPreview count={dataRequest.data.result} clearFilter={clearFilter} searched={searched} selectedTag={selectedTag} selectedCategory={selectedCategory}/>

                { apisWithAuth.map((apiWithAuth) => {
                  const sameApis = apisWithAuth!.filter(((apiWithAuth2) => apiWithAuth2.api._humanReadableId === apiWithAuth.api._humanReadableId ))
                  if (!apiWithAuth.api.isDefault || !sameApis.find((api) => !api.api.parent)) {
                    return (
                      <ApiCard
                        user={user}
                        apiWithAutho={sameApis}
                        teamVisible={props.teamVisible}
                        team={props.teams.find((t) => t._id === apiWithAuth.api.team._id)}
                        myTeams={props.myTeams || []}
                        askForApiAccess={(teams) => askForApiAccess(apiWithAuth, teams)}
                        redirectToApiPage={() => props.redirectToApiPage(apiWithAuth)}
                        redirectToEditPage={() => props.redirectToEditPage(apiWithAuth, props.teams, props.myTeams || [])}
                        handleTagSelect={(tag) => setSelectedTag(tags.find((t) => t.value === tag))}
                        toggleStar={() => toggleStar(apiWithAuth)}
                        handleCategorySelect={(category) => setSelectedCategory(categories.find((c) => c.value === category))}
                        view={view}
                        connectedUser={connectedUser}
                        groupView={props.groupView}
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
                    pageCount={Math.ceil(dataRequest.data.result / pageNumber)}
                    marginPagesDisplayed={1}
                    pageRangeDisplayed={5}
                    onPageChange={handlePageClick}
                    containerClassName={'pagination'}
                    pageClassName={'page-selector'}
                    forcePage={page}
                    activeClassName={'active'}
                />
              </div>
            </div>
        }
        {!props.groupView && (
          <div className="d-flex col-12 col-sm-3 text-muted flex-column px-3 mt-2 mt-sm-0">
            {!props.team && !connectedUser.isGuest && (
              <YourTeams teams={props.myTeams || []} redirectToTeam={redirectToTeam}/>
            )}
            {!!bestTags.data && !!bestTags.data.length   && (
              <Top
                className="p-3 rounded additionalContent mb-2"
                title="Top tags"
                icon="fas fa-tag me-2"
                list={bestTags.data}
                formatter={(tag) => tag.value}
                handleClick={setTagByBestTag}
              />
            )}
            {!!bestCategories.data && !!bestCategories.data.length  && (
              <Top
                className="p-3 rounded additionalContent"
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
            className="badge bg-warning me-1 cursor-pointer"
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
    ? teams.filter((team) => team.name.toLowerCase().includes(searchedTeam))
    : teams;
  return (
    <div className={'top__container p-3 rounded additionalContent mb-2'}>
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
                className="p-1 cursor-pointer underline-on-hover text-break"
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
