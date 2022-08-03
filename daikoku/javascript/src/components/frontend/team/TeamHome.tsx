import React, { Component, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import * as Services from '../../../services';
// @ts-expect-error TS(6142): Module './ApiList' was resolved to '/Users/qaubert... Remove this comment to see the full error message
import { ApiList } from './ApiList';
import { connect } from 'react-redux';
import { Can, read, team } from '../../utils';
import { updateUser } from '../../../core';
import { setError, updateTeamPromise } from '../../../core';
import { getApolloContext } from '@apollo/client';

const TeamHomeComponent = (props: any) => {
  const [state, setState] = useState({
    searched: '',
    team: null,
    apis: [],
  });

  const navigate = useNavigate();
  const params = useParams();

  const { client } = useContext(getApolloContext());

  const fetchData = (teamId: any) => {
    Promise.all([
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      client.query({
        query: Services.graphql.myVisibleApis,
        variables: { teamId },
      }),
      Services.team(teamId),
      Services.teams(),
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      client.query({
        query: Services.graphql.myTeams,
      }),
    ]).then(
      ([
        {
          data: { visibleApis },
        },
        team,
        teams,
        {
          data: { myTeams },
        },
      ]) => {
        if (visibleApis.error || team.error) {
          props.setError({ error: { status: 404, message: visibleApis.error } });
        } else {
          setState({
            ...state,
            apis: visibleApis.map(({
              api,
              authorizations
            }: any) => ({ ...api, authorizations })),
            team,
            // @ts-expect-error TS(2345): Argument of type '{ apis: any; team: any; teams: a... Remove this comment to see the full error message
            teams,
            myTeams: myTeams.map(({
              users,
              ...data
            }: any) => ({
              ...data,
              users: users.map(({
                teamPermission,
                user
              }: any) => ({ ...user, teamPermission })),
            })),
          });
        }
      }
    );
  };

  useEffect(() => {
    fetchData(params.teamId);
  }, [params]);

  const askForApiAccess = (api: any, teams: any) => {
    return Services.askForApiAccess(teams, api._id).then(() => fetchData(params.teamId));
  };

  const toggleStar = (api: any) => {
    Services.toggleStar(api._id).then((res) => {
      if (!res.error) {
        const alreadyStarred = props.connectedUser.starredApis.includes(api._id);
        setState({
          ...state,
          apis: state.apis.map((a) => {
            if ((a as any)._id === api._id) (a as any).stars += alreadyStarred ? -1 : 1;
            return a;
          }),
        });

        props.updateUser({
          ...props.connectedUser,
          starredApis: alreadyStarred
            ? props.connectedUser.starredApis.filter((id: any) => id !== api._id)
            : [...props.connectedUser.starredApis, api._id],
        });
      }
    });
  };

  const redirectToApiPage = (api: any) => {
    if (api.visibility === 'Public' || api.authorized) {
      // @ts-expect-error TS(2551): Property 'teams' does not exist on type '{ searche... Remove this comment to see the full error message
      const apiOwner = state.teams.find((t: any) => t._id === api.team._id);

      const route = (version: any) => `/${apiOwner ? apiOwner._humanReadableId : api.team._id}/${
        api._humanReadableId
      }/${version}/description`;

      navigate(route(api.currentVersion));
    }
  };

  const redirectToTeamPage = (team: any) => {
    navigate(`/${team._humanReadableId}`);
  };

  const redirectToEditPage = (api: any) => {
    navigate(`/${params.teamId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`);
  };

  const redirectToTeamSettings = (team: any) => {
    navigate(`/${team._humanReadableId}/settings`);
    // props
    //   .updateTeam(team)
    //   .then(() => navigate(`/${team._humanReadableId}/settings`));
  };

  if (!state.team) {
    return null;
  }

  document.title = `${props.tenant.title} - ${(state.team as any).name}`;

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<main role="main">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <section className="organisation__header col-12 mb-4 p-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="container">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="row text-center">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-sm-4">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <img className="organisation__avatar" src={(state.team as any).avatar || '/assets/images/daikoku.svg'} alt="avatar"/>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-sm-7 d-flex flex-column justify-content-center">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <h1 className="jumbotron-heading">{(state.team as any).name}</h1>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="lead">{(state.team as any).description}</div>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-sm-1 d-flex flex-column">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Can I={read} a={team} team={state.team}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <a href="#" className="float-right team__settings btn btn-sm btn-access-negative" onClick={() => redirectToTeamSettings(state.team)}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-cogs"/>
                  </a>
                </div>
              </Can>
            </div>
          </div>
        </div>
      </section>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <ApiList apis={state.apis} teams={state.teams} myTeams={(state as any).myTeams} teamVisible={false} askForApiAccess={askForApiAccess} toggleStar={toggleStar} redirectToApiPage={redirectToApiPage} redirectToEditPage={redirectToEditPage} redirectToTeamPage={redirectToTeamPage} showTeam={false} team={state.teams.find((team: any) => team._humanReadableId === params.teamId)}/>
    </main>);
};

const mapStateToProps = (state: any) => ({
  ...state.context
});

const mapDispatchToProps = {
  updateTeam: (team: any) => updateTeamPromise(team),
  setError: (error: any) => setError(error),
  updateUser: (u: any) => updateUser(u),
};

export const TeamHome = connect(mapStateToProps, mapDispatchToProps)(TeamHomeComponent);
