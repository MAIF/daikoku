import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate, useLocation, useParams, useMatch, Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import Select from 'react-select';
import { Plus } from 'react-feather';

import * as Services from '../../../services';
import { Can, manage, api as API, Spinner } from '../../utils';
import {
  TeamApiInfos,
  TeamApiPost,
  TeamApiDocumentation,
  TeamApiPricings,
  TeamApiSettings,
  TeamPlanConsumption,
  TeamApiConsumption,
  TeamApiSubscriptions,
} from '.';
import { useApiBackOffice } from '../../../contexts';

import {
  setError,
  openSubMetadataModal,
  openTestingApiKeyModal,
  I18nContext,
  toggleExpertMode,
  openApiSelectModal,
} from '../../../core';

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
    <button onClick={promptVersion} className="btn btn-sm btn-outline-primary ms-1">
      <Plus />
    </button>
  );
};

const TeamApiComponent = (props) => {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/apis/:apiId/:version/stats/plan/:planId');

  const [api, setApi] = useState();
  const [otoroshiSettings, setOtoroshiSettings] = useState([]);
  const [apiVersion, setApiVersion] = useState({
    value: params.versionId,
    label: params.versionId,
  });
  const [versions, setVersions] = useState([params.versionId]);

  const methods = useApiBackOffice(api, props.creation);

  const teamApiDocumentationRef = useRef();

  const { translateMethod, Translation } = useContext(I18nContext);

  useEffect(() => {
    if (location && location.state && location.state.newApi) {
      setApi(location.state.newApi);
    } else {
      reloadState();
    }
  }, [params.tab, params.versionId]);

  useEffect(() => {
    document.title = `${props.currentTeam.name} - ${api ? api.name : translateMethod('API')}`;

    if (!props.creation) {
      methods.addMenu({
        blocks: {
          links: {
            links: {
              version: {
                order: 1,
                component: (
                  <div className="d-flex flex-row mb-3">
                    <Select
                      name="versions-selector"
                      value={{ value: params.versionId, label: params.versionId }}
                      options={versions}
                      onChange={(e) =>
                        navigate(
                          `/${props.currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${e.value}/${tab}`
                        )
                      }
                      classNamePrefix="reactSelect"
                      className="flex-grow-1"
                      menuPlacement="auto"
                      menuPosition="fixed"
                    />
                    <CreateNewVersionButton {...params} currentTeam={props.currentTeam} />
                  </div>
                ),
              },
            },
          },
        },
      });
    }
  }, [api, versions]);

  const reloadState = () => {
    Promise.all([
      Services.teamApi(props.currentTeam._id, params.apiId, params.versionId),
      Services.getAllApiVersions(props.currentTeam._id, params.apiId),
    ]).then(([api, v]) => {
      if (!api.error) {
        const versions = (v || []).map((v) => ({ label: v, value: v }));
        setApiVersion({ value: params.versionId, label: params.versionId });
        setApi(api);
        setVersions(versions);
      } else {
        toastr.error(api.error);
      }
    });
  };

  const save = (editedApi) => {
    if (params.tab === 'documentation') {
      teamApiDocumentationRef.current.saveCurrentPage();
    }

    if (props.creation) {
      return Services.createTeamApi(props.currentTeam._id, editedApi).then((createdApi) => {
        if (createdApi.error) {
          toastr.error(translateMethod(createdApi.error));
          return createdApi;
        } else if (createdApi.name) {
          toastr.success(
            translateMethod(
              'api.created.success',
              false,
              `Api "${createdApi.name}" created`,
              createdApi.name
            )
          );
          methods.setApi(createdApi);
          navigate(
            `/${props.currentTeam._humanReadableId}/settings/apis/${createdApi._humanReadableId}/${createdApi.currentVersion}/infos`
          );
        }
      });
    } else {
      return Services.saveTeamApiWithId(
        props.currentTeam._id,
        editedApi,
        apiVersion.value,
        editedApi._humanReadableId
      ).then((res) => {
        if (res.error) {
          toastr.error(translateMethod(res.error));
          return res;
        } else {
          toastr.success(translateMethod('Api saved'));
          setApi(editedApi);

          if (res._humanReadableId !== editedApi._humanReadableId) {
            navigate(
              `/${props.currentTeam._humanReadableId}/settings/apis/${res._humanReadableId}/${res.currentVersion}/infos`
            );
          }
        }
      });
    }
  };

  const teamId = props.currentTeam._id;
  const tab = params.tab || 'infos';

  if (props.tenant.creationSecurity && !props.currentTeam.apisCreationPermission) {
    props.setError({ error: { status: 403, message: 'Creation security enabled' } });
  }

  useEffect(() => {
    if (!!api) {
      const deleteApi = () => {
        window.confirm(translateMethod('delete.api.confirm')).then((ok) => {
          if (ok) {
            Services.deleteTeamApi(props.currentTeam._id, api._id)
              .then(() => navigate(`/${props.currentTeam._humanReadableId}/settings/apis`))
              .then(() => toastr.success(translateMethod('deletion successful')));
          }
        });
      };

      const backButton = (
        <Link
          className="d-flex justify-content-around mt-3 align-items-center"
          style={{
            border: 0,
            background: 'transparent',
            outline: 'none',
          }}
          to={`/${props.currentTeam._humanReadableId}/settings/apis`}
        >
          <i className="fas fa-chevron-left me-1" />
          {translateMethod(
            'back.to.team',
            false,
            `Back to {props.currentTeam._humanReadableId}`,
            props.currentTeam.name
          )}
        </Link>
      );
      if (props.creation) {
        methods.addMenu({
          blocks: {
            actions: {
              links: {
                back: {
                  component: backButton,
                },
              },
            },
          },
        });
      } else {
        methods.addMenu({
          blocks: {
            actions: {
              links: {
                view: {
                  component: (
                    <Link
                      to={`/${props.currentTeam._humanReadableId}/${params.apiId}/${params.versionId}/description`}
                      className="btn btn-sm btn-access-negative mb-2"
                    >
                      {translateMethod('View this Api')}
                    </Link>
                  ),
                },
                back: {
                  component: backButton,
                },
              },
            },
          },
        });
      }
    }
  }, [api]);

  return (
    <Can I={manage} a={API} team={props.currentTeam} dispatchError>
      {!api && <Spinner />}
      {api && (
        <>
          <div className="d-flex flex-row justify-content-between align-items-center">
            {props.creation ? (
              <h2>{api.name}</h2>
            ) : (
              <div
                className="d-flex align-items-center justify-content-between"
                style={{ flex: 1 }}
              >
                <h2 className="me-2">{api.name}</h2>
              </div>
            )}
            <button
              onClick={() => props.toggleExpertMode()}
              className="btn btn-sm btn-outline-primary"
            >
              {props.expertMode && translateMethod('Standard mode')}
              {!props.expertMode && translateMethod('Expert mode')}
            </button>
          </div>
          <div className="row">
            <div className="section col container-api">
              <div className="mt-2">
                {tab === 'documentation' && (
                  <>
                    <TeamApiDocumentation
                      creationInProgress={props.creation}
                      team={props.currentTeam}
                      teamId={teamId}
                      value={api}
                      onChange={(api) => setApi(api)}
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
                          onClick={() => save(api)}
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
                {tab === 'plans' && (
                  <TeamApiPricings
                    value={api}
                    team={props.currentTeam}
                    tenant={props.tenant}
                    save={save}
                    creation={props.creation}
                    expertMode={props.expertMode}
                    injectSubMenu={(component) =>
                      methods.addMenu({
                        blocks: {
                          links: { links: { plans: { childs: { menu: { component } } } } },
                        },
                      })
                    }
                    openApiSelectModal={props.openApiSelectModal}
                  />
                )}
                {tab === 'infos' && (
                  <TeamApiInfos
                    value={api}
                    team={props.currentTeam}
                    tenant={props.tenant}
                    save={save}
                    creation={props.creation}
                    expertMode={props.expertMode}
                    injectSubMenu={(component) =>
                      methods.addMenu({
                        blocks: {
                          links: { links: { informations: { childs: { menu: { component } } } } },
                        },
                      })
                    }
                    openTestingApiKeyModal={props.openTestingApiKeyModal}
                    openSubMetadataModal={props.openSubMetadataModal}
                  />
                )}
                {tab === 'news' && (
                  <TeamApiPost value={api} team={props.currentTeam} api={api} params={params} />
                )}
                {tab === 'settings' && <TeamApiSettings api={api} />}
                {tab === 'stats' && !match && <TeamApiConsumption api={api} />}
                {tab === 'stats' && match && match.params.planId && (
                  <TeamPlanConsumption api={api} />
                )}
                {tab === 'subscriptions' && <TeamApiSubscriptions api={api} />}
              </div>
            </div>
          </div>
        </>
      )}
    </Can>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  setError: (error) => setError(error),
  openSubMetadataModal: (props) => openSubMetadataModal(props),
  openTestingApiKeyModal: (props) => openTestingApiKeyModal(props),
  toggleExpertMode: () => toggleExpertMode(),
  openApiSelectModal: (props) => openApiSelectModal(props),
};

export const TeamApi = connect(mapStateToProps, mapDispatchToProps)(TeamApiComponent);
