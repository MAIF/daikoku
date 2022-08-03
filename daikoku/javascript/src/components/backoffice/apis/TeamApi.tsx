import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate, useLocation, useParams, useMatch, Link } from 'react-router-dom';
import { connect } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
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
const CreateNewVersionButton = ({
  apiId,
  versionId,
  teamId,
  currentTeam,
  tab
}: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const navigate = useNavigate();

  const promptVersion = () => {
    (window
    // @ts-expect-error TS(2554): Expected 0-2 arguments, but got 5.
    .prompt(translateMethod('Version number'), undefined, false, translateMethod('New version'), versionId) as any).then((newVersion: any) => {
    if (newVersion) {
        if ((newVersion || '').split('').find((c: any) => reservedCharacters.includes(c)))
            toastr.error("Can't create version with special characters : " + reservedCharacters.join(' | '));
        else
            createNewVersion(newVersion);
    }
});
  };

  const createNewVersion = (newVersion: any) => {
    Services.createNewApiVersion(apiId, currentTeam._id, newVersion).then((res) => {
      if (res.error) toastr.error(res.error);
      else {
        toastr.success('New version of api created');
        navigate(`/${teamId}/settings/apis/${apiId}/${newVersion}/${tab ? tab : 'infos'}`);
      }
    });
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <button onClick={promptVersion} className="btn btn-sm btn-outline-primary ms-1">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Plus />
    </button>
  );
};

const TeamApiComponent = (props: any) => {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/apis/:apiId/:version/stats/plan/:planId');

  const [api, setApi] = useState();
  const [apiVersion, setApiVersion] = useState({
    value: params.versionId,
    label: params.versionId,
  });
  const [versions, setVersions] = useState([params.versionId]);

  const methods = useApiBackOffice(api, props.creation);

  const teamApiDocumentationRef = useRef();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    if (location && location.state && (location as any).state.newApi) {
      setApi((location as any).state.newApi);
    } else {
      reloadState();
    }
  }, [params.tab, params.versionId]);

  useEffect(() => {
    document.title = `${props.currentTeam.name} - ${api ? (api as any).name : translateMethod('API')}`;

    if (!props.creation) {
      methods.addMenu({
        blocks: {
          links: {
            links: {
              version: {
                order: 1,
                component: (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <div className="d-flex flex-row mb-3">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Select
                      name="versions-selector"
                      value={{ value: params.versionId, label: params.versionId }}
                      // @ts-expect-error TS(2322): Type '(string | undefined)[]' is not assignable to... Remove this comment to see the full error message
                      options={versions}
                      onChange={(e) =>
                        navigate(
                          `/${props.currentTeam._humanReadableId}/settings/apis/${                          
// @ts-expect-error TS(2532): Object is possibly 'undefined'.
api._humanReadableId}/${e.value}/${tab}`
                        )
                      }
                      classNamePrefix="reactSelect"
                      className="flex-grow-1"
                      menuPlacement="auto"
                      menuPosition="fixed"
                    />
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
        const versions = (v || []).map((v: any) => ({
          label: v,
          value: v
        }));
        setApiVersion({ value: params.versionId, label: params.versionId });
        setApi(api);
        setVersions(versions);
      } else {
        toastr.error(api.error);
      }
    });
  };

  const save = (editedApi: any) => {
    if (params.tab === 'documentation') {
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
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
    if (api) {
      const backButton = (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Link
          className="d-flex justify-content-around mt-3 align-items-center"
          style={{
            border: 0,
            background: 'transparent',
            outline: 'none',
          }}
          to={`/${props.currentTeam._humanReadableId}/settings/apis`}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Link
                      to={`/${props.currentTeam._humanReadableId}/${params.apiId}/${params.versionId}/infos`}
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

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<Can I={manage} a={API} team={props.currentTeam} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {!api && <Spinner />}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {api && (<>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex flex-row justify-content-between align-items-center">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {props.creation ? (<h2>{(api as any).name}</h2>) : (<div className="d-flex align-items-center justify-content-between" style={{ flex: 1 }}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <h2 className="me-2">{(api as any).name}</h2>
              </div>)}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button onClick={() => props.toggleExpertMode()} className="btn btn-sm btn-outline-primary">
              {props.expertMode && translateMethod('Standard mode')}
              {!props.expertMode && translateMethod('Expert mode')}
            </button>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="row">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="section col container-api">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="mt-2">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {tab === 'documentation' && (<TeamApiDocumentation creationInProgress={props.creation} team={props.currentTeam} teamId={teamId} value={api} onChange={(api: any) => setApi(api)} save={save} versionId={params.versionId} params={params} reloadState={reloadState} ref={teamApiDocumentationRef}/>)}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {tab === 'plans' && (<TeamApiPricings value={api} team={props.currentTeam} tenant={props.tenant} save={save} creation={props.creation} expertMode={props.expertMode} injectSubMenu={(component: any) => methods.addMenu({
                blocks: {
                    links: { links: { plans: { childs: { menu: { component } } } } },
                },
            })} openApiSelectModal={props.openApiSelectModal}/>)}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {tab === 'infos' && (<TeamApiInfos value={api} team={props.currentTeam} tenant={props.tenant} save={save} creation={props.creation} expertMode={props.expertMode} injectSubMenu={(component: any) => methods.addMenu({
                blocks: {
                    links: { links: { informations: { childs: { menu: { component } } } } },
                },
            })} openTestingApiKeyModal={props.openTestingApiKeyModal} openSubMetadataModal={props.openSubMetadataModal}/>)}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {tab === 'news' && (<TeamApiPost value={api} team={props.currentTeam} api={api} params={params}/>)}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {tab === 'settings' && <TeamApiSettings api={api}/>}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {tab === 'stats' && !match && <TeamApiConsumption api={api}/>}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {tab === 'stats' && match && match.params.planId && (<TeamPlanConsumption api={api}/>)}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {tab === 'subscriptions' && <TeamApiSubscriptions api={api}/>}
              </div>
            </div>
          </div>
        </>)}
    </Can>);
};

const mapStateToProps = (state: any) => ({
  ...state.context
});

const mapDispatchToProps = {
  setError: (error: any) => setError(error),
  openSubMetadataModal: (props: any) => openSubMetadataModal(props),
  openTestingApiKeyModal: (props: any) => openTestingApiKeyModal(props),
  toggleExpertMode: () => toggleExpertMode(),
  openApiSelectModal: (props: any) => openApiSelectModal(props),
};

export const TeamApi = connect(mapStateToProps, mapDispatchToProps)(TeamApiComponent);
