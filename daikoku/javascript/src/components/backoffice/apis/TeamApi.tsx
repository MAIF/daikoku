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
  TeamApiSwagger,
  TeamApiTesting,
  TeamPlanConsumption
} from '.';
import { I18nContext, ModalContext, useApiBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { ITeamSimple } from '../../../types';
import { IApi, IUsagePlan, isError } from '../../../types/api';
import { api as API, Can, Spinner, manage } from '../../utils';

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
    <button onClick={promptVersion} className="btn btn-sm btn-outline-info ms-1" aria-label={translate('Create new version')}>
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

  const [additionalHeader, setAdditionalHeader] = useState<string>()

  const location = useLocation();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/apis/:apiId/:version/stats/plan/:planId');

  const { tenant, expertMode, toggleExpertMode } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);
  const { openApiDocumentationSelectModal } = useContext(ModalContext);

  const newApi: IApi | undefined = location && location.state && location.state.newApi

  const { addMenu, api, versions, isLoading, setApi, reloadApi, currentTeam } = useApiBackOffice(props.creation);

  useEffect(() => {
    if (isLoading) {
      document.title = translate('???');
    } else if (currentTeam && props.creation) {
      document.title = `${currentTeam.name} - ${translate('New api')}`;
    } else if (currentTeam && api && versions) {
      const _versions = versions.map((v) => ({
        label: v,
        value: v
      }));

      document.title = `${currentTeam.name} - ${api ? api.name : translate('API')}`;


      if (!props.creation) {
        addMenu({
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
                        options={_versions}
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
  }, [api, versions, isLoading]);

  const save = (editedApi: IApi) => {
    if (props.creation) {
      return Services.createTeamApi(currentTeam!._id, editedApi)
        .then((createdApi) => {
          if (createdApi.error) {
            toast.error(translate(createdApi.error));
            return createdApi;
          } else if (createdApi.name) {
            toast.success(translate({ key: 'api.created.success', replacements: [createdApi.name] })
            );
            setApi(createdApi);
            navigate(`/${currentTeam!._humanReadableId}/settings/apis/${createdApi._humanReadableId}/${createdApi.currentVersion}/infos`);
          }
        });
    } else {
      return Services.saveTeamApiWithId(
        currentTeam!._id,
        editedApi,
        editedApi.currentVersion,
        editedApi._humanReadableId
      ).then((res) => {
        if (isError(res)) {
          toast.error(translate(res.error));
        } else {
          toast.success(translate('Api saved'));
          if (res._humanReadableId !== editedApi._humanReadableId) {
            navigate(`/${currentTeam!._humanReadableId}/settings/apis/${res._humanReadableId}/${res.currentVersion}/infos`);
          } else {
            reloadApi()
          }
        }
      });
    }
  };

  const setDefaultPlan = (api: IApi, plan: IUsagePlan) => {
    if (api && api.defaultUsagePlan !== plan._id && plan.visibility !== 'Private') {
      const updatedApi = { ...api, defaultUsagePlan: plan._id }
      Services.saveTeamApiWithId(
        currentTeam!._id,
        updatedApi,
        api.currentVersion,
        updatedApi._humanReadableId
      ).then((response) => {
        if (isError(response)) {
          toast.error(translate(response.error));
        } else {
          reloadApi()
        }
      })
    }
  }

  const tab: string = params.tab || 'infos';

  useEffect(() => {
    if (currentTeam && api) {
      const backButton = (
        <Link
          className="d-flex justify-content-around mt-3 align-items-center companion-link"
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
        addMenu({
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
        addMenu({
          blocks: {
            actions: {
              links: {
                view: {
                  component: (
                    <Link
                      to={`/${currentTeam._humanReadableId}/${params.apiId}/${params.versionId}/description`}
                      className="btn btn-sm btn-outline-primary mb-2">
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
  }, [currentTeam, api]);

  if (tenant.creationSecurity && !currentTeam?.apisCreationPermission) {
    toast.error(translate('creation.security.enabled.message'))
    return null;
  }

  if (!newApi && isLoading) {
    return <Spinner />
  } else if ((newApi || api) && currentTeam) {
    const _api = (newApi || api) as IApi;

    return (
      <Can I={manage} a={API} team={currentTeam} dispatchError>
        <div className="d-flex flex-row justify-content-between align-items-center">
          {props.creation ? (<h2>{_api.name}</h2>) : (<div className="d-flex align-items-center justify-content-between" style={{ flex: 1 }}>
            <h2 className="me-2">{_api.name} {additionalHeader ? ` - ${additionalHeader}` : ''}</h2>
          </div>)}
          <button onClick={() => toggleExpertMode()} className="btn btn-sm btn-outline-info">
            {expertMode && translate('Standard mode')}
            {!expertMode && translate('Expert mode')}
          </button>
        </div>
        <div className="row">
          <div className="section col">
            <div className="my-2">
              {tab === 'documentation' && (
                <TeamApiDocumentation
                  creationInProgress={props.creation}
                  team={currentTeam}
                  api={_api}
                  onSave={documentation => save({ ..._api, documentation })}
                  reloadState={() => reloadApi()}
                  documentation={_api.documentation!}
                  importPage={() => openApiDocumentationSelectModal({
                    api: _api,
                    teamId: currentTeam._id,
                    onClose: () => {
                      toast.success(translate('doc.page.import.successfull'));
                      reloadApi()
                    },
                    getDocumentationPages: () => Services.getAllApiDocumentation(currentTeam._id, _api._id, _api.currentVersion),
                    importPages: (pages: Array<string>, linked?: boolean) => Services.importApiPages(currentTeam._id, _api._id, pages, _api.currentVersion, linked)
                  })}
                  importAuthorized={!!versions && !!versions.length} />)}
              {tab === 'plans' && (
                <TeamApiPricings
                  currentTeam={currentTeam}
                  api={_api}
                  reload={() => reloadApi()}
                  setDefaultPlan={plan => setDefaultPlan(_api, plan)}
                  team={currentTeam}
                  tenant={tenant}
                  creation={!!props.creation}
                  expertMode={expertMode}
                  injectSubMenu={(component) => addMenu({
                    blocks: {
                      links: { links: { plans: { childs: { menu: { component } } } } },
                    },
                  })}
                  setHeader={(planName) => setAdditionalHeader(planName)} />)}
              {tab === 'infos' && (
                <TeamApiInfos
                  api={_api}
                  team={currentTeam}
                  tenant={tenant}
                  save={save}
                  creation={props.creation}
                  expertMode={expertMode} />)}
              {tab === 'specification' && <TeamApiSwagger value={_api} save={save}/>}
              {tab === 'testing' && <TeamApiTesting value={_api} save={save} currentTeam={currentTeam}/>}
              {tab === 'news' && (<TeamApiPost team={currentTeam} api={_api} />)}
              {tab === 'settings' && <TeamApiSettings api={_api} currentTeam={currentTeam} versions={versions}/>}
              {tab === 'stats' && !match && <TeamApiConsumption api={_api} currentTeam={currentTeam} />}
              {tab === 'stats' && match && match.params.planId && (<TeamPlanConsumption api={_api} currentTeam={currentTeam} />)}
              {tab === 'subscriptions' && <TeamApiSubscriptions api={_api} currentTeam={currentTeam} />}
            </div>
          </div>
        </div>
      </Can>
    );
  } else {
    return <div>Error while fetching api details</div>
  }


};
