import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { TeamBackOffice } from '../..';
import { isUserIsTeamAdmin, Can, manage, api as API } from '../../utils';
import { t, Translation } from '../../../locales';
import {
  TeamApiDescription,
  TeamApiDocumentation,
  TeamApiInfo,
  TeamApiOtoroshiPlaceholder,
  TeamApiPricing,
  TeamApiSwagger,
  TeamApiTesting,
} from '.';

import { setError, openSubMetadataModal, openTestingApiKeyModal } from '../../../core';

class TeamApiComponent extends Component {
  state = {
    api: null,
    create: false,
    tab: this.props.match.params.tab || 'infos',
    error: null,
    otoroshiSettings: [],
  };

  formSchema = {
    documentation: {
      _id: '',
      _tenant: '',
      pages: [],
      lastModificationAt: Date.now(),
    },
    possibleUsagePlans: [
      {
        _id: '1',
        maxPerMonth: 100,
        currency: {
          name: 'Euro',
          symbol: '€',
        },
        customName: null,
        customDescription: null,
        otoroshiTarget: null,
        type: 'FreeWithQuotas',
      },
    ],
    defaultUsagePlan: '1',
  };

  isTeamAdmin = () => {
    return (
      this.props.connectedUser.isDaikokuAdmin ||
      isUserIsTeamAdmin(this.props.connectedUser, this.props.currentTeam)
    );
  };

  componentDidMount() {
    if (this.props.location && this.props.location.state && this.props.location.state.newApi) {
      Services.allSimpleOtoroshis(this.props.tenant._id).then((otoroshiSettings) =>
        this.setState({
          otoroshiSettings,
          api: this.props.location.state.newApi,
          originalApi: this.props.location.state.newApi,
          create: true,
        })
      );
    } else {
      Promise.all([
        Services.teamApi(this.props.currentTeam._id, this.props.match.params.apiId),
        Services.allSimpleOtoroshis(this.props.tenant._id),
      ]).then(([api, otoroshiSettings]) => {
        this.setState({ api, originalApi: api, otoroshiSettings });
      });
    }
  }

  componentDidCatch(e) {
    console.log('TeamApiError', e);
  }

  save = () => {
    if (this.state.tab === 'documentation' && this.state.savePage) {
      this.state.savePage();
    }
    const editedApi = this.transformPossiblePlansBack(this.state.api);
    if (this.state.create) {
      return Services.createTeamApi(this.props.currentTeam._id, editedApi)
        .then((api) => {
          if (api.name) {
            toastr.success(
              t(
                'api.created.success',
                this.props.currentLanguage,
                false,
                `Api "${api.name}" created`,
                api.name
              )
            );
            return api;
          } else {
            return Promise.reject(api.error);
          }
        })
        .then((api) =>
          this.setState({ create: false, api }, () =>
            this.props.history.push(
              `/${this.props.currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/infos`
            )
          )
        )
        .catch((error) => toastr.error(t(error, this.props.currentLanguage)));
    } else {
      return Services.saveTeamApi(this.props.currentTeam._id, editedApi)
        .then(() => toastr.success(t('Api saved', this.props.currentLanguage)))
        .then(() => this.setState({ originalApi: editedApi }));
    }
  };

  delete = () => {
    window
      .confirm(
        t(
          'delete.api.confirm',
          this.props.currentLanguage,
          'Are you sure you want to delete this api ?'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.deleteTeamApi(this.props.currentTeam._id, this.state.api._id)
            .then(() =>
              this.props.history.push(`/${this.props.currentTeam._humanReadableId}/settings/apis`)
            )
            .then(() => toastr.success(t('deletion successful', this.props.currentLanguage)));
        }
      });
  };

  transformPossiblePlansBack = (api) => {
    if (!api) {
      return api;
    }
    const def = {
      otoroshiTarget: {
        otoroshiSettings: null,
        serviceGroup: null,
        apikeyCustomization: {
          clientIdOnly: false,
          constrainedServicesOnly: false,
          tags: [],
          metadata: {},
          customMetadata: [],
          restrictions: {
            enabled: false,
            allowLast: true,
            allowed: [],
            forbidden: [],
            notFound: [],
          },
        },
      },
    };
    const possibleUsagePlans = api.possibleUsagePlans || [];
    api.possibleUsagePlans = possibleUsagePlans.map((plan) => {
      plan.otoroshiTarget = plan.otoroshiTarget || { ...def.otoroshiTarget };
      plan.otoroshiTarget.apikeyCustomization = plan.otoroshiTarget.apikeyCustomization || {
        ...def.otoroshiTarget.apikeyCustomization,
      };
      plan.otoroshiTarget.apikeyCustomization.restrictions = plan.otoroshiTarget.apikeyCustomization
        .restrictions || { ...def.otoroshiTarget.apikeyCustomization.restrictions };
      return plan;
    });
    return api;
  };

  transformPossiblePlans = (api) => {
    if (!api) {
      return api;
    }
    const def = {
      otoroshiTarget: {
        otoroshiSettings: null,
        serviceGroup: null,
        apikeyCustomization: {
          clientIdOnly: false,
          constrainedServicesOnly: false,
          tags: [],
          metadata: {},
          customMetadata: [],
          restrictions: {
            enabled: false,
            allowLast: true,
            allowed: [],
            forbidden: [],
            notFound: [],
          },
        },
      },
    };
    const possibleUsagePlans = api.possibleUsagePlans || [];
    api.possibleUsagePlans = possibleUsagePlans.map((plan) => {
      plan.otoroshiTarget = plan.otoroshiTarget || { ...def.otoroshiTarget };
      plan.otoroshiTarget.apikeyCustomization = plan.otoroshiTarget.apikeyCustomization || {
        ...def.otoroshiTarget.apikeyCustomization,
      };
      plan.otoroshiTarget.apikeyCustomization.restrictions = plan.otoroshiTarget.apikeyCustomization
        .restrictions || { ...def.otoroshiTarget.apikeyCustomization.restrictions };
      return plan;
    });
    return api;
  };

  render() {
    const teamId = this.props.currentTeam._id;
    const disabled = {}; //TODO: deepEqual(this.state.originalApi, this.state.api) ? { disabled: 'disabled' } : {};
    const tab = this.state.tab;
    const editedApi = this.transformPossiblePlans(this.state.api);

    if (this.props.tenant.creationSecurity && !this.props.currentTeam.apisCreationPermission) {
      this.props.setError({ error: { status: 403, message: 'unauthorized' } });
    }

    return (
      <TeamBackOffice tab="Apis" isLoading={!editedApi} title={`${this.props.currentTeam.name} - ${this.state.api ? this.state.api.name : 'Api'}`}>
        <Can I={manage} a={API} team={this.props.currentTeam} dispatchError>
          {!editedApi && (
            <h3>
              <Translation i18nkey="No API" language={this.props.currentLanguage}>
                No API
              </Translation>
            </h3>
          )}
          {editedApi && (
            <>
              <div className="row">
                {!this.state.create && (
                  <h1>
                    Api - {editedApi.name}{' '}
                    <Link
                      to={`/${this.props.currentTeam._humanReadableId}/${editedApi._humanReadableId}`}
                      className="btn btn-sm btn-access-negative"
                      title={t('View this Api', this.props.currentLanguage)}>
                      <i className="fas fa-eye" />
                    </Link>
                  </h1>
                )}
                {this.state.create && (
                  <h1>
                    <Translation i18nkey="New api" language={this.props.currentLanguage}>
                      New api
                    </Translation>{' '}
                    - {editedApi.name}
                  </h1>
                )}
              </div>
              <div className="row">
                <ul className="nav nav-tabs flex-column flex-sm-row mb-3 mt-3">
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${tab === 'infos' ? 'active' : ''}`}
                      to={`/${this.props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/infos`}
                      onClick={() => this.setState({ tab: 'infos' })}>
                      <i className="fas fa-info mr-1" />
                      <Translation i18nkey="Informations" language={this.props.currentLanguage}>
                        Informations
                      </Translation>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${tab === 'description' ? 'active' : ''}`}
                      to={`/${this.props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/description`}
                      onClick={() => this.setState({ tab: 'description' })}>
                      <i className="fas fa-file-alt mr-1" />
                      <Translation i18nkey="Description" language={this.props.currentLanguage}>
                        Description
                      </Translation>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${tab === 'pricing' ? 'active' : ''}`}
                      to={`/${this.props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/plans`}
                      onClick={() => this.setState({ tab: 'pricing' })}>
                      <i className="fas fa-dollar-sign mr-1" />
                      <Translation i18nkey="Plan" language={this.props.currentLanguage} isPlural>
                        Plans
                      </Translation>
                    </Link>
                  </li>
                  {false && (
                    <li className="nav-item">
                      <Link
                        className={`nav-link ${tab === 'otoroshi' ? 'active' : ''}`}
                        to={`/${this.props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/otoroshi`}
                        onClick={() => this.setState({ tab: 'otoroshi' })}>
                        <i className="fas fa-pastafarianism mr-1" />
                        <Translation i18nkey="Otoroshi" language={this.props.currentLanguage}>
                          Otoroshi
                        </Translation>
                      </Link>
                    </li>
                  )}
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${tab === 'swagger' ? 'active' : ''}`}
                      to={`/${this.props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/swagger`}
                      onClick={() => this.setState({ tab: 'swagger' })}>
                      <i className="fas fa-file-code mr-1" />
                      <Translation i18nkey="Swagger" language={this.props.currentLanguage}>
                        Swagger
                      </Translation>
                    </Link>
                  </li>
                  {editedApi.visibility !== 'AdminOnly' && (
                    <li className="nav-item">
                      <Link
                        className={`nav-link ${tab === 'testing' ? 'active' : ''}`}
                        to={`/${this.props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/testing`}
                        onClick={() => this.setState({ tab: 'testing' })}>
                        <i className="fas fa-vial mr-1" />
                        <Translation i18nkey="Testing" language={this.props.currentLanguage}>
                          Testing
                        </Translation>
                      </Link>
                    </li>
                  )}
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${tab === 'documentation' ? 'active' : ''}`}
                      to={`/${this.props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/documentation`}
                      onClick={() => this.setState({ tab: 'documentation' })}>
                      <i className="fas fa-book mr-1" />
                      <Translation i18nkey="Documentation" language={this.props.currentLanguage}>
                        Documentation
                      </Translation>
                    </Link>
                  </li>
                </ul>
              </div>
              <div className="row">
                <div className="section col container-api">
                  <div className="mt-2">
                    {editedApi && this.state.tab === 'infos' && (
                      <TeamApiInfo
                        currentLanguage={this.props.currentLanguage}
                        creating={
                          this.props.location &&
                          this.props.location.state &&
                          !!this.props.location.state.newApi
                        }
                        value={editedApi}
                        getCategories={this.getApiCategories}
                        onChange={(api) => this.setState({ api })}
                      />
                    )}
                    {editedApi && this.state.tab === 'description' && (
                      <TeamApiDescription
                        currentLanguage={this.props.currentLanguage}
                        value={editedApi}
                        team={this.props.currentTeam}
                        onChange={(api) => this.setState({ api })}
                      />
                    )}
                    {editedApi && this.state.tab === 'swagger' && (
                      <TeamApiSwagger
                        currentLanguage={this.props.currentLanguage}
                        value={editedApi}
                        onChange={(api) => this.setState({ api })}
                      />
                    )}
                    {editedApi && this.state.tab === 'pricing' && (
                      <TeamApiPricing
                        currentLanguage={this.props.currentLanguage}
                        teamId={teamId}
                        value={editedApi}
                        onChange={(api) => this.setState({ api })}
                        otoroshiSettings={this.state.otoroshiSettings}
                        {...this.props}
                      />
                    )}
                    {editedApi && this.state.tab === 'plans' && (
                      <TeamApiPricing
                        currentLanguage={this.props.currentLanguage}
                        teamId={teamId}
                        value={editedApi}
                        onChange={(api) => this.setState({ api })}
                        tenant={this.props.tenant}
                      />
                    )}
                    {false && editedApi && this.state.tab === 'otoroshi' && (
                      <TeamApiOtoroshiPlaceholder
                        currentLanguage={this.props.currentLanguage}
                        value={editedApi}
                        onChange={(api) => this.setState({ api })}
                      />
                    )}
                    {editedApi && this.state.tab === 'documentation' && (
                      <TeamApiDocumentation
                        currentLanguage={this.props.currentLanguage}
                        creationInProgress={this.state.create}
                        team={this.props.currentTeam}
                        teamId={teamId}
                        value={editedApi}
                        onChange={(api) => this.setState({ api })}
                        save={this.save}
                        hookSavePage={(savePage) => this.setState({ savePage })}
                      />
                    )}
                    {editedApi && this.state.tab === 'testing' && (
                      <TeamApiTesting
                        currentLanguage={this.props.currentLanguage}
                        creationInProgress={this.state.create}
                        team={this.props.currentTeam}
                        teamId={teamId}
                        value={editedApi}
                        onChange={(api) => this.setState({ api })}
                        save={this.save}
                        hookSavePage={(savePage) => this.setState({ savePage })}
                        otoroshiSettings={this.state.otoroshiSettings}
                        openSubMetadataModal={this.props.openSubMetadataModal}
                        openTestingApiKeyModal={this.props.openTestingApiKeyModal}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="row form-back-fixedBtns">
                {!this.state.create && (
                  <button
                    type="button"
                    className="btn btn-outline-danger ml-1"
                    onClick={this.delete}>
                    <i className="fas fa-trash mr-1" />
                    <Translation i18nkey="Delete" language={this.props.currentLanguage}>
                      Delete
                    </Translation>
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline-success ml-1"
                  {...disabled}
                  onClick={this.save}>
                  {!this.state.create && (
                    <span>
                      <i className="fas fa-save mr-1" />
                      <Translation i18nkey="Save" language={this.props.currentLanguage}>
                        Save
                      </Translation>
                    </span>
                  )}
                  {this.state.create && (
                    <span>
                      <i className="fas fa-save mr-1" />
                      <Translation i18nkey="Create" language={this.props.currentLanguage}>
                        Create
                      </Translation>
                    </span>
                  )}
                </button>
              </div>
            </>
          )}
        </Can>
      </TeamBackOffice>
    );
  }
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  setError: (error) => setError(error),
  openSubMetadataModal: (props) => openSubMetadataModal(props),
  openTestingApiKeyModal: (props) => openTestingApiKeyModal(props)
};

export const TeamApi = connect(mapStateToProps, mapDispatchToProps)(TeamApiComponent);
