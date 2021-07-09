import React, { useState, useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { TeamBackOffice } from '../..';
import { Can, manage, api as API } from '../../utils';
import { t, Translation } from '../../../locales';
import {
  TeamApiDescription,
  TeamApiDocumentation,
  TeamApiInfo,
  TeamApiOtoroshiPlaceholder,
  TeamApiPricing,
  TeamApiSwagger,
  TeamApiTesting,
  TeamApiPost,
} from '.';

import { setError, openSubMetadataModal, openTestingApiKeyModal } from '../../../core';
import { gt } from 'semver';

function TeamApiComponent(props) {
  const location = useLocation()
  const params = useParams()

  const [state, setState] = useState({
    api: null,
    create: false,
    tab: params.tab || 'infos',
    error: null,
    otoroshiSettings: [],
  });

  useEffect(() => {
    console.log(params)
    if (location && location.state && location.state.newApi) {
      Services.allSimpleOtoroshis(props.tenant._id).then((otoroshiSettings) =>
        setState({
          ...state,
          otoroshiSettings,
          api: location.state.newApi,
          originalApi: location.state.newApi,
          create: true,
        })
      );
    } else {
      Promise.all([
        Services.teamApi(props.currentTeam._id, params.apiId),
        Services.allSimpleOtoroshis(props.tenant._id),
      ]).then(([api, otoroshiSettings]) => {
        setState({ ...state, api, originalApi: api, otoroshiSettings });
      });
    }
  }, [location]);

  function save() {
    if (state.tab === 'documentation' && state.savePage) {
      state.savePage();
    }
    const editedApi = transformPossiblePlansBack(state.api);
    if (state.create) {
      return Services.createTeamApi(props.currentTeam._id, editedApi)
        .then((api) => {
          if (api.name) {
            toastr.success(
              t(
                'api.created.success',
                props.currentLanguage,
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
          setState({ ...state, create: false, api }, () =>
            props.history.push(
              `/${props.currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/infos`
            )
          )
        )
        .catch((error) => toastr.error(t(error, props.currentLanguage)));
    } else {
      return Services.saveTeamApi(props.currentTeam._id, editedApi)
        .then(() => toastr.success(t('Api saved', props.currentLanguage)))
        .then(() => setState({ ...state, originalApi: editedApi }));
    }
  }

  function deleteApi() {
    window
      .confirm(
        t(
          'delete.api.confirm',
          props.currentLanguage,
          'Are you sure you want to delete this api ?'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.deleteTeamApi(props.currentTeam._id, state.api._id)
            .then(() =>
              props.history.push(`/${props.currentTeam._humanReadableId}/settings/apis`)
            )
            .then(() => toastr.success(t('deletion successful', props.currentLanguage)));
        }
      });
  }

  function transformPossiblePlansBack(api) {
    if (!api) {
      return api;
    }
    const def = {
      otoroshiTarget: {
        otoroshiSettings: null,
        authorizedEntities: { groups: [], services: [] },
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

  function transformPossiblePlans(api) {
    if (!api) {
      return api;
    }
    const def = {
      otoroshiTarget: {
        otoroshiSettings: null,
        authorizedEntities: { groups: [], services: [] },
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

  function promptVersion() {
    const { api } = state
    window.prompt("Version number", undefined, false, "Create a new version", `Current version : ${api.currentVersion}`)
      .then(newVersion => {
        if (gt(api.currentVersion, newVersion))
          window.confirm("Are you sure to create a version less greater than the previous ?")
            .then(ok => {
              if (ok)
                createNewVersion(newVersion)
            })
        else
          createNewVersion(newVersion)
      })
  }

  function createNewVersion(newVersion) {
    Services.createNewApiVersion(state.api._id, props.currentTeam._id, newVersion)
      .then(res => {
        if (res.status === 201) {
          toastr.success("New version of api created")
          props.history.push(`${props.location.pathname}/versions/${newVersion}`)
        } else
          res.json()
            .then(data => toastr.error(data.error))
      })
  }

  const teamId = props.currentTeam._id;
  const disabled = {}; //TODO: deepEqual(state.originalApi, state.api) ? { disabled: 'disabled' } : {};
  const tab = state.tab;
  const editedApi = transformPossiblePlans(state.api);

  if (props.tenant.creationSecurity && !props.currentTeam.apisCreationPermission) {
    props.setError({ error: { status: 403, message: 'unauthorized' } });
  }

  return (
    <TeamBackOffice
      tab="Apis"
      isLoading={!editedApi}
      title={`${props.currentTeam.name} - ${state.api ? state.api.name : t('API', props.currentLanguage)
        }`}>
      <Can I={manage} a={API} team={props.currentTeam} dispatchError>
        {!editedApi && (
          <h3>
            <Translation i18nkey="No API" language={props.currentLanguage}>
              No API
            </Translation>
          </h3>
        )}
        {editedApi && (
          <>
            <div className="row">
              {
                state.create ?
                  <h1>
                    <Translation i18nkey="New api" language={props.currentLanguage}>
                      New api
                    </Translation>{' '}
                    - {editedApi.name}
                  </h1>
                  :
                  <div className="d-flex justify-content-between align-items-center" style={{ flex: 1 }}>
                    <h1>
                      Api - {editedApi.name}{' '}
                      <Link
                        to={`/${props.currentTeam._humanReadableId}/${editedApi._humanReadableId}`}
                        className="btn btn-sm btn-access-negative"
                        title={t('View this Api', props.currentLanguage)}>
                        <i className="fas fa-eye" />
                      </Link>
                    </h1>
                    <button type="button" className="btn btn-sm btn-outline-info" onClick={promptVersion}>
                      <i className="fas fa-plus mr-1" />
                      {t('teamapi.new_version', props.currentLanguage)}
                    </button>
                  </div>
              }
            </div>
            <div className="row">
              <ul className="nav nav-tabs flex-column flex-sm-row mb-3 mt-3">
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'infos' ? 'active' : ''}`}
                    to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/infos`}
                    onClick={() => setState({ ...state, tab: 'infos' })}>
                    <i className="fas fa-info mr-1" />
                    <Translation i18nkey="Informations" language={props.currentLanguage}>
                      Informations
                    </Translation>
                  </Link>
                </li>
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'description' ? 'active' : ''}`}
                    to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/description`}
                    onClick={() => setState({ ...state, tab: 'description' })}>
                    <i className="fas fa-file-alt mr-1" />
                    <Translation i18nkey="Description" language={props.currentLanguage}>
                      Description
                    </Translation>
                  </Link>
                </li>
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'pricing' ? 'active' : ''}`}
                    to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/plans`}
                    onClick={() => setState({ ...state, tab: 'pricing' })}>
                    <i className="fas fa-dollar-sign mr-1" />
                    <Translation i18nkey="Plan" language={props.currentLanguage} isPlural>
                      Plans
                    </Translation>
                  </Link>
                </li>
                {false && (
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${tab === 'otoroshi' ? 'active' : ''}`}
                      to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/otoroshi`}
                      onClick={() => setState({ ...state, tab: 'otoroshi' })}>
                      <i className="fas fa-pastafarianism mr-1" />
                      <Translation i18nkey="Otoroshi" language={props.currentLanguage}>
                        Otoroshi
                      </Translation>
                    </Link>
                  </li>
                )}
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'swagger' ? 'active' : ''}`}
                    to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/swagger`}
                    onClick={() => setState({ ...state, tab: 'swagger' })}>
                    <i className="fas fa-file-code mr-1" />
                    <Translation i18nkey="Swagger" language={props.currentLanguage}>
                      Swagger
                    </Translation>
                  </Link>
                </li>
                {editedApi.visibility !== 'AdminOnly' && (
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${tab === 'testing' ? 'active' : ''}`}
                      to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/testing`}
                      onClick={() => setState({ ...state, tab: 'testing' })}>
                      <i className="fas fa-vial mr-1" />
                      <Translation i18nkey="Testing" language={props.currentLanguage}>
                        Testing
                      </Translation>
                    </Link>
                  </li>
                )}
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'documentation' ? 'active' : ''}`}
                    to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/documentation`}
                    onClick={() => setState({ ...state, tab: 'documentation' })}>
                    <i className="fas fa-book mr-1" />
                    <Translation i18nkey="Documentation" language={props.currentLanguage}>
                      Documentation
                    </Translation>
                  </Link>
                </li>
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'news' ? 'active' : ''}`}
                    to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/news`}
                    onClick={() => setState({ ...state, tab: 'news' })}>
                    <i className="fas fa-newspaper mr-1" />
                    <Translation i18nkey="News" language={props.currentLanguage}>
                      News
                    </Translation>
                  </Link>
                </li>
              </ul>
            </div>
            <div className="row">
              <div className="section col container-api">
                <div className="mt-2">
                  {editedApi && state.tab === 'infos' && (
                    <TeamApiInfo
                      tenant={props.tenant}
                      team={props.currentTeam}
                      currentLanguage={props.currentLanguage}
                      creating={
                        props.location &&
                        props.location.state &&
                        !!props.location.state.newApi
                      }
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                    />
                  )}
                  {editedApi && state.tab === 'description' && (
                    <TeamApiDescription
                      currentLanguage={props.currentLanguage}
                      value={editedApi}
                      team={props.currentTeam}
                      onChange={(api) => setState({ ...state, api })}
                    />
                  )}
                  {editedApi && state.tab === 'swagger' && (
                    <TeamApiSwagger
                      currentLanguage={props.currentLanguage}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                    />
                  )}
                  {editedApi && state.tab === 'pricing' && (
                    <TeamApiPricing
                      currentLanguage={props.currentLanguage}
                      teamId={teamId}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                      otoroshiSettings={state.otoroshiSettings}
                      {...props}
                    />
                  )}
                  {editedApi && state.tab === 'plans' && (
                    <TeamApiPricing
                      currentLanguage={props.currentLanguage}
                      teamId={teamId}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                      tenant={props.tenant}
                    />
                  )}
                  {false && editedApi && state.tab === 'otoroshi' && (
                    <TeamApiOtoroshiPlaceholder
                      currentLanguage={props.currentLanguage}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                    />
                  )}
                  {editedApi && state.tab === 'documentation' && (
                    <TeamApiDocumentation
                      currentLanguage={props.currentLanguage}
                      creationInProgress={state.create}
                      team={props.currentTeam}
                      teamId={teamId}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                      save={save}
                      hookSavePage={(savePage) => setState({ ...state, savePage })}
                    />
                  )}
                  {editedApi && state.tab === 'testing' && (
                    <TeamApiTesting
                      currentLanguage={props.currentLanguage}
                      creationInProgress={state.create}
                      team={props.currentTeam}
                      teamId={teamId}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                      save={save}
                      hookSavePage={(savePage) => setState({ ...state, savePage })}
                      otoroshiSettings={state.otoroshiSettings}
                      openSubMetadataModal={props.openSubMetadataModal}
                      openTestingApiKeyModal={props.openTestingApiKeyModal}
                    />
                  )}
                  {editedApi && state.tab === 'news' && (
                    <TeamApiPost
                      currentLanguage={props.currentLanguage}
                      value={editedApi}
                      team={props.currentTeam}
                      api={state.api}
                      onChange={(api) => setState({ ...state, api })}
                    />
                  )}
                </div>
              </div>
            </div>
            {!props.location.pathname.includes('/news') && (
              <div className="row form-back-fixedBtns">
                {!state.create && (
                  <button
                    type="button"
                    className="btn btn-outline-danger ml-1"
                    onClick={deleteApi}>
                    <i className="fas fa-trash mr-1" />
                    <Translation i18nkey="Delete" language={props.currentLanguage}>
                      Delete
                    </Translation>
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline-success ml-1"
                  {...disabled}
                  onClick={save}>
                  {!state.create && (
                    <span>
                      <i className="fas fa-save mr-1" />
                      <Translation i18nkey="Save" language={props.currentLanguage}>
                        Save
                      </Translation>
                    </span>
                  )}
                  {state.create && (
                    <span>
                      <i className="fas fa-save mr-1" />
                      <Translation i18nkey="Create" language={props.currentLanguage}>
                        Create
                      </Translation>
                    </span>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </Can>
    </TeamBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  setError: (error) => setError(error),
  openSubMetadataModal: (props) => openSubMetadataModal(props),
  openTestingApiKeyModal: (props) => openTestingApiKeyModal(props),
};

export const TeamApi = connect(mapStateToProps, mapDispatchToProps)(TeamApiComponent);
