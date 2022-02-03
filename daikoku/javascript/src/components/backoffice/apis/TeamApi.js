import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate, useLocation, useParams, Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { Can, manage, api as API, Spinner } from '../../utils';
import {
  TeamApiInfos,
  TeamApiPost,
  TeamApiDocumentation
} from '.';

import { setError, openSubMetadataModal, openTestingApiKeyModal, I18nContext, toggleExpertMode } from '../../../core';

const reservedCharacters = [';', '/', '?', ':', '@', '&', '=', '+', '$', ','];
const CreateNewVersionButton = ({ apiId, versionId, teamId, currentTeam, tab }) => {
  const { translateMethod } = useContext(I18nContext);

  const navigate = useNavigate();

  const promptVersion = () => {
    window
      .prompt('Version number', undefined, false, 'New version', `Current version : ${versionId}`)
      .then((newVersion) => {
        if (newVersion) {
          if ((newVersion || '').split('').find((c) => reservedCharacters.includes(c)))
            toastr.error(
              "Can't create version with special characters : " + reservedCharacters.join(' | ')
            );
          else createNewVersion(newVersion);
        }
      });
  };

  const createNewVersion = (newVersion) => {
    Services.createNewApiVersion(apiId, currentTeam._id, newVersion).then((res) => {
      if (res.error) toastr.error(res.error);
      else {
        toastr.success('New version of api created');
        navigate(`/${teamId}/settings/apis/${apiId}/${newVersion}/${tab ? tab : 'infos'}`);
      }
    });
  };

  return (
    <button onClick={promptVersion} className="btn btn-sm btn-outline-primary mb-2">
      {translateMethod('teamapi.new_version')}
    </button>
  );
};

const TeamApiComponent = (props) => {
  const [state, setState] = useState({
    api: null,
    create: false,
    error: null,
    otoroshiSettings: [],
    changed: false,
  });

  const params = useParams();

  const [versions, setApiVersions] = useState([]);
  const [apiVersion, setApiVersion] = useState({
    value: params.versionId,
    label: params.versionId,
  });

  const teamApiDocumentationRef = useRef();

  const { translateMethod, Translation } = useContext(I18nContext);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location && location.state && location.state.newApi) {
      Services.allSimpleOtoroshis(props.tenant._id)
        .then((otoroshiSettings) =>
          setState({
            ...state,
            otoroshiSettings,
            api: location.state.newApi,
            create: true,
          })
        );
    } else {
      reloadState();
    }
  }, [params.tab, params.versionId]);

  useEffect(() => {
    if (state.changed) {
      setState({ ...state, changed: false });
      save();
    }
  }, [state.changed]);

  useEffect(() => {
    document.title = `${props.currentTeam.name} - ${state.api ? state.api.name : translateMethod('API')
      }`;
  }, [state]);

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

  function save(v) {
    if (params.tab === 'documentation') teamApiDocumentationRef.current.saveCurrentPage();

    const editedApi = transformPossiblePlansBack(v || state.api);
    if (state.create) {
      return Services.createTeamApi(props.currentTeam._id, editedApi)
        .then((api) => {
          if (api.name) {
            toastr.success(
              translateMethod('api.created.success', false, `Api "${api.name}" created`, api.name)
            );
            return api;
          } else {
            return Promise.reject(api.error)
          };
        })
        .then((api) => {
          setState({ ...state, create: false, api });
          navigate(`/${props.currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`);
          return api
        })
        .catch((error) => toastr.error(translateMethod(error)));
    } else {
      return Services.checkIfApiNameIsUnique(editedApi.name, editedApi._id)
        .then((r) => {
          if (!r.exists) {
            if (editedApi.currentVersion.split('').find((c) => reservedCharacters.includes(c))) {
              return toastr.error(
                "Can't set version with special characters : " + reservedCharacters.join(' | ')
              );
            } else
              return Services.saveTeamApiWithId(
                props.currentTeam._id,
                editedApi,
                apiVersion.value,
                editedApi._humanReadableId
              ).then((res) => {
                if (res.error) toastr.error(translateMethod(res.error));
                else {
                  toastr.success(translateMethod('Api saved'));
                  if (
                    res._humanReadableId !== params.apiId ||
                    res.currentVersion !== params.versionId
                  )
                    navigate(
                      `/${props.currentTeam._humanReadableId}/settings/apis/${res._humanReadableId}/${res.currentVersion}/infos`
                    );
                  return res
                }
              });
          } else {
            return toastr.error(`api with name "${editedApi.name}" already exists`)
          };
        });
    }
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
        navigate(
          `/${params.teamId}/settings/apis/${params.apiId}/${newVersion}/${params.tab ? params.tab : 'infos'
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
    props.setError({ error: { status: 403, message: 'Creation security enabled' } });
  }

  useEffect(() => {
    if (!!state.api) {
      const deleteApi = () => {
        window.confirm(translateMethod('delete.api.confirm')).then((ok) => {
          if (ok) {
            Services.deleteTeamApi(props.currentTeam._id, state.api._id)
              .then(() => navigate(`/${props.currentTeam._humanReadableId}/settings/apis`))
              .then(() => toastr.success(translateMethod('deletion successful')));
          }
        });
      }
      if (props.creation) {
        props.injectNavFooter(<>
          <Link
            className="d-flex justify-content-around mt-3 align-items-center"
            style={{
              border: 0,
              background: 'transparent',
              outline: 'none',
            }}
            to={`/${props.currentTeam._humanReadableId}/settings/apis`}
          >
            <i className="fas fa-chevron-left" />
            Back to {props.currentTeam._humanReadableId}
          </Link>
        </>)
      } else {
        props.injectNavFooter(<>
          <Link
            to={`/${props.currentTeam._humanReadableId}/${params.apiId}/${params.versionId}`}
            className="btn btn-sm btn-access-negative mb-2"
          >
            {translateMethod('View this Api')}
          </Link>
          <CreateNewVersionButton {...params} currentTeam={props.currentTeam} />
          <button onClick={deleteApi} className="btn btn-sm btn-outline-danger">
            {translateMethod('Delete this Api')}
          </button>
          <Link
            className="d-flex justify-content-around mt-3 align-items-center"
            style={{
              border: 0,
              background: 'transparent',
              outline: 'none',
            }}
            to={`/${props.currentTeam._humanReadableId}/settings/apis`}
          >
            <i className="fas fa-chevron-left" />
            Back to {props.currentTeam._humanReadableId}
          </Link>
        </>)
      }
    }
    return () => props.injectNavFooter(null)
  }, [state.api])

  useEffect(() => {
    if (tab !== 'infos') {
      props.injectSubMenu(null);
    }
  }, [tab])

  return (
    <Can I={manage} a={API} team={props.currentTeam} dispatchError>
      {!editedApi && <Spinner />}
      {editedApi && (
        <>
          <div className="d-flex flex-row justify-content-between align-items-center">
            {state.create ? (
              <h2>{editedApi.name}</h2>
            ) : (
              <div
                className="d-flex align-items-center justify-content-between"
                style={{ flex: 1 }}>
                <h2 className='me-2'>
                  {editedApi.name}
                </h2>
              </div>
            )}
            <button onClick={() => props.toggleExpertMode()} className="btn btn-sm btn-outline-primary">
              {props.expertMode && translateMethod("Standard mode")}
              {!props.expertMode && translateMethod("Expert mode")}
            </button>
          </div>
          <div className="row">
            <div className="section col container-api">
              <div className="mt-2">
                {editedApi && tab === 'documentation' && (
                  <>
                    <TeamApiDocumentation
                      creationInProgress={state.create}
                      team={props.currentTeam}
                      teamId={teamId}
                      value={editedApi}
                      onChange={(api) => setState({ ...state, api })}
                      save={save}
                      versionId={params.versionId}
                      params={params}
                      reloadState={reloadState}
                      ref={teamApiDocumentationRef}
                    />
                    <div className="row">
                      <div className="d-flex form-back-fixedBtns">
                        <button
                          type="button"
                          className="btn btn-outline-success ms-1"
                          onClick={() => save()}
                        >
                          <span>
                            <i className="fas fa-save me-1" />
                            <Translation i18nkey="Save">Save</Translation>
                          </span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {editedApi && tab === 'infos' && (
                  <TeamApiInfos
                    value={editedApi}
                    team={props.currentTeam}
                    tenant={props.tenant}
                    save={save}
                    creation={
                      location && location.state && !!location.state.newApi
                    }
                    expertMode={props.expertMode}
                    injectSubMenu={props.injectSubMenu}
                    openTestingApiKeyModal={props.openTestingApiKeyModal}
                    openSubMetadataModal={props.openSubMetadataModal}
                    otoroshiSettings={state.otoroshiSettings}
                  />
                )}
                {editedApi && tab === 'news' && (
                  <TeamApiPost
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
        </>
      )}
    </Can>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  setError: (error) => setError(error),
  openSubMetadataModal: (props) => openSubMetadataModal(props),
  openTestingApiKeyModal: (props) => openTestingApiKeyModal(props),
  toggleExpertMode: () => toggleExpertMode()
};

export const TeamApi = connect(mapStateToProps, mapDispatchToProps)(TeamApiComponent);
