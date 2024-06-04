import { getApolloContext } from "@apollo/client";
import { useQuery } from "@tanstack/react-query";
import debounce from "lodash/debounce";
import { useContext, useEffect, useMemo, useState } from "react";
import Pagination from "react-paginate";
import Select from "react-select";

import { I18nContext } from "../../../contexts/i18n-context";
import * as Services from "../../../services";
import { IFastApi, IFastApiSubscription, IFastPlan, ITeamSimple } from "../../../types";
import { FilterPreview, Spinner } from "../../utils";
import { FastApiCard } from "./FastApiCard";
import { FastItemView } from "./FastItemView";



type FastApiListProps = {
  teamList: Array<ITeamSimple>
  team: ITeamSimple
  setTeam: Function
}

export type FastItemViewMode = 'PLAN' | 'APIKEY' | 'NONE';

export const FastApiList = (props: FastApiListProps) => {
  const { translate } = useContext(I18nContext);
  const { client } = useContext(getApolloContext());

  const [subscriptions, setSubscriptions] = useState<Array<IFastApiSubscription>>()
  const [planInfo, setPlanInfo] = useState<IFastPlan>();
  const [viewMode, setViewMode] = useState<FastItemViewMode>('NONE')
  const [nbOfApis, setNbOfApis] = useState<number>(5);
  const [page, setPage] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);
  const [planResearch, setPlanResearch] = useState<string>("")
  const [inputVal, setInputVal] = useState("")
  const [research, setResearch] = useState<string>("");
  const [seeApiSubscribed, setSeeApiSubscribed] = useState<boolean>(false)

  const dataRequest = useQuery<{ apis: Array<IFastApi>, total: number }>({

    queryKey: ["data",
      props.team._id,
      research,
      seeApiSubscribed,
      nbOfApis,
      offset],
    queryFn: ({ queryKey }) => {
      return client!.query<{ accessibleApis: { apis: Array<IFastApi>, total: number } }>({
        query: Services.graphql.getApisWithSubscription,
        fetchPolicy: "no-cache",
        variables: {
          teamId: queryKey[1],
          research: queryKey[2],
          apiSubOnly: queryKey[3],
          limit: queryKey[4],
          offset: queryKey[5]
        }
      }).then(({ data: { accessibleApis } }) => {
        return accessibleApis
      }
      )
    },
    enabled: !!props.team && !!client,
    gcTime: 0

  })

  const togglePlan = (plan: IFastPlan) => {
    switch (viewMode) {
      case 'PLAN':
        if (plan._id === planInfo?._id) {
          setViewMode('NONE');
        } else {
          setPlanInfo(plan)
        }
        break;
      case 'APIKEY':
      case 'NONE':
        setViewMode('PLAN');
        setPlanInfo(plan);
        break;
    }
  }
  const toggleApiKey = (apiId: string, teamId: string, version: string, plan: IFastPlan) => {
    switch (viewMode) {
      case 'APIKEY':
        if (plan._id === planInfo?._id) {
          setViewMode('NONE');
        } else {
          Services.getTeamSubscriptionsWithPlan(apiId, teamId, version, plan._id)
            .then((subs) => {
              setPlanInfo(plan)
              setSubscriptions(subs)
            })
        }
        break;
      case 'PLAN':
      case 'NONE':
        Services.getTeamSubscriptionsWithPlan(apiId, teamId, version, plan._id)
          .then((subs) => {
            setPlanInfo(plan)
            setViewMode('APIKEY');
            setSubscriptions(subs)
          })
        break;
    }
  }

  const handleChange = (e) => {
    setPage(0)
    setOffset(0)
    setResearch(e.target.value);
  };

  const debouncedResults = useMemo(() => {
    return debounce(handleChange, 500);
  }, []);

  useEffect(() => {
    return () => {
      debouncedResults.cancel();
    };
  }, []);

  const handlePageClick = (data) => {
    setPage(data.selected);
    setOffset(data.selected * nbOfApis)
  };
  const changeNbOfApis = (data) => {
    setNbOfApis(data)
    setPage(0)
    setOffset(0)
  }
  const changeSeeOnlySubscribedApis = (data) => {
    setSeeApiSubscribed(data)
    setPage(0)
    setOffset(0)
  }

  const clearFilter = () => {
    setInputVal('')
    setResearch('')
    setSeeApiSubscribed(false)
    setPlanResearch('')
    setPage(0)
    setOffset(0)
  };


  return (
    <div className="container">
      <div className="row" style={{ position: "relative" }}>
        <div className="col-9">
          <div className="d-flex justify-content-between mb-2">
            <div className="flex-grow-1 me-2">
              <input
                type="text"
                className="form-control"
                placeholder={translate('fastMode.input.research.api')}
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
            <div className="flex-grow-1 me-2">
              <input
                type="text"
                className="form-control"
                placeholder={translate('fastMode.input.research.plan')}
                value={planResearch}
                onChange={(e) => setPlanResearch(e.target.value)}
              />
            </div>
            <button onClick={() => changeSeeOnlySubscribedApis(!seeApiSubscribed)} className="btn btn-sm btn-outline-info">
              {seeApiSubscribed ? translate('fastMode.button.show.all.apis') : translate('fastMode.button.show.subs.apis')}
            </button>
          </div>
          {dataRequest.isLoading && <Spinner />}
          {dataRequest.data && (
            <div className="section pb-1">
              <FilterPreview count={dataRequest.data.total} clearFilter={clearFilter} searched={research} filterPlan={planResearch} seeOnlySubs={seeApiSubscribed} />
              <div className="apis" style={{ maxHeight: '600px', overflowY: 'scroll', overflowX: 'hidden' }}>
                {dataRequest.data.apis.map(({ api }) => {
                  if (!api.parent) {
                    const allFastApiVersions = dataRequest.data.apis.filter((fastApi) => fastApi.api.name == api.name)
                    return (
                      <div className="section border-bottom" key={api._id}>
                        {allFastApiVersions.length >= 1 &&
                          <FastApiCard
                            apisWithAuthorization={allFastApiVersions}
                            team={props.team}
                            subscriptions={allFastApiVersions.map((fastApi) => fastApi.subscriptionsWithPlan)}
                            showPlan={togglePlan}
                            showApiKey={toggleApiKey}
                            planResearch={planResearch}
                          />
                        }
                      </div>

                    )
                  }
                })}
              </div>
              <div className="d-flex flex-row align-items-center mx-3">
                <Select
                  className="col-2 tag__selector filter__select reactSelect"
                  name="nb-api-selector"
                  isClearable={false}
                  value={{
                    label: translate({ key: 'Show.results', replacements: [nbOfApis.toString()] }),
                    value: nbOfApis,
                  }}
                  isSearchable={false}
                  options={[5, 10, 20].map((x) => ({ label: translate({ key: 'Show.results', replacements: [`${x}`] }), value: x }))}
                  onChange={(e) => changeNbOfApis(e!.value)}
                  classNamePrefix="reactSelect"
                  menuPlacement="top"
                />
                <div className="flex-grow-1 d-flex justify-content-center">
                  <Pagination
                    previousLabel={translate('Previous')}
                    nextLabel={translate('Next')}
                    breakLabel="..."
                    breakClassName={'break'}
                    pageCount={Math.ceil(dataRequest.data.total / nbOfApis)}
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
            </div>
          )}
        </div>
        <div className="col-3">
          <div className="section p-3 mb-2">
            <h5>
              <i className="fas fa-users me-2" />
              {translate("fastMode.selected.team.title")}
            </h5>
            <Select
              name="team-selector"
              className="tag__selector filter__select reactSelect  "
              value={{ value: props.team, label: props.team.name }}
              isClearable={false}
              options={props.teamList.map((team) => {
                return { value: team, label: team.name }
              })}
              onChange={(e) => {
                props.setTeam(e!.value)
                setPage(0)
                setOffset(0)
                setViewMode('NONE')
                localStorage.setItem('selectedTeam', JSON.stringify(e!.value));
              }}
              classNamePrefix="reactSelect"
            />
          </div>
          <FastItemView viewMode={viewMode} planInfo={planInfo} subscriptions={subscriptions} />
        </div>
      </div>
    </div>
  )
}