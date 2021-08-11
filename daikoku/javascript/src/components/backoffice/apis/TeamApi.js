import React, { useState, useEffect, useRef } from 'react';
import { Link, useHistory, useLocation, useParams } from 'react-router-dom';
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
import Select from 'react-select';

const reservedCharacters = [';', '/', '?', ':', '@', '&', '=', '+', '$', ','];

function TeamApiComponent(props) {
  const location = useLocation();
  const params = useParams();
  const history = useHistory();

  const [state, setState] = useState({
    api: null,
    create: false,
    error: null,
    otoroshiSettings: [],
    changed: false,
  });

  const [versions, setApiVersions] = useState([]);
  const [apiVersion, setApiVersion] = useState({
    value: params.versionId,
    label: params.versionId,
  });

  const teamApiDocumentationRef = useRef();

  useEffect(() => {
    if (location && location.state && location.state.newApi) {
      Services.allSimpleOtoroshis(props.tenant._id).then((otoroshiSettings) =>
        setState({
          ...state,
          otoroshiSettings,
          api: location.state.newApi,
          create: true,
        })
      );
    } else reloadState();
  }, [params.tab, params.versionId]);

  useEffect(() => {
    if (state.changed) {
      setState({ ...state, changed: false });
      save();
    }
  }, [state.changed]);

  function reloadState() {
    Promise.all([
      Services.teamApi(props.currentTeam._id, params.apiId, params.versionId),
      Services.allSimpleOtoroshis(props.tenant._id),
      Services.getAllApiVersions(props.currentTeam._id, params.apiId),
    ]).then(([api, otoroshiSettings, versions]) => {
      if (!api.error) setState({ ...state, api, otoroshiSettings });
      else toastr.error(api.error);
      setApiVersions(versions.map((v) => ({ label: v, value: v })));
      setApiVersion({ value: params.versionId, label: params.versionId });
    });
  }

  function save() {
    if (params.tab === 'documentation') teamApiDocumentationRef.current.saveCurrentPage();

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
          } else return Promise.reject(api.error);
        })
        .then((api) =>
          setState({ ...state, create: false, api }, () =>
            props.history.push(
              `/${props.currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`
            )
          )
        )
        .catch((error) => toastr.error(t(error, props.currentLanguage)));
    } else {
      return Services.checkIfApiNameIsUnique(editedApi.name, editedApi._id).then((r) => {
        if (!r.exists) {
          if (editedApi.currentVersion.split('').find((c) => reservedCharacters.includes(c))) {
            toastr.error(
              "Can't set version with special characters : " + reservedCharacters.join(' | ')
            );
            return Promise.resolve();
          } else
            return Services.saveTeamApiWithId(
              props.currentTeam._id,
              editedApi,
              apiVersion.value,
              editedApi._humanReadableId
            )
              .then((res) => {
                if (res.error) toastr.error(t(res.error, props.currentLanguage));
                else toastr.success(t('Api saved', props.currentLanguage));
                return res;
              })
              .then((newApi) => {
                if (
                  newApi._humanReadableId !== params.apiId ||
                  newApi.currentVersion !== params.versionId
                )
                  history.push(
                    `/${props.currentTeam._humanReadableId}/settings/apis/${newApi._humanReadableId}/${newApi.currentVersion}/infos`
                  );
              });
        } else toastr.error(`api with name "${editedApi.name}" already exists`);
      });
    }
  }

  function deleteApi() {
    window.confirm(t('delete.api.confirm', props.currentLanguage)).then((ok) => {
      if (ok) {
        Services.deleteTeamApi(props.currentTeam._id, state.api._id)
          .then(() => props.history.push(`/${props.currentTeam._humanReadableId}/settings/apis`))
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
  }

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
  }

  function promptVersion() {
    const { api } = state;
    window
      .prompt(
        'Version number',
        undefined,
        false,
        'Create a new version',
        `Current version : ${api.currentVersion}`
      )
      .then((newVersion) => {
        if ((newVersion || '').split('').find((c) => reservedCharacters.includes(c)))
          toastr.error(
            "Can't create version with special characters : " + reservedCharacters.join(' | ')
          );
        else createNewVersion(newVersion);
      });
  }

  function createNewVersion(newVersion) {
    Services.createNewApiVersion(
      state.api._humanReadableId,
      props.currentTeam._id,
      newVersion
    ).then((res) => {
      if (res.error) toastr.error(res.error);
      else {
        toastr.success('New version of api created');
        history.push(
          `/${params.teamId}/settings/apis/${params.apiId}/${newVersion}/${
            params.tab ? params.tab : 'infos'
          }`
        );
      }
    });
  }

  const teamId = props.currentTeam._id;
  const disabled = {}; //TODO: deepEqual(state.originalApi, state.api) ? { disabled: 'disabled' } : {};
  const tab = params.tab || 'infos';
  const editedApi = transformPossiblePlans(state.api);

  if (props.tenant.creationSecurity && !props.currentTeam.apisCreationPermission) {
    props.setError({ error: { status: 403, message: 'unauthorized' } });
  }

  return (
    <TeamBackOffice
      tab="Apis"
      isLoading={!editedApi}
      title={`${props.currentTeam.name} - ${
        state.api ? state.api.name : t('API', props.currentLanguage)
      }`}>
      <Can I={manage} a={API} team={props.currentTeam} dispatchError>
        {!editedApi && (
          <h3>
            <Translation i18nkey="No API">
              No API
            </Translation>
          </h3>
        )}
        {editedApi && (
          <>
            <div className="row">
              {state.create ? (
                <h1>
                  <Translation i18nkey="New api">
                    New api
                  </Translation>{' '}
                  - {editedApi.name}
                </h1>
              ) : (
                <div
                  className="d-flex justify-content-between align-items-center"
                  style={{ flex: 1 }}>
                  <h1>
                    Api - {editedApi.name}{' '}
                    <Link
                      to={`/${props.currentTeam._humanReadableId}/${editedApi._humanReadableId}/${editedApi.currentVersion}`}
                      className="btn btn-sm btn-access-negative"
                      title={t('View this Api', props.currentLanguage)}>
                      <i className="fas fa-eye" />
                    </Link>
                  </h1>
                  <div className="d-flex align-items-center">
                    {versions.length > 1 && (
                      <div style={{ minWidth: '125px' }}>
                        <Select
                          name="versions-selector"
                          value={apiVersion}
                          options={versions}
                          onChange={(e) =>
                            history.push(
                              `/${params.teamId}/settings/apis/${params.apiId}/${e.value}/${params.tab}`
                            )
                          }
                          classNamePrefix="reactSelect"
                          className="mr-2"
                          menuPlacement="auto"
                          menuPosition="fixed"
                        />
                      </div>
                    )}
                    <button type="button" className="btn btn-outline-info" onClick={promptVersion}>
                      <i className="fas fa-plus mr-1" />
                      {t('teamapi.new_version', props.currentLanguage)}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="row">
              <ul className="nav nav-tabs flex-column flex-sm-row mb-3 mt-3">
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'infos' ? 'active' : ''}`}
                    to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/${editedApi.currentVersion}/infos`}>
                    <i className="fas fa-info mr-1" />
                    <Translation i18nkey="Informations">
                      Informations
                    </Translation>
                  </Link>
                </li>
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'description' ? 'active' : ''}`}
                    to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/${editedApi.currentVersion}/description`}>
                    <i className="fas fa-file-alt mr-1" />
                    <Translation i18nkey="Description">
                      Description
                    </Translation>
                  </Link>
                </li>
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'pricing' ? 'active' : ''}`}
                    to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/${editedApi.currentVersion}/plans`}>
                    <i className="fas fa-dollar-sign mr-1" />
                    <Translation i18nkey="Plan" isPlural>
                      Plans
                    </Translation>
                  </Link>
                </li>
                {false && (
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${tab === 'otoroshi' ? 'active' : ''}`}
                      to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/${editedApi.currentVersion}/otoroshi`}>
                      <i className="fas fa-pastafarianism mr-1" />
                      <Translation i18nkey="Otoroshi">
                        Otoroshi
                      </Translation>
                    </Link>
                  </li>
                )}
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'swagger' ? 'active' : ''}`}
                    to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/${editedApi.currentVersion}/swagger`}>
                    <i className="fas fa-file-code mr-1" />
                    <Translation i18nkey="Swagger">
                      Swagger
                    </Translation>
                  </Link>
                </li>
                {editedApi.visibility !== 'AdminOnly' && (
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${tab === 'testing' ? 'active' : ''}`}
                      to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/${editedApi.currentVersion}/testing`}>
                      <i className="fas fa-vial mr-1" />
                      <Translation i18nkey="Testing">
                        Testing
                      </Translation>
                    </Link>
                  </li>
                )}
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'documentation' ? 'active' : ''}`}
                    to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/${editedApi.currentVersion}/documentation`}>
                    <i className="fas fa-book mr-1" />
                    <Translation i18nkey="Documentation">
                      Documentation
                    </Translation>
                  </Link>
                </li>
                <li className="nav-item">
                  <Link
                    className={`nav-link ${tab === 'news' ? 'active' : ''}`}
                    to={`/${props.currentTeam._humanReadableId}/settings/apis/${editedApi._humanReadableId}/${editedApi.currentVersion}/news`}>
                    <i className="fas fa-newspaper mr-1" />
                    <Translation i18nkey="News">
                      News
                    </Translation>
                  </Link>
                </li>
              </ul>
            </div>
            <div className="row">
              <div className="section col container-api">
                <div className="mt-2">
                  {editedApi && tab === 'infos' && (
                    <TeamApiInfo
                      tenant={props.tenant}
                      team={props.currentTeam}
                      currentLanguage={props.currentLanguage}
                      creating={
                        props.location && props.location.state && !!props.location.state.newApi
                      }
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                    />
                  )}
                  {editedApi && tab === 'description' && (
                    <TeamApiDescription
                      currentLanguage={props.currentLanguage}
                      value={editedApi}
                      team={props.currentTeam}
                      onChange={(api) => setState({ ...state, api })}
                    />
                  )}
                  {editedApi && tab === 'swagger' && (
                    <TeamApiSwagger
                      currentLanguage={props.currentLanguage}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                    />
                  )}
                  {editedApi && tab === 'pricing' && (
                    <TeamApiPricing
                      currentLanguage={props.currentLanguage}
                      teamId={teamId}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                      otoroshiSettings={state.otoroshiSettings}
                      {...props}
                    />
                  )}
                  {editedApi && tab === 'plans' && (
                    <TeamApiPricing
                      currentLanguage={props.currentLanguage}
                      teamId={teamId}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                      tenant={props.tenant}
                      reload={() =>
                        Services.teamApi(
                          props.currentTeam._id,
                          params.apiId,
                          params.versionId
                        ).then((api) => setState({ ...state, api }))
                      }
                      params={params}
                    />
                  )}
                  {false && editedApi && tab === 'otoroshi' && (
                    <TeamApiOtoroshiPlaceholder
                      currentLanguage={props.currentLanguage}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                    />
                  )}
                  {editedApi && tab === 'documentation' && (
                    <TeamApiDocumentation
                      currentLanguage={props.currentLanguage}
                      creationInProgress={state.create}
                      team={props.currentTeam}
                      teamId={teamId}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                      save={save}
                      versionId={props.match.params.versionId}
                      params={params}
                      reloadState={reloadState}
                      ref={teamApiDocumentationRef}
                    />
                  )}
                  {editedApi && tab === 'testing' && (
                    <TeamApiTesting
                      currentLanguage={props.currentLanguage}
                      creationInProgress={state.create}
                      team={props.currentTeam}
                      teamId={teamId}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                      onAction={(api) => setState({ ...state, api, changed: true })}
                      save={save}
                      otoroshiSettings={state.otoroshiSettings}
                      openSubMetadataModal={props.openSubMetadataModal}
                      openTestingApiKeyModal={props.openTestingApiKeyModal}
                      params={params}
                    />
                  )}
                  {editedApi && tab === 'news' && (
                    <TeamApiPost
                      currentLanguage={props.currentLanguage}
                      value={editedApi}
                      team={props.currentTeam}
                      api={state.api}
                      onChange={(api) => setState({ ...state, api })}
                      params={params}
                    />
                  )}
                </div>
              </div>
            </div>
            {!props.location.pathname.includes('/news') && (
              <div className="row form-back-fixedBtns">
                {!state.create && (
                  <button type="button" className="btn btn-outline-danger ml-1" onClick={deleteApi}>
                    <i className="fas fa-trash mr-1" />
                    <Translation i18nkey="Delete">
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
                      <Translation i18nkey="Save">
                        Save
                      </Translation>
                    </span>
                  )}
                  {state.create && (
                    <span>
                      <i className="fas fa-save mr-1" />
                      <Translation i18nkey="Create">
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
