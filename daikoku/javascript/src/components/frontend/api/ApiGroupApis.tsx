import { getApolloContext } from '@apollo/client';
import React, { useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { updateTeam } from '../../../core';
import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { isError, IState, IStateContext, ITeamSimple } from '../../../types';
import { ApiList } from '../team';
import { api as API, CanIDoAction, manage } from '../../utils';

export const ApiGroupApis = ({
  apiGroup
}: any) => {
  const navigate = useNavigate();

  const { connectedUser, apiCreationPermitted } = useSelector<IState, IStateContext>((s) => s.context);
  const dispatch = useDispatch();

  const [teams, setTeams] = useState<Array<ITeamSimple>>([]);
  const [myTeams, setMyTeams] = useState<Array<ITeamSimple>>([]);

  const { client } = useContext(getApolloContext());

  useEffect(() => {
    if (!client) {
      return;
    }
    Promise.all([
      Services.teams(),
      client.query<{ myTeams: Array<ITeamSimple> }>({
        query: Services.graphql.myTeams,
        variables: { }
      }),
    ]).then(([t, { data }]) => {
      if (!isError(t)) {
        setTeams(t);
      }
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
    });
  }, [apiGroup]);

  const redirectToApiPage = (api: any) => {
    navigate(`${api._humanReadableId}/${api.currentVersion}/description`);
  };



  const redirectToEditPage = (api: any) => {
    const adminTeam: any = (connectedUser.isDaikokuAdmin ? teams : myTeams).find((team) => api.team._id === (team as any)._id);

    if (CanIDoAction(connectedUser, manage, API, adminTeam, apiCreationPermitted)) {
      Promise.resolve(dispatch(updateTeam(adminTeam)))
        .then(() => {
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
        teams={teams}
        myTeams={myTeams}
        teamVisible={true}
        redirectToApiPage={redirectToApiPage}
        redirectToEditPage={redirectToEditPage}
        groupView={true}
        apiGroupId={apiGroup._id}
      />
    </main>
  );
};
