import { getApolloContext } from '@apollo/client';
import React, { useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { updateTeamPromise } from '../../../core';
import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { ITeamSimple } from '../../../types';
import { ApiList } from '../../frontend';
import { api as API, CanIDoAction, manage } from '../../utils';

export const ApiGroupApis = ({
  apiGroup
}: any) => {
  const navigate = useNavigate();

  const { connectedUser, apiCreationPermitted } = useSelector((s) => (s as any).context);
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Array<ITeamSimple>>([]);
  const [myTeams, setMyTeams] = useState<Array<ITeamSimple>>([]);

  const { client } = useContext(getApolloContext());

  useEffect(() => {
    if (!client) {
      return;
    }
    setLoading(true);
    Promise.all([
      Services.teams(),
      client.query<{myTeams: Array<ITeamSimple>}>({
        query: Services.graphql.myTeams,
      }),
    ]).then(([t, { data }]) => {
      setTeams(t);
      setMyTeams(
        data.myTeams.map(({
          users,
          ...data
        }: any) => ({
          ...data,
          users: users.map(({
            teamPermission,
            user
          }: any) => ({ ...user, teamPermission })),
        }))
      );
      setLoading(false);
    });
  }, [apiGroup]);

  const redirectToApiPage = (api: any) => {
    navigate(`${api._humanReadableId}/${api.currentVersion}/description`);
  };

  const redirectToTeamPage = (team: any) => {
    navigate(`/${team._humanReadableId}`);
  };

  const redirectToEditPage = (api: any) => {
    const adminTeam: any = (connectedUser.isDaikokuAdmin ? teams : myTeams).find((team) => api.team._id === (team as any)._id);

    if (CanIDoAction(connectedUser, manage, API, adminTeam, apiCreationPermitted)) {
      updateTeamPromise(adminTeam)(dispatch).then(() => {
        const url = api.apis
          ? `/${adminTeam._humanReadableId}/settings/apigroups/${api._humanReadableId}/infos`
          : `/${adminTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`;
        navigate(url);
      });
    }
  };

  return (
    <main role="main">
      <section className="organisation__header col-12 mb-4 p-3">
        <div className="container">
          <div className="row text-center">
            <div className="col-sm-7 d-flex flex-column justify-content-center">
              <h1 className="jumbotron-heading">{apiGroup.name}</h1>
              <div
                dangerouslySetInnerHTML={{
                  __html: converter.makeHtml(apiGroup.smallDescription || ''),
                }}
              ></div>
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
        toggleStar={(api) => Services.toggleStar(api._id)}
        askForApiAccess={(api, teams) => Services.askForApiAccess(teams, api._id)}
      />
    </main>
  );
};
