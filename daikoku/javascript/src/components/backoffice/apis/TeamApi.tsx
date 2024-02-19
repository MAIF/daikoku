import { useContext, useEffect, useState } from 'react';
import Plus from 'react-feather/dist/icons/plus';
import { Link, useLocation, useMatch, useNavigate, useParams } from 'react-router-dom';
import Select from 'react-select';
import { toast } from 'sonner';

import {
  TeamApiConsumption,
  TeamApiDocumentation,
  TeamApiInfos,
  TeamApiPost,
  TeamApiPricings,
  TeamApiSettings,
  TeamApiSubscriptions,
  TeamPlanConsumption
} from '.';
import { ModalContext, useApiBackOffice } from '../../../contexts';
import * as Services from '../../../services';
import { api as API, Can, Spinner, api, manage } from '../../utils';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  I18nContext
} from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import { ITeamSimple } from '../../../types';
import { IApi, IUsagePlan, isError } from '../../../types/api';
import { TeamBackOfficeProps } from '../TeamBackOffice';

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
            toast.error(translate({ key: "semver.error.message", replacements: [reservedCharacters.join(' | ')] }));
          else
            createNewVersion(newVersion);
        }
      });
  };

  const createNewVersion = (newVersion: string) => {
    Services.createNewApiVersion(apiId, currentTeam._id, newVersion).then((res) => {
      if (res.error) toast.error(res.error);
      else {
        toast.success(translate('version.creation.success.message'));
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
export const TeamApi = (props: TeamBackOfficeProps<{ creation: boolean }>) => {
  const params = useParams<TeamApiParams>();

  const [additionalHeader, setAdditionalHeader] = useState<string>()

  const location = useLocation();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/apis/:apiId/:version/stats/plan/:planId');

  const { tenant, expertMode, toggleExpertMode } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);
  const { openApiDocumentationSelectModal } = useContext(ModalContext);

  const newApi = location && location.state && location.state.newApi

  const queryClient = useQueryClient();
  const apiRequest = useQuery({
    queryKey: ['api', params.apiId, params.versionId, location],
    queryFn: () => Services.teamApi(props.currentTeam._id, params.apiId!, params.versionId!),
    enabled: !newApi
  })

  const versionsRequest = useQuery({
    queryKey: ['apiVersions', params.apiId, params.versionId, location],
    queryFn: () => Services.getAllApiVersions(props.currentTeam._id, params.apiId!),
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

        document.title = `${props.currentTeam.name} - ${api ? api.name : translate('API')}`;

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
                              `/${props.currentTeam._humanReadableId}/settings/apis/${api?._humanReadableId}/${e?.value}/${tab}`
                            )
                          }
                          classNamePrefix="reactSelect"
                          className="flex-grow-1"
                          menuPlacement="auto"
                          menuPosition="fixed"
                        />
                        <CreateNewVersionButton apiId={params.apiId!} teamId={params.teamId!} versionId={params.versionId!} tab={params.tab!} currentTeam={props.currentTeam} />
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
      return Services.createTeamApi(props.currentTeam._id, editedApi)
        .then((createdApi) => {
          if (createdApi.error) {
            toast.error(translate(createdApi.error));
            return createdApi;
          } else if (createdApi.name) {
            toast.success(translate({ key: 'api.created.success', replacements: [createdApi.name] })
            );
            methods.setApi(createdApi);
            navigate(`/${props.currentTeam._humanReadableId}/settings/apis/${createdApi._humanReadableId}/${createdApi.currentVersion}/infos`);
          }
        });
    } else {
      return Services.saveTeamApiWithId(
        props.currentTeam._id,
        editedApi,
        editedApi.currentVersion,
        editedApi._humanReadableId
      ).then((res) => {
        if (isError(res)) {
          toast.error(translate(res.error));
        } else {
          toast.success(translate('Api saved'));
          if (res._humanReadableId !== editedApi._humanReadableId) {
            navigate(`/${props.currentTeam._humanReadableId}/settings/apis/${res._humanReadableId}/${res.currentVersion}/infos`);
          } else {
            queryClient.invalidateQueries({ queryKey: ['api'] })
          }
        }
      });
    }
  };

  const setDefaultPlan = (api: IApi, plan: IUsagePlan) => {
    if (api && api.defaultUsagePlan !== plan._id && plan.visibility !== 'Private') {
      const updatedApi = { ...api, defaultUsagePlan: plan._id }
      Services.saveTeamApiWithId(
        props.currentTeam._id,
        updatedApi,
        api.currentVersion,
        updatedApi._humanReadableId
      ).then((response) => {
        if (isError(response)) {
          toast.error(translate(response.error));
        } else {
          queryClient.invalidateQueries({ queryKey: ['api'] })
        }
      })
    }
  }

  const tab: string = params.tab || 'infos';

  

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
          to={`/${props.currentTeam._humanReadableId}/settings/apis`}
        >
          <i className="fas fa-chevron-left me-1" />
          {translate({ key: 'back.to.team', replacements: [props.currentTeam.name] })}
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

  if (tenant.creationSecurity && !props.currentTeam.apisCreationPermission) {
    toast.error(translate('creation.security.enabled.message'))
    return null;
  }

  if (!newApi && apiRequest.isLoading) {
    return <Spinner />
  } else if (newApi || (apiRequest.data && !isError(apiRequest.data))) {
    const api = newApi || apiRequest.data;

    return (
      <Can I={manage} a={API} team={props.currentTeam} dispatchError>
        <div className="d-flex flex-row justify-content-between align-items-center">
          {props.creation ? (<h2>{api.name}</h2>) : (<div className="d-flex align-items-center justify-content-between" style={{ flex: 1 }}>
            <h2 className="me-2">{api.name} {additionalHeader ? ` - ${additionalHeader}` : ''}</h2>
          </div>)}
          <button onClick={() => toggleExpertMode()} className="btn btn-sm btn-outline-primary">
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
                  team={props.currentTeam}
                  api={api}
                  onSave={documentation => save({ ...api, documentation })}
                  reloadState={() => queryClient.invalidateQueries({ queryKey: ['api'] })}
                  documentation={api.documentation}
                  importPage={() => openApiDocumentationSelectModal({
                    api: api,
                    teamId: props.currentTeam._id,
                    onClose: () => {
                      toast.success(translate('doc.page.import.successfull'));
                      queryClient.invalidateQueries({ queryKey: ['details'] });
                      queryClient.invalidateQueries({ queryKey: ['api'] });
                    },
                    getDocumentationPages: () => Services.getAllApiDocumentation(props.currentTeam._id, api._id, api.currentVersion),
                    importPages: (pages: Array<string>, linked?: boolean) => Services.importApiPages(props.currentTeam._id, api._id, pages, api.currentVersion, linked)
                  })}
                  importAuthorized={!!versionsRequest.data && !!versionsRequest.data.length} />)}
              {tab === 'plans' && (
                <TeamApiPricings
                  {...props}
                  api={api}
                  reload={() => queryClient.invalidateQueries({ queryKey: ['api'] })}
                  setDefaultPlan={plan => setDefaultPlan(api, plan)}
                  team={props.currentTeam}
                  tenant={tenant}
                  creation={!!props.creation}
                  expertMode={expertMode}
                  injectSubMenu={(component) => methods.addMenu({
                    blocks: {
                      links: { links: { plans: { childs: { menu: { component } } } } },
                    },
                  })}
                  setHeader={(planName) => setAdditionalHeader(planName)} />)}
              {tab === 'infos' && (
                <TeamApiInfos
                  value={api}
                  team={props.currentTeam}
                  tenant={tenant}
                  save={save}
                  creation={props.creation}
                  expertMode={expertMode}
                  injectSubMenu={(component) => methods.addMenu({
                    blocks: {
                      links: { links: { informations: { childs: { menu: { component } } } } },
                    },
                  })} />)}
              {tab === 'news' && (<TeamApiPost team={props.currentTeam} api={api} />)}
              {tab === 'settings' && <TeamApiSettings api={api} {...props} />}
              {tab === 'stats' && !match && <TeamApiConsumption api={api} {...props} />}
              {tab === 'stats' && match && match.params.planId && (<TeamPlanConsumption />)}
              {tab === 'subscriptions' && <TeamApiSubscriptions api={api} {...props} />}
            </div>
          </div>
        </div>
      </Can>
    );
  } else {
    return <div>Error while fetching api details</div>
  }


};
