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

  const maybeTeam = localStorage.getItem('selectedTeam')

  const [selectedTeam, setSelectedTeam] = useState<ITeamSimple>(maybeTeam ? JSON.parse(maybeTeam) : undefined);

  const myTeamsRequest = useQuery(['myTeams'], () => Services.myTeams())

  if (myTeamsRequest.isLoading) {
    return <Spinner />
  } else if (myTeamsRequest.data && !isError(myTeamsRequest.data)) {
    return (
      <main role="main">
        <section className="bg-light col-12 mb-4 p-3">
          <div className="container-fluid">
            <h1 className="jumbotron-heading">{translate('fastMode.title')}</h1>
            {!selectedTeam && <p className="lead">
              Le fast mode de Daikoku vous permet d'afficher toutes les APIs accessible pour une équipe.
              Le processus de souscription est ainsi acceléré ....
              Veuillez commencer en selecxtionnant une équipe
            </p>}
          </div>
        </section>
        <section className="container">
          <div className="row mb-2">
            <div className="col-12 col-sm mb-2">
              {!selectedTeam &&
                <div className="d-flex justify-content-center">
                  <div className="col-6">
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
                <ExpertApiList
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