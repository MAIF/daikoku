import React, { useState, useEffect } from 'react';
import hljs from 'highlight.js';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { Link } from 'react-router-dom';

import * as Services from '../../../services';
import { ApiCartidge, ApiConsole, ApiDocumentation, ApiPricing, ApiSwagger, ApiRedoc } from '.';
import { converter } from '../../../services/showdown';
import { Can, manage, api as API, Option } from '../../utils';
import { formatPlanType } from '../../utils/formatters';
import { setError, openContactModal } from '../../../core';

import 'highlight.js/styles/monokai.css';
import { Translation, t } from '../../../locales';
window.hljs = hljs;

const ApiDescription = ({ api }) => {
  useEffect(() => {
    window.$('pre code').each((i, block) => {
      hljs.highlightBlock(block);
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

const ApiHeader = ({ api, ownerTeam, editUrl, history }) => {
  const handleBtnEditClick = () => history.push(editUrl);

  useEffect(() => {
    //fo custom header component
    var els = document.querySelectorAll('.btn-edit');

    if (els.length) {
      els.forEach((el) => el.addEventListener('click', handleBtnEditClick, false));
      return () => {
        els.forEach((el) => el.removeEventListener('click', handleBtnEditClick, false));
      };
    }
  }, []);

  const EditButton = () => (
    <Can I={manage} a={API} team={ownerTeam}>
      <Link to={editUrl} className="team__settings ml-2">
        <button type="button" className="btn btn-sm btn-access-negative">
          <i className="fas fa-edit" />
        </button>
      </Link>
    </Can>
  );

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
          <h1 className="jumbotron-heading">
            {api.name}
            <EditButton />
          </h1>
          <p className="lead">{api.smallDescription}</p>
        </div>
      </section>
    );
  }
};

const ApiHomeComponent = ({
  tab,
  openContactModal,
  match,
  history,
  setError,
  currentLanguage,
  connectedUser,
  tenant,
}) => {
  const [api, setApi] = useState(undefined);
  const [subscriptions, setSubscriptions] = useState([]);
  const [pendingSubscriptions, setPendingSubscriptions] = useState([]);
  const [ownerTeam, setOwnerTeam] = useState(undefined);
  const [myTeams, setMyTeams] = useState([]);

  useEffect(() => {
    updateSubscriptions(match.params.apiId);
  }, [match.params.apiId]);

  useEffect(() => {
    if (api) {
      Services.team(api.team).then((ownerTeam) => setOwnerTeam(ownerTeam));
    }
  }, [api]);

  const updateSubscriptions = (apiId) => {
    Promise.all([
      Services.getVisibleApi(apiId),
      Services.getMySubscriptions(apiId),
      Services.myTeams(),
    ]).then(([api, { subscriptions, requests }, teams]) => {
      if (api.error) {
        setError({ error: { status: 404, message: api.error } });
      } else {
        setApi(api);
        setSubscriptions(subscriptions);
        setPendingSubscriptions(requests);
        setMyTeams(teams);
      }
    });
  };

  const askForApikeys = (teams, plan) => {
    const planName = formatPlanType(plan, currentLanguage);

    return Services.askForApiKey(api._id, teams, plan._id)
      .then((results) => {
        if (results.error) {
          return toastr.error(t('Error', currentLanguage), results.error);
        }
        return results.forEach((result) => {
          const team = myTeams.find((t) => t._id === result.subscription.team);

          if (result.error) {
            return toastr.error(t('Error', currentLanguage), result.error);
          } else if (result.creation === 'done') {
            return toastr.success(
              t('Done', currentLanguage),
              t(
                'subscription.plan.accepted',
                currentLanguage,
                false,
                `API key for ${planName} plan and the team ${team.name} is available`,
                planName,
                team.name
              )
            );
          } else if (result.creation === 'waiting') {
            return toastr.info(
              t('Pending request', currentLanguage),
              t(
                'subscription.plan.waiting',
                currentLanguage,
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

  const editUrl = (api) => {
    return Option(myTeams.find((team) => api.team === team._id)).fold(
      () => '#',
      (adminTeam) => `/${adminTeam._humanReadableId}/settings/apis/${api._humanReadableId}`
    );
  };

  if (!api || !ownerTeam) {
    return null;
  }
  const apiId = api._humanReadableId;
  const teamId = match.params.teamId;

  //for contact modal
  const { isGuest, name, email } = connectedUser;
  const userName = isGuest ? undefined : name;
  const userEmail = isGuest ? undefined : email;

  document.title = `${tenant.name} - ${api ? api.name : 'API'}`;

  return (
    <main role="main" className="row">
      <ApiHeader api={api} ownerTeam={ownerTeam} editUrl={editUrl(api)} history={history} />
      <div className="container">
        <div className="row">
          <div className="col mt-3 onglets">
            <ul className="nav nav-tabs flex-column flex-sm-row">
              <li className="nav-item">
                <Link
                  className={`nav-link ${tab === 'description' ? 'active' : ''}`}
                  to={`/${match.params.teamId}/${apiId}`}>
                  <Translation i18nkey="Description" language={currentLanguage}>
                    Description
                  </Translation>
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link ${tab === 'pricing' ? 'active' : ''}`}
                  to={`/${match.params.teamId}/${apiId}/pricing`}>
                  <Translation i18nkey="Plan" language={currentLanguage} isPlural={true}>
                    Plans
                  </Translation>
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link ${
                    tab === 'documentation' || tab === 'documentation-page' ? 'active' : ''
                  }`}
                  to={`/${match.params.teamId}/${apiId}/documentation`}>
                  <Translation i18nkey="Documentation" language={currentLanguage}>
                    Documentation
                  </Translation>
                </Link>
              </li>
              <li className="nav-item">
                {api.swagger && (
                  <Link
                    className={`nav-link ${tab === 'redoc' ? 'active' : ''}`}
                    to={`/${match.params.teamId}/${apiId}/redoc`}>
                    <Translation i18nkey="Api Reference" language={currentLanguage}>
                      Api Reference
                    </Translation>
                  </Link>
                )}
                {!api.swagger && (
                  <span className={'nav-link disabled'}>
                    <Translation i18nkey="Api Reference" language={currentLanguage}>
                      Api Reference
                    </Translation>
                  </span>
                )}
              </li>
              {!connectedUser.isGuest && (
                <li className="nav-item">
                  {api.swagger && api.testing.enabled && (
                    <Link
                      className={`nav-link ${tab === 'swagger' ? 'active' : ''}`}
                      to={`/${match.params.teamId}/${apiId}/swagger`}>
                      <Translation i18nkey="Try it !" language={currentLanguage}>
                        Try it !
                      </Translation>
                    </Link>
                  )}
                  {!(api.swagger && api.testing.enabled) && (
                    <span className={'nav-link disabled'}>Try it !</span>
                  )}
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
      <div className="album py-2 col-12 min-vh-100">
        <div className="container">
          <div className="row pt-3">
            {['pricing', 'description'].includes(tab) && (
              <ApiCartidge
                connectedUser={connectedUser}
                myTeams={myTeams}
                ownerTeam={ownerTeam}
                api={api}
                subscriptions={subscriptions}
                askForApikeys={(teams, plan) => askForApikeys(teams, plan)}
                currentLanguage={currentLanguage}
                tenant={tenant}
                openContactModal={() =>
                  openContactModal(userName, userEmail, tenant._id, api.team, api._id)
                }
                redirectToApiKeysPage={(team) => {
                  history.push(
                    `/${team._humanReadableId}/settings/apikeys/${api._humanReadableId}`
                  );
                }}
              />
            )}
            {tab === 'description' && (
              <ApiDescription api={api} ownerTeam={ownerTeam} subscriptions={subscriptions} />
            )}
            {tab === 'pricing' && (
              <ApiPricing
                connectedUser={connectedUser}
                api={api}
                myTeams={myTeams}
                ownerTeam={ownerTeam}
                subscriptions={subscriptions}
                askForApikeys={(teams, plan) => askForApikeys(teams, plan)}
                pendingSubscriptions={pendingSubscriptions}
                updateSubscriptions={updateSubscriptions}
                currentLanguage={currentLanguage}
                tenant={tenant}
              />
            )}
            {tab === 'documentation' && (
              <ApiDocumentation
                api={api}
                ownerTeam={ownerTeam}
                match={match}
                currentLanguage={currentLanguage}
              />
            )}
            {tab === 'documentation-page' && (
              <ApiDocumentation
                api={api}
                ownerTeam={ownerTeam}
                match={match}
                currentLanguage={currentLanguage}
              />
            )}
            {api.swagger && api.testing.enabled && tab === 'swagger' && (
              <ApiSwagger
                api={api}
                teamId={teamId}
                ownerTeam={ownerTeam}
                match={match}
                testing={api.testing}
              />
            )}
            {tab === 'redoc' && (
              <ApiRedoc api={api} teamId={teamId} ownerTeam={ownerTeam} match={match} />
            )}
            {tab === 'console' && (
              <ApiConsole
                api={api}
                teamId={teamId}
                ownerTeam={ownerTeam}
                match={match}
                subscriptions={subscriptions}
                updateSubscriptions={updateSubscriptions}
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
  setError,
  openContactModal,
};

export const ApiHome = connect(mapStateToProps, mapDispatchToProps)(ApiHomeComponent);
