import { getApolloContext } from '@apollo/client';
import React, { useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { updateTeam } from '../../../core';
import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import {IApiWithAuthorization, IState, IStateContext, ITeamSimple} from '../../../types';
import { ApiList } from '../team';
import { api as API, CanIDoAction, manage } from '../../utils';

export const ApiGroupApis = ({
  apiGroup
}: any) => {
  const navigate = useNavigate();

  const { connectedUser, apiCreationPermitted } = useSelector<IState, IStateContext>((s) => s.context);
  const dispatch = useDispatch();

  const [myTeams, setMyTeams] = useState<Array<ITeamSimple>>([]);

  const { client } = useContext(getApolloContext());

  useEffect(() => {
    if (!client) {
      return;
    }
    Promise.all([
      client.query<{ myTeams: Array<ITeamSimple> }>({
        query: Services.graphql.myTeams,
      }),
    ]).then(([ { data }]) => {
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

  const redirectToApiPage = (apiWithAuthorization: IApiWithAuthorization) => {
    navigate(`${apiWithAuthorization.api._humanReadableId}/${apiWithAuthorization.api.currentVersion}/description`);
  };



  const redirectToEditPage = (apiWithAuthorization: IApiWithAuthorization) => {
    if (CanIDoAction(connectedUser, manage, API, apiWithAuthorization.api.team, apiCreationPermitted)) {
      Promise.resolve(dispatch(updateTeam(apiWithAuthorization.api.team)))
        .then(() => {
          const url = apiWithAuthorization.api.apis
            ? `/${apiWithAuthorization.api.team._humanReadableId}/settings/apigroups/${apiWithAuthorization.api._humanReadableId}/infos`
            : `/${apiWithAuthorization.api.team._humanReadableId}/settings/apis/${apiWithAuthorization.api._humanReadableId}/${apiWithAuthorization.api.currentVersion}/infos`;
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
