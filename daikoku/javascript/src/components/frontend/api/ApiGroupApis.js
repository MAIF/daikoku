import React, { useState, useEffect, useContext } from 'react';
import { getApolloContext } from '@apollo/client';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import * as Services from '../../../services';
import { ApiList } from '../../frontend';
import { converter } from '../../../services/showdown';
import { CanIDoAction, manage, api as API } from '../../utils';
import { updateTeamPromise } from '../../../core';


export const ApiGroupApis = ({ apiGroup }) => {
  const navigate = useNavigate();

  const { connectedUser, apiCreationPermitted } = useSelector(s => s.context)
  const dispatch = useDispatch()

  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState([]);
  const [myTeams, setMyTeams] = useState([]);

  const { client } = useContext(getApolloContext());

  useEffect(() => {
    setLoading(true);
    Promise.all([
      Services.teams(),
      client.query({
        query: Services.graphql.myTeams,
      }),
    ]).then(
      ([t, { data }]) => {
        setTeams(t)
        setMyTeams(data.myTeams.map(({ users, ...data }) => ({
          ...data,
          users: users.map(({ teamPermission, user }) => ({ ...user, teamPermission })),
        })))
        setLoading(false)
      }
    );
  }, [apiGroup])

  const redirectToApiPage = (api) => {
    navigate(`${api._humanReadableId}/${api.currentVersion}/description`)
  };

  const redirectToTeamPage = (team) => {
    navigate(`/${team._humanReadableId}`);
  };

  const redirectToEditPage = (api) => {
    const adminTeam = (connectedUser.isDaikokuAdmin ? teams : myTeams)
      .find((team) => api.team._id === team._id);

    if (CanIDoAction(connectedUser, manage, API, adminTeam, apiCreationPermitted)) {
      updateTeamPromise(adminTeam)(dispatch)
        .then(() => {
          const url = api.apis ?
            `/${adminTeam._humanReadableId}/settings/apigroups/${api._humanReadableId}/infos` :
            `/${adminTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`
          navigate(url)
        }
        );
    }
  };

  return (
    <main role="main">
      <section className="organisation__header col-12 mb-4 p-3">
        <div className="container">
          <div className="row text-center">
            <div className="col-sm-7 d-flex flex-column justify-content-center">
              <h1 className="jumbotron-heading">
                {apiGroup.name}
              </h1>
              <div dangerouslySetInnerHTML={{ __html: converter.makeHtml(apiGroup.smallDescription || '') }}></div>
            </div>
          </div>
        </div>
      </section>
      <ApiList
        apis={apiGroup.apis}
        teams={teams}
        myTeams={myTeams}
        teamVisible={true}
        redirectToApiPage={redirectToApiPage}
        redirectToEditPage={redirectToEditPage}
        redirectToTeamPage={redirectToTeamPage}
        showTeam={true}
        groupView={true}
      />
    </main>
  )
}