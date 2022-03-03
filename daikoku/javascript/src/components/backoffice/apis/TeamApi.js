import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate, useLocation, useParams, Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { Can, manage, api as API, Spinner } from '../../utils';
import {
  TeamApiInfos,
  TeamApiPost,
  TeamApiDocumentation,
  TeamApiPricings
} from '.';

import { setError, openSubMetadataModal, openTestingApiKeyModal, I18nContext, toggleExpertMode, openApiSelectModal } from '../../../core';

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
  const params = useParams();

  const [api, setApi] = useState();
  const [otoroshiSettings, setOtoroshiSettings] = useState([]);
  const [apiVersions, setApiVersions] = useState([]);
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
        .then((otoroshiSettings) => {
          setOtoroshiSettings(otoroshiSettings);
          setApi(location.state.newApi);
        });
    } else {
      reloadState();
    }
  }, [params.tab, params.versionId]);

  useEffect(() => {
    document.title = `${props.currentTeam.name} - ${api ? api.name : translateMethod('API')}`;
  }, [api]);

  const reloadState = () => {
    Promise.all([
      Services.teamApi(props.currentTeam._id, params.apiId, params.versionId),
      Services.allSimpleOtoroshis(props.tenant._id),
      Services.getAllApiVersions(props.currentTeam._id, params.apiId),
    ]).then(([api, otoroshiSettings, versions]) => {
      if (!api.error) {
        setApiVersions(versions.map((v) => ({ label: v, value: v })));
        setApiVersion({ value: params.versionId, label: params.versionId });
        setApi(api);
        setOtoroshiSettings(otoroshiSettings);
      } else {
        toastr.error(api.error);
      }
    });
  }

  const save = (editedApi) => {
    if (params.tab === 'documentation') {
      teamApiDocumentationRef.current.saveCurrentPage();
    }

    if (props.creation) {
      return Services.createTeamApi(props.currentTeam._id, editedApi)
        .then((createdApi) => {
          if (createdApi.error) {
            toastr.error(translateMethod(createdApi.error))
            return createdApi
          } else if (createdApi.name) {
            toastr.success(
              translateMethod('api.created.success', false, `Api "${createdApi.name}" created`, createdApi.name)
            );
            navigate(`/${props.currentTeam._humanReadableId}/settings/apis/${createdApi._humanReadableId}/${createdApi.currentVersion}/infos`)
          }
        })
    } else {
      return Services.saveTeamApiWithId(
        props.currentTeam._id,
        editedApi,
        apiVersion.value,
        editedApi._humanReadableId
      ).then((res) => {
        if (res.error) {
          toastr.error(translateMethod(res.error));
          return res
        } else {
          toastr.success(translateMethod('Api saved'));
          setApi(editedApi)

          if (res._humanReadableId !== editedApi._humanReadableId) {
            navigate(`/${props.currentTeam._humanReadableId}/settings/apis/${res._humanReadableId}/${res.currentVersion}/infos`)
          }
        }
      });
    }
  }

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
            {translateMethod("back.to.team", false, `Back to {props.currentTeam._humanReadableId}`, props.currentTeam.name)}
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
            {translateMethod("back.to.team", false, `Back to {props.currentTeam._humanReadableId}`, props.currentTeam.name)}
          </Link>
        </>)
      }
    }
    return () => props.injectNavFooter(null)
  }, [api])

  useEffect(() => {
    if (tab !== 'infos') {
      props.injectSubMenu(null);
    }
  }, [tab])

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
                style={{ flex: 1 }}>
                <h2 className='me-2'>
                  {api.name}
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
                    otoroshiSettings={otoroshiSettings}
                    expertMode={props.expertMode}
                    injectSubMenu={props.injectSubMenu}
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
                    injectSubMenu={props.injectSubMenu}
                    openTestingApiKeyModal={props.openTestingApiKeyModal}
                    openSubMetadataModal={props.openSubMetadataModal}
                    otoroshiSettings={otoroshiSettings}
                  />
                )}
                {tab === 'news' && (
                  <TeamApiPost
                    value={api}
                    team={props.currentTeam}
                    api={api}
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
  toggleExpertMode: () => toggleExpertMode(),
  openApiSelectModal: (props) => openApiSelectModal(props)
};

export const TeamApi = connect(mapStateToProps, mapDispatchToProps)(TeamApiComponent);
