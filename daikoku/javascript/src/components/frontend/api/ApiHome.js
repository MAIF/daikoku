import React, { useState, useEffect, useContext } from 'react';
import { getApolloContext } from '@apollo/client';
import hljs from 'highlight.js';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Select from 'react-select';

import * as Services from '../../../services';
import {
  ApiDocumentation,
  ApiPricing,
  ApiSwagger,
  ApiRedoc,
  ApiPost,
  ApiIssue,
} from '.';
import { converter } from '../../../services/showdown';
import { Can, manage, apikey, ActionWithTeamSelector, CanIDoAction } from '../../utils';
import { formatPlanType } from '../../utils/formatters';
import { setError, openContactModal, updateUser, I18nContext } from '../../../core';
import StarsButton from './StarsButton';
import { LoginOrRegisterModal } from '../modals';
import { useApiFrontOffice } from '../../../contexts'

import 'highlight.js/styles/monokai.css';

window.hljs = hljs;

const ApiDescription = ({ api }) => {
  useEffect(() => {
    window.$('pre code').each((i, block) => {
      hljs.highlightElement(block);
    });
  }, []);

  return (
    <div className="d-flex col flex-column p-3 section">
      <div
        className="api-description"
        dangerouslySetInnerHTML={{ __html: converter.makeHtml(api.description) }}
      />
    </div>
  );
};

const ApiHeader = ({ api, ownerTeam, connectedUser, toggleStar, tab }) => {
  const navigate = useNavigate();
  const params = useParams();

  const [versions, setApiVersions] = useState([]);

  useEffect(() => {
    Services.getAllApiVersions(ownerTeam._id, params.apiId).then((versions) =>
      setApiVersions(versions.map((v) => ({ label: v, value: v })))
    );
  }, []);

  if (api.header) {
    const apiHeader = api.header
      .replace('{{title}}', api.name)
      .replace('{{description}}', api.smallDescription);

    return (
      <section className="api__header col-12 mb-4">
        <div
          className="api-description"
          dangerouslySetInnerHTML={{ __html: converter.makeHtml(apiHeader) }}
        />
      </section>
    );
  } else {
    return (
      <section className="api__header col-12 mb-4 p-3">
        <div className="container">
          <h1 className="jumbotron-heading" style={{ position: 'relative' }}>
            {api.name}
            <div
              style={{ position: 'absolute', right: 0, bottom: 0 }}
              className="d-flex align-items-center"
            >
              {versions.length > 1 && tab !== 'issues' && (
                <div style={{ minWidth: '125px', fontSize: 'initial' }}>
                  <Select
                    name="versions-selector"
                    value={{ label: params.versionId, value: params.versionId }}
                    options={versions}
                    onChange={(e) =>
                      navigate(`/${params.teamId}/${params.apiId}/${e.value}/${tab}`)
                    }
                    classNamePrefix="reactSelect"
                    className="me-2"
                    menuPlacement="auto"
                    menuPosition="fixed"
                  />
                </div>
              )}
              <StarsButton
                stars={api.stars}
                starred={connectedUser.starredApis.includes(api._id)}
                toggleStar={toggleStar}
              />
            </div>
          </h1>
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
}) => {
  const [api, setApi] = useState(undefined);
  const [subscriptions, setSubscriptions] = useState([]);
  const [pendingSubscriptions, setPendingSubscriptions] = useState([]);
  const [ownerTeam, setOwnerTeam] = useState(undefined);
  const [myTeams, setMyTeams] = useState([]);
  const [showAccessModal, setAccessModalError] = useState(false);
  const [showGuestModal, setGuestModal] = useState(false);

  const navigate = useNavigate();
  const params = useParams();

  const { translateMethod, Translation } = useContext(I18nContext);

  const { client } = useContext(getApolloContext());

  const { addMenu } = useApiFrontOffice(api, ownerTeam)

  useEffect(() => {
    updateSubscriptions(params.apiId);
  }, [params.apiId, params.versionId]);

  useEffect(() => {
    if (api) {
      Services.team(api.team)
        .then((ownerTeam) => setOwnerTeam(ownerTeam));
    }
  }, [api, params.versionId]);
  

  useEffect(() => {
    if (myTeams && subscriptions) {
      const subscribingTeams = myTeams
        .filter((team) => subscriptions.some((sub) => sub.team === team._id));
      const viewApiKeyLink = (
        <Can I={manage} a={apikey} teams={subscribingTeams}>
          <ActionWithTeamSelector
            title={translateMethod(
              'teamapi.select.title',
              false,
              'Select the team to view your api key'
            )}
            teams={subscribingTeams.filter((t) =>
              CanIDoAction(connectedUser, manage, apikey, t)
            )}
            action={(teams) => {
              const team = myTeams.find((t) => teams.includes(t._id))
              navigate(`/${team._humanReadableId}/settings/apikeys/${api._humanReadableId}/${api.currentVersion}`);
            }}
            withAllTeamSelector={false}
          >
            <span className="block__entry__link">
              <Translation i18nkey="View your api keys">View your api keys</Translation>
            </span>
          </ActionWithTeamSelector>
        </Can>
      )

      addMenu({ blocks: { actions: { links: { viewApiKey: { label: 'view apikey', component: viewApiKeyLink } } } }})
    }
  }, [subscriptions, myTeams])


  const updateSubscriptions = (apiId) => {
    console.debug({params})
    Promise.all([
      Services.getVisibleApi(apiId, params.versionId),
      Services.getMySubscriptions(apiId, params.versionId),
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
            myTeams.map((team) => ({
              ...team,
              users: team.users.map((us) => ({ ...us, ...us.user })),
            }))
          );
        }
      }
    );
  };

  const askForApikeys = (teams, plan, apiKey) => {
    const planName = formatPlanType(plan, translateMethod);

    return (
      apiKey
        ? Services.extendApiKey(api._id, apiKey._id, teams, plan._id)
        : Services.askForApiKey(api._id, teams, plan._id)
    )
      .then((results) => {
        if (results.error) {
          return toastr.error(translateMethod('Error'), results.error);
        }
        return results.forEach((result) => {
          if (result.error) {
            return toastr.error(translateMethod('Error'), result.error);
          } else if (result.creation === 'done') {
            const team = myTeams.find((t) => t._id === result.subscription.team);
            return toastr.success(
              translateMethod('Done'),
              translateMethod(
                'subscription.plan.accepted',
                false,
                `API key for ${planName} plan and the team ${team.name} is available`,
                planName,
                team.name
              )
            );
          } else if (result.creation === 'waiting') {
            const team = myTeams.find((t) => t._id === result.subscription.team);
            return toastr.info(
              translateMethod('Pending request'),
              translateMethod(
                'subscription.plan.waiting',
                false,
                `The API key request for ${planName} plan and the team ${team.name} is pending acceptance`,
                planName,
                team.name
              )
            );
          }
        });
      })
      .then(() => updateSubscriptions(api._id));
  };

  const toggleStar = () => {
    Services.toggleStar(api._id).then((res) => {
      if (!res.error) {
        const alreadyStarred = connectedUser.starredApis.includes(api._id);
        api.stars += alreadyStarred ? -1 : 1;
        setApi(api);

        updateUser({
          ...connectedUser,
          starredApis: alreadyStarred
            ? connectedUser.starredApis.filter((id) => id !== api._id)
            : [...connectedUser.starredApis, api._id],
        });
      }
    });
  };

  if (showGuestModal)
    return (
      <div className="m-3">
        <LoginOrRegisterModal
          tenant={tenant}
          showOnlyMessage={true}
          asFlatFormat
          message={translateMethod('guest_user_not_allowed')}
        />
      </div>
    );

  if (showAccessModal) {
    const teams = showAccessModal.api.myTeams.filter((t) => t.type !== 'Admin');
    const pendingTeams = showAccessModal.api.authorizations
      .filter((auth) => auth.pending)
      .map((auth) => auth.team);
    const authorizedTeams = showAccessModal.api.authorizations
      .filter((auth) => auth.authorized)
      .map((auth) => auth.team);

    return (
      <div className="mx-auto mt-3 d-flex flex-column justify-content-center">
        <h1 style={{ margin: 0 }}>{translateMethod(showAccessModal.error)}</h1>
        {(teams.length === 1 &&
          (pendingTeams.includes(teams[0]._id) || authorizedTeams.includes(teams[0]._id))) ||
          showAccessModal.api.authorizations.every((auth) => auth.pending && !auth.authorized) ? (
          <>
            <h2 className="text-center my-3">{translateMethod('request_already_pending')}</h2>
            <button
              className="btn btn-outline-info mx-auto"
              style={{ width: 'fit-content' }}
              onClick={() => navigate(-1)}
            >
              {translateMethod('go_back')}
            </button>
          </>
        ) : (
          <>
            <span className="text-center my-3">{translateMethod('request_api_access')}</span>
            <ActionWithTeamSelector
              title="Api access"
              description={translateMethod(
                'api.access.request',
                false,
                `You will send an access request to the API "${params.apIid}". For which team do you want to send the request ?`,
                [params.apIid]
              )}
              pendingTeams={pendingTeams}
              authorizedTeams={authorizedTeams}
              teams={teams}
              action={(teams) => {
                Services.askForApiAccess(teams, showAccessModal.api._id).then((_) => {
                  toastr.info(
                    translateMethod('ask.api.access.info', false, '', showAccessModal.api.name)
                  );
                  updateSubscriptions(showAccessModal.api._id);
                });
              }}
            >
              <button className="btn btn-success mx-auto" style={{ width: 'fit-content' }}>
                {translateMethod('notif.api.access', null, false, [params.apiId])}
              </button>
            </ActionWithTeamSelector>
          </>
        )}
      </div>
    );
  }

  if (!api || !ownerTeam) {
    return null;
  }
  const teamId = params.teamId;

  document.title = `${tenant.title} - ${api ? api.name : 'API'}`;

  return (
    <main role="main">
      <ApiHeader
        api={api}
        ownerTeam={ownerTeam}
        connectedUser={connectedUser}
        toggleStar={toggleStar}
        tab={params.tab}
      />
      <div className="album py-2 col-12 min-vh-100">
        <div className="container">
          <div className="row pt-3">
            {params.tab === 'description' && (
              <ApiDescription api={api} ownerTeam={ownerTeam} subscriptions={subscriptions} />
            )}
            {params.tab === 'pricing' && (
              <ApiPricing
                connectedUser={connectedUser}
                api={api}
                myTeams={myTeams}
                ownerTeam={ownerTeam}
                subscriptions={subscriptions}
                askForApikeys={askForApikeys}
                pendingSubscriptions={pendingSubscriptions}
                updateSubscriptions={updateSubscriptions}
                tenant={tenant}
              />
            )}
            {params.tab === 'documentation' && <ApiDocumentation api={api} ownerTeam={ownerTeam} />}
            {params.tab === 'testing' && (
              <ApiSwagger
                api={api}
                teamId={teamId}
                ownerTeam={ownerTeam}
                testing={api.testing}
                tenant={tenant}
                connectedUser={connectedUser}
              />
            )}
            {params.tab === 'swagger' && (
              <ApiRedoc
                api={api}
                teamId={teamId}
                ownerTeam={ownerTeam}
                tenant={tenant}
                connectedUser={connectedUser}
              />
            )}
            {params.tab === 'news' && (
              <ApiPost api={api} ownerTeam={ownerTeam} versionId={params.versionId} />
            )}
            {(params.tab === 'issues' || params.tab === 'labels') && (
              <ApiIssue
                api={api}
                onChange={(editedApi) => setApi(editedApi)}
                ownerTeam={ownerTeam}
                connectedUser={connectedUser}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  setError: (e) => setError(e),
  openContactModal: (props) => openContactModal(props),
  updateUser: (u) => updateUser(u),
};

export const ApiHome = connect(mapStateToProps, mapDispatchToProps)(ApiHomeComponent);
