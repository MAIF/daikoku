import React, { useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Select from 'react-select';
import { getApolloContext } from "@apollo/client";
import debounce from "lodash/debounce";

import "../../../style/components/fastApiCard.scss";
import * as Services from "../../../services";
import { Spinner } from "../../utils";
import { IFastApi, isError, ITeamSimple } from "../../../types";
import { I18nContext } from '../../../core';

import { ExpertApiList } from "./FastApiList";


export const FastMode = () => {
  const { translate } = useContext(I18nContext);
  const { client } = useContext(getApolloContext());
  const maybeTeam = localStorage.getItem('selectedTeam')

  const [seeApiSubscribed, setSeeApiSubscribed] = useState<boolean>(false)

  const [nbOfApis, setNbOfApis] = useState<number>(5);
  const [page, setPage] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);

  const [selectedTeam, setSelectedTeam] = useState<ITeamSimple>(maybeTeam ? JSON.parse(maybeTeam) : undefined);

  const [planResearch, setPlanResearch] = useState<string>("")
  const [research, setResearch] = useState<string>("");
  const [reasonSub, setReasonSub] = useState<string>("");

  const myTeamsRequest = useQuery(['myTeams'], () => Services.myTeams())
  const dataRequest = useQuery<{ apis: Array<IFastApi>, nb: number }>({
    queryKey: ["data", selectedTeam?._id, offset, seeApiSubscribed, nbOfApis, research],
    queryFn: ({ queryKey }) => {
      return client!.query<{ accessibleApis: { apis: Array<IFastApi>, nb: number } }>({
        query: Services.graphql.getApisWithSubscription,
        fetchPolicy: "no-cache",
        variables: { teamId: queryKey[1], limit: nbOfApis, apisubonly: seeApiSubscribed ? 1 : 0, offset: page, research: research }
      }).then(({ data: { accessibleApis } }) => {
        return accessibleApis
      }
      )
    },
    enabled: !!selectedTeam && !!client,
    cacheTime: 0

  })

  const handleChange = (e) => {
    setPage(0)
    setResearch(e.target.value);
  };

  const debouncedResults = useMemo(() => {
    return debounce(handleChange, 500);
  }, []);
  useEffect(() => {
    return () => {
      debouncedResults.cancel();

    };
  });
  const handlePageClick = (data) => {
    setPage(data.selected);
    setOffset(data.selected * nbOfApis)
  };
  const changeNbOfApis = (data) => {
    setNbOfApis(data)
    setPage(0)
  }
  const changeSeeOnlySubscribedApis = (data) => {
    setSeeApiSubscribed(data)
    setPage(0)

  }


  if (myTeamsRequest.isLoading) {
    return <Spinner />

  } else if (myTeamsRequest.data && !isError(myTeamsRequest.data)) {
    return (
      <main role="main">
        <h1 className={"ms-3"}>{translate('fastMode.title')}</h1>
        <section className="container">
          <div className="row mb-2">
            <div className="col-12 col-sm mb-2">
              {selectedTeam == undefined &&
                <Select
                  name="team-selector"
                  className="tag__selector filter__select reactSelect col-6 col-sm mb-2"
                  isClearable={false}
                  options={myTeamsRequest.data.map((team) => {
                    return { value: team, label: team.name }
                  })}
                  onChange={(e: any) => {
                    setSelectedTeam(e!.value)
                    localStorage.setItem('selectedTeam', JSON.stringify(e!.value));
                  }}
                  classNamePrefix="reactSelect"
                />}
              {selectedTeam &&
                <div>
                  <div className="col justify-content-between d-flex">
                    <div className="col-4">
                      <input
                        type="text"
                        className="form-control mb-2"
                        placeholder={translate('fastMode.input.research.api')}
                        onChange={debouncedResults}
                      />
                    </div>
                    <div className="col-4">
                      <input
                        type="text"
                        className="form-control mb-2"
                        placeholder={translate('fastMode.input.research.plan')}
                        onChange={(e) => setPlanResearch(e.target.value)}
                      />
                    </div>
                    <div className="col-3">
                      <button onClick={() => changeSeeOnlySubscribedApis(!seeApiSubscribed)} className="btn btn-sm btn-outline-primary">
                        {seeApiSubscribed ? translate('show all APIs') : translate('show all subscribed APIs')}
                      </button>
                    </div>
                  </div>
                  {dataRequest.isLoading &&
                    <Spinner />
                  }
                  {dataRequest.data &&
                    <>
                      <ExpertApiList
                        team={selectedTeam}
                        apiWithAuthorizations={dataRequest.data.apis}
                        setTeam={setSelectedTeam}
                        teamList={myTeamsRequest.data}
                        nbOfApis={nbOfApis}
                        setNbOfApis={changeNbOfApis}
                        input={reasonSub}
                        setInput={setReasonSub}
                        nb={dataRequest.data.nb}
                        handlePageClick={handlePageClick}
                        planResearch={planResearch}
                        page={page}
                      />
                    </>
                  }
                </div>
              }
              {!selectedTeam &&
                <div> {translate('fastMode.title.chooseTeam')}</div>
              }

            </div>
          </div>
        </section>
      </main>
    )
  } else {
    return (
      <div>{translate('fastMode.error.searching.team')}</div>
    )
  }

}