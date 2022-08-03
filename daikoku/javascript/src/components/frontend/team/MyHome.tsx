import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { Link, useLocation, useNavigate } from 'react-router-dom';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';

import { I18nContext, openContactModal, updateTeamPromise } from '../../../core';
import * as Services from '../../../services';
import { ApiList } from '../../frontend';
import { updateUser } from '../../../core';
import { api as API, CanIDoAction, manage, tenant as TENANT, Can } from '../../utils';
import { converter } from '../../../services/showdown';
import { getApolloContext } from '@apollo/client';

function MyHomeComponent(props: any) {
  const [state, setState] = useState({
    apis: [],
    teams: [],
    myTeams: [],
  });

  const location = useLocation();
  const navigate = useNavigate();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const { client } = useContext(getApolloContext());

  const fetchData = () => {
    // @ts-expect-error TS(2345): Argument of type '{ loading: boolean; apis: never[... Remove this comment to see the full error message
    setState({ ...state, loading: true });
    Promise.all([
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      client.query({
        query: Services.graphql.myVisibleApis,
      }),
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
        teams,
        {
          data: { myTeams },
        },
      ]) => {
        setState({
          ...state,
          apis: visibleApis.map(({
            api,
            authorizations
          }: any) => ({ ...api, authorizations })),
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
          // @ts-expect-error TS(2345): Argument of type '{ apis: any; teams: any; myTeams... Remove this comment to see the full error message
          loading: false,
        });
      }
    );
  };

  useEffect(() => {
    fetchData();
  }, [props.connectedUser._id, location.pathname]);

  const askForApiAccess = (api: any, teams: any) =>
    Services.askForApiAccess(teams, api._id).then(() => {
      toastr.info(translateMethod('ask.api.access.info', false, '', api.name));
      fetchData();
    });

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

  const redirectToTeamPage = (team: any) => {
    navigate(`/${team._humanReadableId}`);
  };

  const redirectToApiPage = (api: any) => {
    const apiOwner = state.teams.find((t) => (t as any)._id === api.team._id);

    const route = (version: any) => api.apis
    ? `/${apiOwner ? (apiOwner as any)._humanReadableId : api.team._id}/apigroups/${api._humanReadableId}/apis`
    : `/${apiOwner ? (apiOwner as any)._humanReadableId : api.team._id}/${api._humanReadableId}/${version}/description`;

    if (api.isDefault) navigate(route(api.currentVersion));
    else
      Services.getDefaultApiVersion(api._humanReadableId).then((res) =>
        navigate(route(res.defaultVersion))
      );
  };

  const redirectToEditPage = (api: any) => {
    const adminTeam = (props.connectedUser.isDaikokuAdmin ? state.teams : state.myTeams).find((team) => api.team._id === (team as any)._id);

    // @ts-expect-error TS(2554): Expected 8 arguments, but got 5.
    if (CanIDoAction(props.connectedUser, manage, API, adminTeam, props.apiCreationPermitted)) {
      props.updateTeam(adminTeam).then(() => {
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
            <div className="col-sm-4">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <img
                className="organisation__avatar"
                src={props.tenant ? props.tenant.logo : '/assets/images/daikoku.svg'}
                alt="avatar"
              />
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-sm-7 d-flex flex-column justify-content-center">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <h1 className="jumbotron-heading">
                {props.tenant.title ? props.tenant.title : translateMethod('Your APIs center')}
              </h1>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Description description={props.tenant.description} />
            </div>
          </div>
        </div>
      </section>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <ApiList
        // @ts-expect-error TS(2322): Type '{ apis: never[]; teams: never[]; myTeams: ne... Remove this comment to see the full error message
        apis={state.apis}
        teams={state.teams}
        myTeams={state.myTeams}
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

const Description = (props: any) => {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);

  if (!props.description) {
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <p className="lead">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Daikoku description start">Daikoku is the perfect</Translation>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <a href="https: //www.otoroshi.io">Otoroshi</a>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Daikoku description end">
          companion to manage, document, and expose your beloved APIs to your developpers community.
          Publish a new API in a few seconds
        </Translation>
      </p>
    );
  }

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div dangerouslySetInnerHTML={{ __html: converter.makeHtml(props.description || '') }}></div>
  );
};

const mapStateToProps = (state: any) => ({
  ...state.context
});

const mapDispatchToProps = {
  updateTeam: (team: any) => updateTeamPromise(team),
  // @ts-expect-error TS(2554): Expected 3-5 arguments, but got 1.
  openContactModal: (props: any) => openContactModal(props),
  updateUser: (u: any) => updateUser(u),
};

export const MyHome = connect(mapStateToProps, mapDispatchToProps)(MyHomeComponent);
