import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';

import { I18nContext, openContactModal, updateTeamPromise } from '../../../core';
import * as Services from '../../../services';
import { ApiList } from '../../frontend';
import { updateUser } from '../../../core';
import { api as API, CanIDoAction, manage } from '../../utils';
import { converter } from '../../../services/showdown';
import { getApolloContext, gql, useQuery } from '@apollo/client';

function MyHomeComponent(props) {
  const [state, setState] = useState({
    apis: [],
    teams: [],
    myTeams: [],
  });

  const { translateMethod } = useContext(I18nContext);

  const { client } = useContext(getApolloContext())

  const fetchData = () => {
    setState({ ...state, loading: true })
    Promise.all([Services.myVisibleApis(), Services.teams(), client.query({
      query: Services.graphql.myTeams
    })]).then(
      ([apis, teams, { data: { myTeams } }]) => {
        setState({ ...state, apis, teams, myTeams, loading: false });
      }
    );
  };

  useEffect(() => {
    fetchData();
  }, [props.connectedUser._id])

  const askForApiAccess = (api, teams) => Services.askForApiAccess(teams, api._id).then(() => fetchData());

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

  const redirectToTeamPage = (team) => {
    props.history.push(`/${team._humanReadableId}`);
  };

  const redirectToApiPage = (api) => {
    const apiOwner = state.teams.find((t) => t._id === api.team);

    const route = (version) =>
      `/${apiOwner ? apiOwner._humanReadableId : api.team}/${api._humanReadableId}/${version}`;

    if (api.isDefault) props.history.push(route(api.currentVersion));
    else
      Services.getDefaultApiVersion(api._humanReadableId).then((res) =>
        props.history.push(route(res.defaultVersion))
      );
  };

  const redirectToEditPage = (api) => {
    const adminTeam = state.myTeams.find((team) => api.team === team._id);

    if (
      CanIDoAction(
        props.connectedUser,
        manage,
        API,
        adminTeam,
        props.apiCreationPermitted
      )
    ) {
      props
        .updateTeam(adminTeam)
        .then(() =>
          props.history.push(
            `/${adminTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`
          )
        );
    }
  };

  return (
    <main role="main" className="row">
      <section className="organisation__header col-12 mb-4 p-3">
        <div className="container">
          <div className="row text-center">
            <div className="col-sm-4">
              <img
                className="organisation__avatar"
                src={props.tenant ? props.tenant.logo : '/assets/images/daikoku.svg'}
                alt="avatar"
              />
            </div>
            <div className="col-sm-7 d-flex flex-column justify-content-center">
              <h1 className="jumbotron-heading">
                {props.tenant.title ? props.tenant.title : translateMethod('Your APIs center')}
              </h1>
              <Description
                description={props.tenant.description}


              />
            </div>
            {props.connectedUser.isDaikokuAdmin && (
              <div className="col-sm-1 d-flex flex-column">
                <div>
                  <Link
                    to={`/settings/tenants/${props.tenant._humanReadableId}`}
                    className="tenant__settings float-right btn btn-sm btn-access-negative">
                    <i className="fas fa-cogs" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      <ApiList
        history={props.history}
        myTeams={state.myTeams}
        apis={state.apis}
        teams={state.teams}
        teamVisible={true}
        askForApiAccess={askForApiAccess}
        toggleStar={toggleStar}
        redirectToApiPage={redirectToApiPage}
        redirectToEditPage={redirectToEditPage}
        redirectToTeamPage={redirectToTeamPage}
        showTeam={true}
      />
    </main>
  );
}

const Description = (props) => {
  const { Translation } = useContext(I18nContext);

  if (!props.description) {
    return (
      <p className="lead">
        <Translation i18nkey="Daikoku description start">
          Daikoku is the perfect
        </Translation>
        <a href="https: //www.otoroshi.io">Otoroshi</a>
        <Translation i18nkey="Daikoku description end">
          companion to manage, document, and expose your beloved APIs to your developpers community.
          Publish a new API in a few seconds
        </Translation>
      </p>
    );
  }

  return (
    <div dangerouslySetInnerHTML={{ __html: converter.makeHtml(props.description || '') }}></div>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateTeam: (team) => updateTeamPromise(team),
  openContactModal: (props) => openContactModal(props),
  updateUser: (u) => updateUser(u),
};

export const MyHome = connect(mapStateToProps, mapDispatchToProps)(MyHomeComponent);
