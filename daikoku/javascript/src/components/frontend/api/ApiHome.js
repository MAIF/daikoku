import React, { Component } from 'react';
import hljs from 'highlight.js';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { Link } from 'react-router-dom';

import * as Services from '../../../services';
import { ApiCartidge, ApiConsole, ApiDocumentation, ApiPricing, ApiSwagger, ApiRedoc } from '.';
import { converter } from '../../../services/showdown';
import { Can, manage, api as API, access, backoffice } from '../../utils';
import { formatPlanType } from '../../utils/formatters';
import { setError } from '../../../core';

import 'highlight.js/styles/monokai.css';
import { Translation, t } from '../../../locales';
window.hljs = hljs;

export class ApiDescription extends Component {
  componentDidMount() {
    window.$('pre code').each((i, block) => {
      hljs.highlightBlock(block);
    });
  }

  render() {
    const api = this.props.api;
    return (
      <div className="d-flex col flex-column p-3 section">
        <div
          className="api-description"
          dangerouslySetInnerHTML={{ __html: converter.makeHtml(api.description) }}
        />
      </div>
    );
  }
}

class ApiHomeComponent extends Component {
  state = {
    api: null,
    subscriptions: [],
    pendingSubscriptions: [],
    ownerTeam: null,
    myTeams: [],
  };

  componentDidMount() {
    this.updateSubscriptions(this.props.match.params.apiId);
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (nextProps.match.params.apiId !== this.props.match.params.apiId) {
      this.updateSubscriptions(nextProps.match.params.apiId);
    }
  }

  updateSubscriptions = apiId => {
    Promise.all([Services.getVisibleApi(apiId), Services.myTeams()]).then(([api, myTeams]) => {
      if (api.error) {
        this.props.setError({ error: { status: 404, message: api.error } });
      } else {
        this.setState(
          {
            api,
            subscriptions: api.subscriptions,
            pendingSubscriptions: api.pendingRequests,
            myTeams,
          },
          () => Services.team(api.team).then(ownerTeam => this.setState({ ownerTeam }))
        );
      }
    });
  };

  askForApikeys = (teams, plan) => {
    const planName = formatPlanType(plan, this.props.currentLanguage);

    return Services.askForApiKey(this.state.api._id, teams, plan._id)
      .then(results => {
        if (results.error) {
          return toastr.error(t('Error', this.props.currentLanguage), results.error);
        }
        return results.forEach(result => {
          const team = this.state.myTeams.find(t => t._id === result.subscription.team);

          if (result.error) {
            return toastr.error(t('Error', this.props.currentLanguage), result.error);
          } else if (result.creation === 'done') {
            return toastr.success(
              t('Done', this.props.currentLanguage),
              t(
                'subscription.plan.accepted',
                this.props.currentLanguage,
                false,
                `Subscription to plan ${planName} for team ${team.name} is accepted`,
                planName,
                team.name
              )
            );
          } else if (result.creation === 'waiting') {
            return toastr.info(
              t('Pending request', this.props.currentLanguage),
              t(
                'subscription.plan.waiting',
                this.props.currentLanguage,
                false,
                `Subscription to plan ${planName} for team ${team.name} is waiting for acceptation`,
                planName,
                team.name
              )
            );
          }
        });
      })
      .then(() => this.updateSubscriptions(this.state.api._id));
  };

  redirectToEditPage = api => {
    const adminTeam = this.state.myTeams.find(team => api.team === team._id);
    this.props.history.push(`/${adminTeam._humanReadableId}/settings/apis/${api._humanReadableId}`);
  };

  render() {
    const { api, ownerTeam } = this.state;
    if (!api || !ownerTeam) {
      return null;
    }
    const tab = this.props.tab;
    const apiId = api._humanReadableId;
    const teamId = this.props.match.params.teamId;
    return (
      <main role="main" className="row">
        <section className="organisation__header col-12 mb-4 p-3">
          <div className="container">
            <h1 className="jumbotron-heading">
              <Link to={`/${ownerTeam._humanReadableId}`}>{ownerTeam.name}</Link> /{' '}
              <Link to={`/${ownerTeam._humanReadableId}/${api._humanReadableId}`}>{api.name}</Link>
              <Can I={manage} a={API} team={ownerTeam}>
                <a
                  href="#"
                  className="team__settings ml-2"
                  onClick={() => this.redirectToEditPage(api)}>
                  <button type="button" className="btn btn-sm btn-access-negative">
                    <i className="fas fa-edit" />
                  </button>
                </a>
              </Can>
            </h1>
            <p className="lead">{api.smallDescription}</p>
          </div>
        </section>
        <div className="container">
          <div className="row">
            <div className="col mt-3 onglets">
              <ul className="nav nav-tabs flex-column flex-sm-row">
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'description' ? 'active' : ''}`}
                    to={`/${this.props.match.params.teamId}/${apiId}`}>
                    <Translation i18nkey="Description" language={this.props.currentLanguage}>
                      Description
                    </Translation>
                  </Link>
                </li>
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'pricing' ? 'active' : ''}`}
                    to={`/${this.props.match.params.teamId}/${apiId}/pricing`}>
                    <Translation
                      i18nkey="Plan"
                      language={this.props.currentLanguage}
                      isPlural={true}>
                      Plans
                    </Translation>
                  </Link>
                </li>
                <li className="nav-item">
                  <Link
                    className={`nav-link ${
                      tab === 'documentation' || tab === 'documentation-page' ? 'active' : ''
                    }`}
                    to={`/${this.props.match.params.teamId}/${apiId}/documentation`}>
                    <Translation i18nkey="Documentation" language={this.props.currentLanguage}>
                      Documentation
                    </Translation>
                  </Link>
                </li>
                <li className="nav-item">
                  {api.swagger && (
                    <Link
                      className={`nav-link ${tab === 'redoc' ? 'active' : ''}`}
                      to={`/${this.props.match.params.teamId}/${apiId}/redoc`}>
                      <Translation i18nkey="Api Reference" language={this.props.currentLanguage}>
                        Api Reference
                      </Translation>
                    </Link>
                  )}
                  {!api.swagger && (
                    <span className={'nav-link disabled'}>
                      <Translation i18nkey="Api Reference" language={this.props.currentLanguage}>
                        Api Reference
                      </Translation>
                    </span>
                  )}
                </li>
                <Can I={access} a={backoffice}>
                  <li className="nav-item">
                    {api.swagger && api.testing.enabled && (
                      <Link
                        className={`nav-link ${tab === 'swagger' ? 'active' : ''}`}
                        to={`/${this.props.match.params.teamId}/${apiId}/swagger`}>
                        <Translation i18nkey="Try it !" language={this.props.currentLanguage}>
                          Try it !
                        </Translation>
                      </Link>
                    )}
                    {!(api.swagger && api.testing.enabled) && (
                      <span className={'nav-link disabled'}>Try it !</span>
                    )}
                  </li>
                </Can>
                {/*<li className="nav-item">
                  {api.testable && (
                    <Link
                      className={`nav-link ${api.testable ? '' : 'disabled'} ${tab === 'console' ? 'active' : ''}`}
                      to={`/${this.props.match.params.teamId}/${apiId}/console`}>
                      Test the API
                    </Link>
                  )}
                  {!api.testable && <span className={'nav-link disabled'}>Console</span>}
                </li>*/}
              </ul>
            </div>
          </div>
        </div>
        <div className="album py-2 col-12">
          <div className="container">
            <div className="row pt-3">
              {['pricing', 'description'].includes(tab) && (
                <ApiCartidge
                  myTeams={this.state.myTeams}
                  ownerTeam={this.state.ownerTeam}
                  api={api}
                  subscriptions={this.state.subscriptions}
                  askForApikeys={(teams, plan) => this.askForApikeys(teams, plan)}
                  pendingSubscriptions={this.state.pendingSubscriptions}
                  currentLanguage={this.props.currentLanguage}
                  redirectToApiKeysPage={team => {
                    this.props.history.push(
                      `/${team._humanReadableId}/settings/apikeys/${api._humanReadableId}`
                    );
                  }}
                />
              )}
              {tab === 'description' && (
                <ApiDescription
                  api={api}
                  ownerTeam={this.state.ownerTeam}
                  subscriptions={this.state.subscriptions}
                />
              )}
              {tab === 'pricing' && (
                <ApiPricing
                  userIsTenantAdmin={this.props.connectedUser.isDaikokuAdmin}
                  api={api}
                  myTeams={this.state.myTeams}
                  ownerTeam={this.state.ownerTeam}
                  subscriptions={this.state.subscriptions}
                  askForApikeys={(teams, plan) => this.askForApikeys(teams, plan)}
                  pendingSubscriptions={this.state.pendingSubscriptions}
                  updateSubscriptions={this.updateSubscriptions}
                  currentLanguage={this.props.currentLanguage}
                />
              )}
              {tab === 'documentation' && (
                <ApiDocumentation
                  api={api}
                  ownerTeam={this.state.ownerTeam}
                  match={this.props.match}
                  currentLanguage={this.props.currentLanguage}
                />
              )}
              {tab === 'documentation-page' && (
                <ApiDocumentation
                  api={api}
                  ownerTeam={this.state.ownerTeam}
                  match={this.props.match}
                  currentLanguage={this.props.currentLanguage}
                />
              )}
              {api.swagger && api.testing.enabled && tab === 'swagger' && (
                <ApiSwagger
                  api={api}
                  teamId={teamId}
                  ownerTeam={this.state.ownerTeam}
                  match={this.props.match}
                  testing={api.testing}
                />
              )}
              {tab === 'redoc' && (
                <ApiRedoc
                  api={api}
                  teamId={teamId}
                  ownerTeam={this.state.ownerTeam}
                  match={this.props.match}
                />
              )}
              {tab === 'console' && (
                <ApiConsole
                  api={api}
                  teamId={teamId}
                  ownerTeam={this.state.ownerTeam}
                  match={this.props.match}
                  subscriptions={this.state.subscriptions}
                  updateSubscriptions={this.updateSubscriptions}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

const mapDispatchToProps = {
  setError,
};

export const ApiHome = connect(mapStateToProps, mapDispatchToProps)(ApiHomeComponent);
