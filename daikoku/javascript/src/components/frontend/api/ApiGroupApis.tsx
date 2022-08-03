import { getApolloContext } from '@apollo/client';
import React, { useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { updateTeamPromise } from '../../../core';
import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { ApiList } from '../../frontend';
import { api as API, CanIDoAction, manage } from '../../utils';

export const ApiGroupApis = ({
  apiGroup
}: any) => {
  const navigate = useNavigate();

  const { connectedUser, apiCreationPermitted } = useSelector((s) => (s as any).context);
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState([]);
  const [myTeams, setMyTeams] = useState([]);

  const { client } = useContext(getApolloContext());

  useEffect(() => {
    setLoading(true);
    Promise.all([
      Services.teams(),
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      client.query({
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
    const adminTeam = (connectedUser.isDaikokuAdmin ? teams : myTeams).find((team) => api.team._id === (team as any)._id);

    // @ts-expect-error TS(2554): Expected 8 arguments, but got 5.
    if (CanIDoAction(connectedUser, manage, API, adminTeam, apiCreationPermitted)) {
      updateTeamPromise(adminTeam)(dispatch).then(() => {
        const url = api.apis
          ? // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            `/${adminTeam._humanReadableId}/settings/apigroups/${api._humanReadableId}/infos`
          : // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            `/${adminTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`;
        navigate(url);
      });
    }
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <main role="main">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <section className="organisation__header col-12 mb-4 p-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="container">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="row text-center">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-sm-7 d-flex flex-column justify-content-center">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <h1 className="jumbotron-heading">{apiGroup.name}</h1>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div
                dangerouslySetInnerHTML={{
                  __html: converter.makeHtml(apiGroup.smallDescription || ''),
                }}
              ></div>
            </div>
          </div>
        </div>
      </section>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <ApiList
        // @ts-expect-error TS(2322): Type '{ apis: any; teams: never[]; myTeams: never[... Remove this comment to see the full error message
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
  );
};
