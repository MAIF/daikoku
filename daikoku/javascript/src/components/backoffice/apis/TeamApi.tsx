import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate, useLocation, useParams, useMatch, Link } from 'react-router-dom';
import { toastr } from 'react-redux-toastr';
import Select from 'react-select';
import Plus from 'react-feather/dist/icons/plus';
import { useDispatch, useSelector } from 'react-redux';

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
  TeamApiSubscriptions
} from '.';
import { ModalContext, useApiBackOffice } from '../../../contexts';

import {
  setError,
  I18nContext,
  toggleExpertMode,
} from '../../../core';
import { TOptions } from '../../../types/types';
import { IApi, isError, IUsagePlan } from '../../../types/api';
import { IState, IStateContext, ITeamSimple } from '../../../types';

const reservedCharacters = [';', '/', '?', ':', '@', '&', '=', '+', '$', ','];
type ButtonProps = {
  apiId: string,
  versionId: string,
  teamId: string,
  currentTeam: ITeamSimple,
  tab: string
}
const CreateNewVersionButton = ({
  apiId,
  versionId,
  teamId,
  currentTeam,
  tab
}: ButtonProps) => {
  const { translate } = useContext(I18nContext);
  const { prompt } = useContext(ModalContext);

  const navigate = useNavigate();

  const promptVersion = () => {
    prompt({
      placeholder: translate('Version number'),
      title: translate('New version'),
      value: versionId,
      okLabel: translate('Create')
    })
      .then((newVersion) => {
        if (newVersion) {
          if ((newVersion || '').split('').find((c) => reservedCharacters.includes(c)))
            toastr.error(translate('Error'), "Can't create version with special characters : " + reservedCharacters.join(' | '));
          else
            createNewVersion(newVersion);
        }
      });
  };

  const createNewVersion = (newVersion: string) => {
    Services.createNewApiVersion(apiId, currentTeam._id, newVersion).then((res) => {
      if (res.error) toastr.error(translate('Error'), res.error);
      else {
        toastr.success(translate('Success'), 'New version of api created');
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

type TeamApiParams = {
  apiId: string
  versionId: string
  teamId: string
  tab: string
}
export const TeamApi = (props: { creation: boolean }) => {
  const params = useParams<TeamApiParams>();

  const location = useLocation();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/apis/:apiId/:version/stats/plan/:planId');

  const dispatch = useDispatch();
  const { currentTeam, tenant, expertMode } = useSelector<IState, IStateContext>((s) => s.context);

  const [api, setApi] = useState<IApi>();
  const [apiVersion, setApiVersion] = useState({
    value: params.versionId,
    label: params.versionId,
  });
  const [versions, setVersions] = useState<TOptions>([{ value: params.versionId as string, label: params.versionId as string }]);

  const methods = useApiBackOffice(api, props.creation);
  const { translate } = useContext(I18nContext);


  useEffect(() => {
    if (location && location.state && location.state.newApi) {
      setApi(location.state.newApi);
    } else {
      reloadState();
    }
  }, [params.tab, params.versionId]);

  useEffect(() => {
    document.title = `${currentTeam.name} - ${api ? api.name : translate('API')}`;

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
                          `/${currentTeam._humanReadableId}/settings/apis/${api?._humanReadableId}/${e?.value}/${tab}`
                        )
                      }
                      classNamePrefix="reactSelect"
                      className="flex-grow-1"
                      menuPlacement="auto"
                      menuPosition="fixed"
                    />
                    <CreateNewVersionButton apiId={params.apiId!} teamId={params.teamId!} versionId={params.versionId!} tab={params.tab!} currentTeam={currentTeam} />
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
      Services.teamApi(currentTeam._id, params.apiId!, params.versionId!),
      Services.getAllApiVersions(currentTeam._id, params.apiId!),
    ]).then(([api, v]) => {
      if (!isError(api)) {
        const versions = (v || []).map((v) => ({
          label: v,
          value: v
        }));
        setApiVersion({ value: params.versionId, label: params.versionId });
        setApi(api);
        setVersions(versions);
      } else {
        toastr.error(translate('Error'), api.error);
      }
    });
  };

  const save = (editedApi: IApi) => {
    if (props.creation) {
      return Services.createTeamApi(currentTeam._id, editedApi)
        .then((createdApi) => {
          if (createdApi.error) {
            toastr.error(translate('Error'), translate(createdApi.error));
            return createdApi;
          } else if (createdApi.name) {
            toastr.success(
              translate('Success'),
              translate({ key: 'api.created.success', replacements: [createdApi.name] })
            );
            methods.setApi(createdApi);
            navigate(`/${currentTeam._humanReadableId}/settings/apis/${createdApi._humanReadableId}/${createdApi.currentVersion}/infos`);
          }
        });
    } else {
      return Services.saveTeamApiWithId(
        currentTeam._id,
        editedApi,
        apiVersion.value!,
        editedApi._humanReadableId
      ).then((res) => {
        if (isError(res)) {
          toastr.error(translate('Error'), translate(res.error));
        } else {
          toastr.success(translate('Success'), translate('Api saved'));
          setApi(res);
          methods.setApi(res)
          if (res._humanReadableId !== editedApi._humanReadableId) {
            navigate(`/${currentTeam._humanReadableId}/settings/apis/${res._humanReadableId}/${res.currentVersion}/infos`);
          } else {
            reloadState()
          }
        }
      });
    }
  };

  const setDefaultPlan = (plan: IUsagePlan) => {
    if (api && api.defaultUsagePlan !== plan._id && plan.visibility !== 'Private') {
      const updatedApi = { ...api, defaultUsagePlan: plan._id }
      Services.saveTeamApiWithId(
        currentTeam._id,
        updatedApi,
        apiVersion.value!,
        updatedApi._humanReadableId
      ).then((response) => {
        if (isError(response)) {
          toastr.error(translate('Error'), translate(response.error));
        } else {
          setApi(response);
          methods.setApi(response)
          reloadState() //todo: use react query instead
        }
      })
    }
  }

  const tab: string = params.tab || 'infos';

  if (tenant.creationSecurity && !currentTeam.apisCreationPermission) {
    dispatch(setError({ error: { status: 403, message: 'Creation security enabled' } }));
  }

  useEffect(() => {
    if (api) {
      const backButton = (
        <Link
          className="d-flex justify-content-around mt-3 align-items-center"
          style={{
            border: 0,
            background: 'transparent',
            outline: 'none',
          }}
          to={`/${currentTeam._humanReadableId}/settings/apis`}
        >
          <i className="fas fa-chevron-left me-1" />
          {translate({ key: 'back.to.team', replacements: [currentTeam.name] })}
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
                      to={`/${currentTeam._humanReadableId}/${params.apiId}/${params.versionId}/description`}
                      className="btn btn-sm btn-access-negative mb-2"
                    >
                      {translate('View this Api')}
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

  return (<Can I={manage} a={API} team={currentTeam} dispatchError>
    {!api && <Spinner />}
    {api && (<>
      <div className="d-flex flex-row justify-content-between align-items-center">
        {props.creation ? (<h2>{api.name}</h2>) : (<div className="d-flex align-items-center justify-content-between" style={{ flex: 1 }}>
          <h2 className="me-2">{api.name}</h2>
        </div>)}
        <button onClick={() => dispatch(toggleExpertMode())} className="btn btn-sm btn-outline-primary">
          {expertMode && translate('Standard mode')}
          {!expertMode && translate('Expert mode')}
        </button>
      </div>
      <div className="row">
        <div className="section col container-api">
          <div className="mt-2">
            {tab === 'documentation' && (
              <TeamApiDocumentation
                creationInProgress={props.creation}
                team={currentTeam}
                api={api}
                onChange={(api: IApi) => setApi(api)}
                saveApi={save}
                versionId={params.versionId}
                reloadState={reloadState} />)}
            {tab === 'plans' && (
              <TeamApiPricings
                api={api}
                setApi={setApi}
                setDefaultPlan={setDefaultPlan}
                team={currentTeam}
                tenant={tenant}
                creation={!!props.creation}
                expertMode={expertMode}
                injectSubMenu={(component: any) => methods.addMenu({
                  blocks: {
                    links: { links: { plans: { childs: { menu: { component } } } } },
                  },
                })} />)}
            {tab === 'infos' && (
              <TeamApiInfos
                value={api}
                team={currentTeam}
                tenant={tenant}
                save={save}
                creation={props.creation}
                expertMode={expertMode}
                injectSubMenu={(component: any) => methods.addMenu({
                  blocks: {
                    links: { links: { informations: { childs: { menu: { component } } } } },
                  },
                })} />)}
            {tab === 'news' && (<TeamApiPost team={currentTeam} api={api} />)}
            {tab === 'settings' && <TeamApiSettings api={api} />}
            {tab === 'stats' && !match && <TeamApiConsumption api={api} />}
            {tab === 'stats' && match && match.params.planId && (<TeamPlanConsumption api={api} />)}
            {tab === 'subscriptions' && <TeamApiSubscriptions api={api} />}
          </div>
        </div>
      </div>
    </>)}
  </Can>);
};
