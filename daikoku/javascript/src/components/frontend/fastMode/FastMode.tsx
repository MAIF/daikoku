import React, { useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Select from 'react-select';


import * as Services from "../../../services";
import { Spinner } from "../../utils";
import { isError, ITeamSimple } from "../../../types";
import { I18nContext } from '../../../core';

import { FastApiList } from "./FastApiList";


export const FastMode = () => {
  const { translate } = useContext(I18nContext);

  const maybeTeam = localStorage.getItem('selectedTeam')

  const [selectedTeam, setSelectedTeam] = useState<ITeamSimple>(maybeTeam ? JSON.parse(maybeTeam) : undefined);

  const myTeamsRequest = useQuery(['myTeams'], () => Services.myTeams())

  if (myTeamsRequest.isLoading) {
    return <Spinner />
  } else if (myTeamsRequest.data && !isError(myTeamsRequest.data)) {
    return (
      <main role="main">
        <section className="organisation__header col-12 mb-4 p-3">
          <div className="container-fluid">
            <h1 className="jumbotron-heading">{translate('fastMode.title')}</h1>
          </div>
        </section>
        <section className="container">
          <div className="row mb-2">
            <div className="col-12 col-sm mb-2">
              {!selectedTeam &&
                <div className="d-flex justify-content-center">
                  <div className="col-6">
                    {!selectedTeam && <p className="lead explain__text">
                      {translate('fastMode.help.text.1')}<br />
                      {translate('fastMode.help.text.2')}<br />
                      {translate('fastMode.help.text.3')}
                    </p>}
                    <Select
                      name="team-selector"
                      className="tag__selector filter__select reactSelect"
                      isClearable={false}
                      options={myTeamsRequest.data.map((team) => {
                        return { value: team, label: team.name }
                      })}
                      placeholder={translate('select.team.placeholder')}
                      onChange={(e: any) => {
                        setSelectedTeam(e!.value)
                        localStorage.setItem('selectedTeam', JSON.stringify(e!.value));
                      }}
                      classNamePrefix="reactSelect"
                    />
                  </div>
                </div>
              }
              {selectedTeam &&
                <FastApiList
                  team={selectedTeam}
                  setTeam={setSelectedTeam}
                  teamList={myTeamsRequest.data}
                />
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