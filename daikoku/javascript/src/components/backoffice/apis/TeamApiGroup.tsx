import { Form, constraints, format, type } from '@maif/react-forms';
import { useContext, useEffect, useState } from 'react';
import { useLocation, useMatch, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import {
  TeamApiConsumption,
  TeamApiPricings,
  TeamApiSettings,
  TeamApiSubscriptions,
  TeamPlanConsumption,
} from '.';
import { I18nContext, ModalContext, useApiGroupBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { IApi, ITeamSimple, IUsagePlan, isError } from '../../../types';
import { api as API, Can, Spinner, manage } from '../../utils';

type LocationState = {
  newApiGroup?: IApi
}


export const TeamApiGroup = () => {
  const location = useLocation();
  const state: LocationState = location.state as LocationState
  const creation = state?.newApiGroup;


  const { apiGroup, isLoading, currentTeam, addMenu, reloadApiGroup } = useApiGroupBackOffice(!!creation);

  const params = useParams();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/apigroups/:apiGroupId/stats/plan/:planId');

  const { tenant, expertMode, toggleExpertMode } = useContext(GlobalContext);


  const [additionalHeader, setAdditionalHeader] = useState<string>()

  useEffect(() => {
    if (apiGroup && currentTeam) {
      document.title = `${currentTeam.name} - ${apiGroup ? apiGroup.name : translate('API group')}`;
    }
  }, [apiGroup, currentTeam]);



  const save = (group: IApi) => {
    if (creation) {
      console.debug({ group })
      return Services.createTeamApi(currentTeam!._id, group)
        .then((createdGroup) => {
          if (createdGroup.error) {
            toast.error(translate(createdGroup.error));
            return createdGroup;
          } else if (createdGroup.name) {
            toast.success(translate({ key: 'group.created.success', replacements: [createdGroup.name] })
            );

            navigate(`/${currentTeam!._humanReadableId}/settings/apigroups/${createdGroup._humanReadableId}/infos`);
          }
        });
    } else {
      return Services.saveTeamApiWithId(
        currentTeam!._id,
        group,
        group.currentVersion,
        group._humanReadableId
      ).then((res) => {
        if (isError(res)) {
          toast.error(translate(res.error));
          return res;
        } else {
          toast.success(translate('Group saved'));
          reloadApiGroup()

          if (res._humanReadableId !== group._humanReadableId) {
            navigate(`/${currentTeam!._humanReadableId}/settings/apigroups/${res._humanReadableId}/infos`);
          }
        }
      });
    }
  };

  const setDefaultPlan = (apiGroup: IApi, plan: IUsagePlan, team: ITeamSimple) => {
    if (apiGroup && apiGroup.defaultUsagePlan !== plan._id && plan.visibility !== 'Private') {
      const updatedApi = { ...apiGroup, defaultUsagePlan: plan._id }
      Services.saveTeamApiWithId(
        team._id,
        updatedApi,
        apiGroup.currentVersion,
        updatedApi._humanReadableId
      ).then((response) => {
        if (isError(response)) {
          toast.error(translate(response.error));
        } else {
          reloadApiGroup()
        }
      })
    }
  }

  const { translate } = useContext(I18nContext);
  const { alert } = useContext(ModalContext);

  const schema = (apiGroup: IApi, team: ITeamSimple): ({ [key: string]: any }) => ({
    name: {
      type: type.string,
      label: translate('Name'),
      placeholder: translate('Name'),
      constraints: [
        constraints.required(translate('constraints.required.name')),
        constraints.test('name_already_exist', translate('api.already.exists'), (name, context) => Services.checkIfApiNameIsUnique(name, context.parent._id).then((r) => !r.exists)),
      ],
    },
    smallDescription: {
      type: type.string,
      format: format.text,
      label: translate('Small desc.'),
    },
    description: {
      type: type.string,
      format: format.markdown,
      label: translate('Description'),
    },
    state: {
      type: type.string,
      format: format.buttonsSelect,
      label: translate('State'),
      options: [
        { label: translate('Created'), value: 'created' },
        { label: translate('Published'), value: 'published' },
        { label: translate('Deprecated'), value: 'deprecated' },
        { label: translate('Blocked'), value: 'blocked' }],
      defaultValue: 'created',
    },
    tags: {
      type: type.string,
      array: true,
      label: translate('Tags'),
      expert: true,
    },
    categories: {
      type: type.string,
      format: format.select,
      isMulti: true,
      createOption: true,
      label: translate('Categories'),
      optionsFrom: '/api/categories',
      transformer: (t: string) => ({
        label: t,
        value: t
      }),
      expert: true,
    },
    visibility: {
      type: type.string,
      format: format.buttonsSelect,
      label: translate('Visibility'),
      options: [
        { label: translate('Public'), value: 'Public' },
        { label: translate('Private'), value: 'Private' },
        {
          label: translate('PublicWithAuthorizations'),
          value: 'PublicWithAuthorizations',
        },
      ],
    },
    authorizedTeams: {
      type: type.string,
      format: format.select,
      isMulti: true,
      defaultValue: [],
      visible: {
        ref: 'visibility',
        test: (v: string) => v !== 'Public',
      },
      label: translate('Authorized teams'),
      optionsFrom: '/api/me/teams',
      transformer: (t: ITeamSimple) => ({
        label: t.name,
        value: t._id
      }),
    },
    apis: {
      type: type.string,
      label: translate({ key: 'API', plural: true }),
      format: format.select,
      isMulti: true,
      optionsFrom: () => Services.teamApis(team._id)
        .then((apis) => {
          if (!isError(apis)) {
            return apis.filter((api) => api._id !== apiGroup?._id && !api.apis)
          }
        }),
      transformer: (api) => ({
        label: `${api.name} - ${api.currentVersion}`,
        value: api._id
      }),
    },
  });

  const simpleOrExpertMode = (entry: string, expert: boolean) => {
    return !!expert || !schema[entry]?.expert;
  };
  const flow = [
    {
      label: translate('Basic.informations'),
      flow: ['name', 'state', 'smallDescription', 'apis'].filter((entry) =>
        simpleOrExpertMode(entry, expertMode)
      ),
      collapsed: false,
    },
    {
      label: translate('Description'),
      flow: ['description'],
      collapsed: true,
    },
    {
      label: translate('Tags and categories'),
      flow: ['tags', 'categories'].filter((entry) => simpleOrExpertMode(entry, expertMode)),
      collapsed: true,
    },
    {
      label: translate('Visibility'),
      flow: ['visibility', 'authorizedTeams'].filter((entry) =>
        simpleOrExpertMode(entry, expertMode)
      ),
      collapsed: true,
    },
  ];

  const { tab } = params;

  if (!creation && isLoading) {
    return <Spinner />;
  } else if ((creation || !!apiGroup) && currentTeam) {
    const _apiGroup = (creation || apiGroup) as IApi
    return (
      <Can I={manage} a={API} team={currentTeam} dispatchError>
        <div className="d-flex flex-row justify-content-between align-items-center">
          {creation ? (<h2>{_apiGroup.name}</h2>) : (<div className="d-flex align-items-center justify-content-between" style={{ flex: 1 }}>
            <h2 className="me-2">{_apiGroup.name}{additionalHeader ? ` - ${additionalHeader}` : ''}</h2>
          </div>)}
          <button onClick={() => toggleExpertMode()} className="btn btn-sm btn-outline-info">
            {expertMode && translate('Standard mode')}
            {!expertMode && translate('Expert mode')}
          </button>
        </div>
        <div className="row">
          <div className="section col container-api">
            <div className="my-2">
              {params.tab === 'infos' && (<div>
                <Form
                  schema={schema(_apiGroup, currentTeam)}
                  flow={flow}
                  onSubmit={save}
                  value={_apiGroup} />
              </div>)}
              {params.tab === 'plans' && (<div>
                <TeamApiPricings
                  currentTeam={currentTeam}
                  api={_apiGroup}
                  reload={reloadApiGroup}
                  team={currentTeam}
                  tenant={tenant}
                  setDefaultPlan={plan => setDefaultPlan(_apiGroup, plan, currentTeam)}
                  creation={!!creation}
                  expertMode={expertMode}
                  injectSubMenu={(component) => addMenu({
                    blocks: {
                      links: { links: { plans: { childs: { menu: { component } } } } },
                    },
                  })}
                  openApiSelectModal={() => alert({ message: 'oops' })}
                  setHeader={(planName) => setAdditionalHeader(planName)} />

              </div>)}
              {tab === 'settings' && <TeamApiSettings api={_apiGroup} currentTeam={currentTeam} />}
              {tab === 'stats' && !match && <TeamApiConsumption api={_apiGroup} apiGroup currentTeam={currentTeam} />}
              {tab === 'stats' && match && match.params.planId && (<TeamPlanConsumption api={_apiGroup} currentTeam={currentTeam} />)}
              {tab === 'subscriptions' && <TeamApiSubscriptions api={_apiGroup} currentTeam={currentTeam} />} {/* FIXME: a props APIGROUP has been removed...maybe add it in team api sub component */}
            </div>
          </div>
        </div>
      </Can>
    );
  } else {
    return <div>Error while fetching api group details</div>
  }


};
