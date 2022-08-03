import React, { useState, useEffect, useContext } from 'react';
import { getApolloContext } from '@apollo/client';
import hljs from 'highlight.js';
import { connect } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
import { useParams, useNavigate, useMatch } from 'react-router-dom';
import Select from 'react-select';

import * as Services from '../../../services';
import { ApiDocumentation, ApiPricing, ApiSwagger, ApiRedoc, ApiPost, ApiIssue } from '.';
import { converter } from '../../../services/showdown';
import { Can, manage, apikey, ActionWithTeamSelector, CanIDoAction, Option } from '../../utils';
import { formatPlanType } from '../../utils/formatters';
import { setError, openContactModal, updateUser, I18nContext } from '../../../core';
// @ts-expect-error TS(6142): Module './StarsButton' was resolved to '/Users/qau... Remove this comment to see the full error message
import StarsButton from './StarsButton';
import { LoginOrRegisterModal } from '../modals';
import { useApiFrontOffice } from '../../../contexts';

import 'highlight.js/styles/monokai.css';

(window as any).hljs = hljs;

export const ApiDescription = ({
  api
}: any) => {
  useEffect(() => {
    (window as any).$('pre code').each((i: any, block: any) => {
    hljs.highlightElement(block);
});
  }, []);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex col flex-column p-3 section">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div
        className="api-description"
        dangerouslySetInnerHTML={{ __html: converter.makeHtml(api.description) }}
      />
    </div>
  );
};

export const ApiHeader = ({
  api,
  ownerTeam,
  connectedUser,
  toggleStar,
  tab
}: any) => {
  const navigate = useNavigate();
  const params = useParams();

  const [versions, setApiVersions] = useState([]);

  useEffect(() => {
    Services.getAllApiVersions(ownerTeam._id, params.apiId).then((versions) =>
      setApiVersions(versions.map((v: any) => ({
        label: v,
        value: v
      })))
    );
  }, []);

  if (api.header) {
    const apiHeader = api.header
      .replace('{{title}}', api.name)
      .replace('{{description}}', api.smallDescription);

    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <section className="api__header col-12 mb-4">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div
          className="api-description"
          dangerouslySetInnerHTML={{ __html: converter.makeHtml(apiHeader) }}
        />
      </section>
    );
  } else {
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <section className="api__header col-12 mb-4 p-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="container">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h1 className="jumbotron-heading" style={{ position: 'relative' }}>
            {api.name}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div
              style={{ position: 'absolute', right: 0, bottom: 0 }}
              className="d-flex align-items-center"
            >
              {versions.length > 1 && tab !== 'issues' && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <div style={{ minWidth: '125px', fontSize: 'initial' }}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Select
                    name="versions-selector"
                    value={{ label: params.versionId, value: params.versionId }}
                    options={versions}
                    onChange={(e) =>
                      // @ts-expect-error TS(2531): Object is possibly 'null'.
                      navigate(`/${params.teamId}/${params.apiId}/${e.value}/${tab}`)
                    }
                    classNamePrefix="reactSelect"
                    className="me-2"
                    menuPlacement="auto"
                    menuPosition="fixed"
                  />
                </div>
              )}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <StarsButton
                stars={api.stars}
                starred={connectedUser.starredApis.includes(api._id)}
                toggleStar={toggleStar}
              />
            </div>
          </h1>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <p className="lead">{api.smallDescription}</p>
        </div>
      </section>
    );
  }
};

const ApiHomeComponent = ({
  openContactModal,
  setError,
  connectedUser,
  updateUser,
  tenant,
  groupView
}: any) => {
  const [api, setApi] = useState(undefined);
  const [subscriptions, setSubscriptions] = useState([]);
  const [pendingSubscriptions, setPendingSubscriptions] = useState([]);
  const [ownerTeam, setOwnerTeam] = useState(undefined);
  const [myTeams, setMyTeams] = useState([]);
  const [showAccessModal, setAccessModalError] = useState(false);
  const [showGuestModal, setGuestModal] = useState(false);

  const navigate = useNavigate();
  const defaultParams = useParams();
  const apiGroupMatch = useMatch('/:teamId/apigroups/:apiGroupId/apis/:apiId/:versionId/:tab');
  const params = Option(apiGroupMatch)
    .map((match: any) => match.params)
    .getOrElse(defaultParams);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  const { client } = useContext(getApolloContext());

  const { addMenu } = groupView ? { addMenu: () => { } } : useApiFrontOffice(api, ownerTeam);

  useEffect(() => {
    updateSubscriptions(params.apiId);
  }, [params.apiId, params.versionId]);

  useEffect(() => {
    if (api) {
      Services.team((api as any).team)
    .then((ownerTeam) => setOwnerTeam(ownerTeam));
    }
  }, [api, params.versionId]);

  useEffect(() => {
    if (myTeams && subscriptions && !groupView) {
      const subscribingTeams = myTeams
    .filter((team) => subscriptions.some((sub) => (sub as any).team === (team as any)._id));
      const viewApiKeyLink = (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Can I={manage} a={apikey} teams={subscribingTeams}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ActionWithTeamSelector
            title={translateMethod(
              'teamapi.select.title',
              false,
              'Select the team to view your api key'
            )}
            // @ts-expect-error TS(2554): Expected 8 arguments, but got 4.
            teams={subscribingTeams.filter((t) => CanIDoAction(connectedUser, manage, apikey, t))}
            action={(teams) => {
              const team = myTeams.find((t) => teams.includes((t as any)._id));
              navigate(
                `/${                
// @ts-expect-error TS(2532): Object is possibly 'undefined'.
team._humanReadableId}/settings/apikeys/${api._humanReadableId}/${api.currentVersion}`
              );
            }}
            withAllTeamSelector={false}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span className="block__entry__link">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="View your api keys">View your api keys</Translation>
            </span>
          </ActionWithTeamSelector>
        </Can>
      );

      addMenu({
        blocks: {
          actions: { links: { viewApiKey: { label: 'view apikey', component: viewApiKeyLink } } },
        },
      });
    }
  }, [subscriptions, myTeams]);

  const updateSubscriptions = (apiId: any) => {
    Promise.all([
      Services.getVisibleApi(apiId, params.versionId),
      Services.getMySubscriptions(apiId, params.versionId),
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      client.query({
        query: Services.graphql.myTeams,
      }),
    ]).then(
      ([
        api,
        { subscriptions, requests },
        {
          data: { myTeams },
        },
      ]) => {
        if (api.error) {
          if (api.visibility && api.visibility === 'PublicWithAuthorizations') {
            Services.getMyTeamsStatusAccess(params.teamId, apiId, params.versionId).then((res) => {
              if (res.error) setGuestModal(true);
              else
                setAccessModalError({
                  // @ts-expect-error TS(2345): Argument of type '{ error: any; api: any; }' is no... Remove this comment to see the full error message
                  error: api.error,
                  api: res,
                });
            });
          } else setError({ error: { status: api.status || 404, message: api.error } });
        } else {
          setApi(api);
          setSubscriptions(subscriptions);
          setPendingSubscriptions(requests);
          setMyTeams(
            myTeams.map((team: any) => ({
              ...team,

              users: team.users.map((us: any) => ({
                ...us,
                ...us.user
              }))
            }))
          );
        }
      }
    );
  };

  const askForApikeys = (teams: any, plan: any, apiKey: any) => {
    const planName = formatPlanType(plan, translateMethod);

    return (
      apiKey
        ? // @ts-expect-error TS(2532): Object is possibly 'undefined'.
          Services.extendApiKey(api._id, apiKey._id, teams, plan._id)
        : // @ts-expect-error TS(2532): Object is possibly 'undefined'.
          Services.askForApiKey(api._id, teams, plan._id)
    )
      .then((results) => {
        if (results.error) {
          return toastr.error(translateMethod('Error'), results.error);
        }
        return results.forEach((result: any) => {
          if (result.error) {
            return toastr.error(translateMethod('Error'), result.error);
          } else if (result.creation === 'done') {
            const team = myTeams.find((t) => (t as any)._id === result.subscription.team);
            return toastr.success(
              translateMethod('Done'),
              translateMethod(
                'subscription.plan.accepted',
                false,
                `API key for ${planName} plan and the team ${                
// @ts-expect-error TS(2532): Object is possibly 'undefined'.
team.name} is available`,
                planName,
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                team.name
              )
            );
          } else if (result.creation === 'waiting') {
            const team = myTeams.find((t) => (t as any)._id === result.subscription.team);
            return toastr.info(
              translateMethod('Pending request'),
              translateMethod(
                'subscription.plan.waiting',
                false,
                `The API key request for ${planName} plan and the team ${                
// @ts-expect-error TS(2532): Object is possibly 'undefined'.
team.name} is pending acceptance`,
                planName,
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                team.name
              )
            );
          }
        });
      })
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      .then(() => updateSubscriptions(api._id));
  };

  const toggleStar = () => {
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    Services.toggleStar(api._id).then((res) => {
      if (!res.error) {
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        const alreadyStarred = connectedUser.starredApis.includes(api._id);
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        api.stars += alreadyStarred ? -1 : 1;
        setApi(api);

        updateUser({
          ...connectedUser,
          starredApis: alreadyStarred
            ? // @ts-expect-error TS(2532): Object is possibly 'undefined'.
              connectedUser.starredApis.filter((id: any) => id !== api._id)
            : // @ts-expect-error TS(2532): Object is possibly 'undefined'.
              [...connectedUser.starredApis, api._id],
        });
      }
    });
  };

  if (showGuestModal)
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div className="m-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <LoginOrRegisterModal
          tenant={tenant}
          showOnlyMessage={true}
          asFlatFormat
          message={translateMethod('guest_user_not_allowed')}
        />
      </div>
    );

  if (showAccessModal) {
    const teams = (showAccessModal as any).api.myTeams.filter((t: any) => t.type !== 'Admin');
    const pendingTeams = (showAccessModal as any).api.authorizations
    .filter((auth: any) => auth.pending)
    .map((auth: any) => auth.team);
    const authorizedTeams = (showAccessModal as any).api.authorizations
    .filter((auth: any) => auth.authorized)
    .map((auth: any) => auth.team);

    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return (<div className="mx-auto mt-3 d-flex flex-column justify-content-center">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h1 style={{ margin: 0 }}>{translateMethod((showAccessModal as any).error)}</h1>
        {(teams.length === 1 &&
        (pendingTeams.includes(teams[0]._id) || authorizedTeams.includes(teams[0]._id))) ||
        (showAccessModal as any).api.authorizations.every((auth: any) => auth.pending && !auth.authorized) ? // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          (<>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <h2 className="text-center my-3">{translateMethod('request_already_pending')}</h2>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button className="btn btn-outline-info mx-auto" style={{ width: 'fit-content' }} onClick={() => navigate(-1)}>
              {translateMethod('go_back')}
            </button>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          </>) : (<>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span className="text-center my-3">{translateMethod('request_api_access')}</span>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ActionWithTeamSelector title="Api access" description={translateMethod('api.access.request', false, `You will send an access request to the API "${params.apIid}". For which team do you want to send the request ?`, [params.apIid])} pendingTeams={pendingTeams} authorizedTeams={authorizedTeams} teams={teams} action={(teams) => {
            // @ts-expect-error TS(2339): Property 'api' does not exist on type 'true'.
            Services.askForApiAccess(teams, showAccessModal.api._id).then((_) => {
                // @ts-expect-error TS(2339): Property 'api' does not exist on type 'true'.
                toastr.info(translateMethod('ask.api.access.info', false, '', showAccessModal.api.name));
                // @ts-expect-error TS(2339): Property 'api' does not exist on type 'true'.
                updateSubscriptions(showAccessModal.api._id);
            });
        }}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button className="btn btn-success mx-auto" style={{ width: 'fit-content' }}>
                {translateMethod('notif.api.access', null, false, [params.apiId])}
              </button>
            </ActionWithTeamSelector>
          </>)}
      </div>);
                Services.askForApiAccess(teams, (showAccessModal as any).api._id).then((_) => {
    // @ts-expect-error TS(2339): Property 'api' does not exist on type 'boolean'.
    toastr.info(translateMethod('ask.api.access.info', false, '', showAccessModal.api.name));
    // @ts-expect-error TS(2339): Property 'api' does not exist on type 'boolean'.
    updateSubscriptions(showAccessModal.api._id);
});
                  toastr.info(translateMethod('ask.api.access.info', false, '', (showAccessModal as any).api.name));
                  updateSubscriptions((showAccessModal as any).api._id);
                });
              }}
            >
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <button className="btn btn-success mx-auto" style={{ width: 'fit-content' }}>
                {/* @ts-expect-error TS(2304): Cannot find name 'translateMethod'. */}
                {translateMethod('notif.api.access', null, false, [params.apiId])}
              </button>
            </ActionWithTeamSelector>
          </>
        )}
      // @ts-expect-error TS(2304): Cannot find name 'div'.
      </div>
    );
  }

  // @ts-expect-error TS(2304): Cannot find name 'api'.
  if (!api || !ownerTeam) {
    return null;
  }
  // @ts-expect-error TS(2304): Cannot find name 'params'.
  const teamId = params.teamId;

  // @ts-expect-error TS(2304): Cannot find name 'tenant'.
  document.title = `${tenant.title} - ${api ? (api as any).name : 'API'}`;

  return (<main role="main">
      <ApiHeader api={api} ownerTeam={ownerTeam} connectedUser={connectedUser} toggleStar={toggleStar} tab={params.tab}/>
      <div className="album py-2 col-12 min-vh-100">
        <div className="container">
          <div className="row pt-3">
            {params.tab === 'description' && (<ApiDescription api={api} ownerTeam={ownerTeam} subscriptions={subscriptions}/>)}
            {params.tab === 'pricing' && (<ApiPricing connectedUser={connectedUser} api={api} myTeams={myTeams} ownerTeam={ownerTeam} subscriptions={subscriptions} askForApikeys={askForApikeys} pendingSubscriptions={pendingSubscriptions} updateSubscriptions={updateSubscriptions} tenant={tenant}/>)}
            {params.tab === 'documentation' && <ApiDocumentation api={api} ownerTeam={ownerTeam}/>}
            {params.tab === 'testing' && (<ApiSwagger api={api} teamId={teamId} ownerTeam={ownerTeam} testing={(api as any).testing} tenant={tenant} connectedUser={connectedUser}/>)}
            {params.tab === 'swagger' && (<ApiRedoc api={api} teamId={teamId} ownerTeam={ownerTeam} tenant={tenant} connectedUser={connectedUser}/>)}
            {params.tab === 'news' && (<ApiPost api={api} ownerTeam={ownerTeam} versionId={params.versionId}/>)}
            {(params.tab === 'issues' || params.tab === 'labels') && (<ApiIssue api={api} onChange={(editedApi: any) => setApi(editedApi)} ownerTeam={ownerTeam} connectedUser={connectedUser}/>)}
          </div>
        </div>
      </div>
    </main>);
};

const mapStateToProps = (state: any) => ({
  ...state.context
});

const mapDispatchToProps = {
  setError: (e: any) => setError(e),
  // @ts-expect-error TS(2554): Expected 3-5 arguments, but got 1.
  openContactModal: (props: any) => openContactModal(props),
  updateUser: (u: any) => updateUser(u),
};

// @ts-expect-error TS(2345): Argument of type '({ openContactModal, setError, c... Remove this comment to see the full error message
export const ApiHome = connect(mapStateToProps, mapDispatchToProps)(ApiHomeComponent);
