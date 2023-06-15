import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate, useLocation, useParams, useMatch, Link } from 'react-router-dom';
import { toastr } from 'react-redux-toastr';
import Select from 'react-select';
import Plus from 'react-feather/dist/icons/plus';
import { useDispatch, useSelector } from 'react-redux';

import * as Services from '../../../services';
import { Can, manage, api as API, Spinner, api, queryClient } from '../../utils';
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
import { IApi, isError, IUsagePlan } from '../../../types/api';
import { IState, IStateContext, ITeamSimple } from '../../../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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

  const { translate } = useContext(I18nContext);

  const newApi = location && location.state && location.state.newApi

  const queryClient = useQueryClient();
  const apiRequest = useQuery({
    queryKey: ['api', params.apiId, params.versionId, location],
    queryFn: () => Services.teamApi(currentTeam._id, params.apiId!, params.versionId!),
    enabled: !newApi
  })

  const versionsRequest = useQuery({
    queryKey: ['apiVersions', params.apiId, params.versionId, location],
    queryFn: () => Services.getAllApiVersions(currentTeam._id, params.apiId!),
    enabled: !newApi
  })

  const methods = useApiBackOffice(apiRequest.data, props.creation);

  useEffect(() => {
    if (apiRequest.isLoading && versionsRequest.isLoading) {
      document.title = translate('???');
    } else if (apiRequest.data && versionsRequest.data) {

      if (!isError(apiRequest.data) && !isError(versionsRequest.data)) {
        const api = apiRequest.data
        const versions = versionsRequest.data.map((v) => ({
          label: v,
          value: v
        }));

        document.title = `${currentTeam.name} - ${api ? api.name : translate('API')}`;

        methods.setApi(api)

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
      }
    }
  }, [apiRequest.data, versionsRequest.data]);

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
        editedApi.currentVersion,
        editedApi._humanReadableId
      ).then((res) => {
        if (isError(res)) {
          toastr.error(translate('Error'), translate(res.error));
        } else {
          toastr.success(translate('Success'), translate('Api saved'));
          if (res._humanReadableId !== editedApi._humanReadableId) {
            navigate(`/${currentTeam._humanReadableId}/settings/apis/${res._humanReadableId}/${res.currentVersion}/infos`);
          } else {
            queryClient.invalidateQueries(['api'])
          }
        }
      });
    }
  };

  const setDefaultPlan = (api: IApi, plan: IUsagePlan) => {
    if (api && api.defaultUsagePlan !== plan._id && plan.visibility !== 'Private') {
      const updatedApi = { ...api, defaultUsagePlan: plan._id }
      Services.saveTeamApiWithId(
        currentTeam._id,
        updatedApi,
        api.currentVersion,
        updatedApi._humanReadableId
      ).then((response) => {
        if (isError(response)) {
          toastr.error(translate('Error'), translate(response.error));
        } else {
          queryClient.invalidateQueries(['api'])
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

  if (!newApi && apiRequest.isLoading) {
    return <Spinner />
  } else if (newApi || (apiRequest.data && !isError(apiRequest.data))) {
    const api = newApi || apiRequest.data;

    return (
      <Can I={manage} a={API} team={currentTeam} dispatchError>
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
                  saveApi={save}
                  versionId={params.versionId}
                  reloadState={() => queryClient.invalidateQueries(['api'])} />)}
              {tab === 'plans' && (
                <TeamApiPricings
                  api={api}
                  reload={() => queryClient.invalidateQueries(['api'])}
                  setDefaultPlan={plan => setDefaultPlan(api, plan)}
                  team={currentTeam}
                  tenant={tenant}
                  creation={!!props.creation}
                  expertMode={expertMode}
                  injectSubMenu={(component) => methods.addMenu({
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
                  injectSubMenu={(component) => methods.addMenu({
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
      </Can>
    );
  } else {
    return <div>Error while fetching api details</div>
  }


};
