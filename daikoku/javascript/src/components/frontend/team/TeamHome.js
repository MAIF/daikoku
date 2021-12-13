import React, { Component, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import * as Services from '../../../services';
import { ApiList } from './ApiList';
import { connect } from 'react-redux';
import { Can, read, team } from '../../utils';
import { updateUser } from '../../../core';
import { setError, updateTeamPromise } from '../../../core';
import { getApolloContext } from '@apollo/client';


function TeamHomeComponent(props) {
  const [state, setState] = useState({
    searched: '',
    team: null,
    apis: [],
  });

  const navigate = useNavigate();
  const params = useParams();

  const { client } = useContext(getApolloContext());

  const fetchData = (teamId) => {
    Promise.all([
      client.query({
        query: Services.graphql.myVisibleApisOfTeam(teamId),
      }),
      Services.team(teamId),
      Services.teams(),
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
            apis: visibleApis.map(({ api, authorizations }) => ({ ...api, authorizations })),
            team,
            teams,
            myTeams: myTeams.map(({ users, ...data }) => ({
              ...data,
              users: users.map(({ teamPermission, user }) => ({ ...user, teamPermission })),
            })),
          });
        }
      }
    );
  };

  useEffect(() => {
    fetchData(params.teamId);
  }, []);

  const askForApiAccess = (api, teams) => {
    return Services.askForApiAccess(teams, api._id).then(() =>
      fetchData(params.teamId)
    );
  };

  const toggleStar = (api) => {
    Services.toggleStar(api._id).then((res) => {
      if (!res.error) {
        const alreadyStarred = props.connectedUser.starredApis.includes(api._id);
        setState({
          ...state,
          apis: state.apis.map((a) => {
            if (a._id === api._id) a.stars += alreadyStarred ? -1 : 1;
            return a;
          }),
        });

        props.updateUser({
          ...props.connectedUser,
          starredApis: alreadyStarred
            ? props.connectedUser.starredApis.filter((id) => id !== api._id)
            : [...props.connectedUser.starredApis, api._id],
        });
      }
    });
  };

  const redirectToApiPage = (api) => {
    if (api.visibility === 'Public' || api.authorized) {
      const apiOwner = state.teams.find((t) => t._id === api.team._id);

      const route = (version) =>
        `/${apiOwner ? apiOwner._humanReadableId : api.team._id}/${
          api._humanReadableId
        }/${version}`;

      navigate(route(api.currentVersion));
    }
  };

  const redirectToTeamPage = (team) => {
    navigate(`/${team._humanReadableId}`);
  };

  const redirectToEditPage = (api) => {
    navigate(
      `/${params.teamId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`
    );
  };

  const redirectToTeamSettings = (team) => {
    navigate(`/${team._humanReadableId}/settings`);
    // props
    //   .updateTeam(team)
    //   .then(() => navigate(`/${team._humanReadableId}/settings`));
  };

  if (!state.team) {
    return null;
  }

  document.title = `${props.tenant.title} - ${state.team.name}`;

  return (
    <main role="main">
      <section className="organisation__header col-12 mb-4 p-3">
        <div className="container">
          <div className="row text-center">
            <div className="col-sm-4">
              <img
                className="organisation__avatar"
                src={state.team.avatar || '/assets/images/daikoku.svg'}
                alt="avatar"
              />
            </div>
            <div className="col-sm-7 d-flex flex-column justify-content-center">
              <h1 className="jumbotron-heading">{state.team.name}</h1>
              <div className="lead">{state.team.description}</div>
            </div>
            <div className="col-sm-1 d-flex flex-column">
              <Can I={read} a={team} team={state.team}>
                <div>
                  <a
                    href="#"
                    className="float-right team__settings btn btn-sm btn-access-negative"
                    onClick={() => redirectToTeamSettings(state.team)}>
                    <i className="fas fa-cogs" />
                  </a>
                </div>
              </Can>
            </div>
          </div>
        </div>
      </section>
      <ApiList
        apis={state.apis}
        teams={state.teams}
        myTeams={state.myTeams}
        teamVisible={false}
        askForApiAccess={askForApiAccess}
        toggleStar={toggleStar}
        redirectToApiPage={redirectToApiPage}
        redirectToEditPage={redirectToEditPage}
        redirectToTeamPage={redirectToTeamPage}
        showTeam={false}
        team={state.teams.find((team) => team._humanReadableId === params.teamId)}
      />
    </main>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateTeam: (team) => updateTeamPromise(team),
  setError: (error) => setError(error),
  updateUser: (u) => updateUser(u),
};

export const TeamHome = connect(mapStateToProps, mapDispatchToProps)(TeamHomeComponent);
