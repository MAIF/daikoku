import { Form, constraints, format, type } from '@maif/react-forms';
import { useContext, useEffect, useState } from 'react';
import { useLocation, useMatch, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { TeamBackOfficeProps } from '../TeamBackOffice';

type LocationState = {
  newApiGroup?: IApi
}


export const TeamApiGroup = (props: TeamBackOfficeProps) => {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/apigroups/:apiGroupId/stats/plan/:planId');

  const { tenant, expertMode, toggleExpertMode } = useContext(GlobalContext);

  const state: LocationState = location.state as LocationState
  const creation = state?.newApiGroup;

  const [additionalHeader, setAdditionalHeader] = useState<string>()

  const queryClient = useQueryClient();
  const apiGroupRequest = useQuery({
    queryKey: ['apiGroup', params.apiGroupId!],
    queryFn: () => Services.teamApi(props.currentTeam._id, params.apiGroupId!, '1.0.0'),
    enabled: !creation
  })

  const methods = useApiGroupBackOffice(!!creation);

  useEffect(() => {
    if (apiGroupRequest.isLoading) {
      document.title = translate('???');
    } else if (apiGroupRequest.data) {
      if (!isError(apiGroupRequest.data)) {
        const apiGroup = apiGroupRequest.data

        document.title = `${props.currentTeam.name} - ${apiGroup ? apiGroup.name : translate('API group')}`;
      }
    }
  }, [apiGroupRequest.data]);



  const save = (group: IApi) => {
    if (creation) {
      return Services.createTeamApi(props.currentTeam._id, group).then((createdGroup) => {
        if (createdGroup.error) {
          toast.error(translate(createdGroup.error));
          return createdGroup;
        } else if (createdGroup.name) {
          toast.success(translate({ key: 'group.created.success', replacements: [createdGroup.name] })
          );

          navigate(`/${props.currentTeam._humanReadableId}/settings/apigroups/${createdGroup._humanReadableId}/infos`);
        }
      });
    } else {
      return Services.saveTeamApiWithId(
        props.currentTeam._id,
        group,
        group.currentVersion,
        group._humanReadableId
      ).then((res) => {
        if (isError(res)) {
          toast.error(translate(res.error));
          return res;
        } else {
          toast.success(translate('Group saved'));
          queryClient.invalidateQueries({ queryKey: ['apiGroup'] })

          if (res._humanReadableId !== group._humanReadableId) {
            navigate(`/${props.currentTeam._humanReadableId}/settings/apigrouups/${res._humanReadableId}/infos`);
          }
        }
      });
    }
  };

  const setDefaultPlan = (apiGroup: IApi, plan: IUsagePlan) => {
    if (apiGroup && apiGroup.defaultUsagePlan !== plan._id && plan.visibility !== 'Private') {
      const updatedApi = { ...apiGroup, defaultUsagePlan: plan._id }
      Services.saveTeamApiWithId(
        props.currentTeam._id,
        updatedApi,
        apiGroup.currentVersion,
        updatedApi._humanReadableId
      ).then((response) => {
        if (isError(response)) {
          toast.error(translate(response.error));
        } else {
          queryClient.invalidateQueries({ queryKey: ['apiGroup'] })
        }
      })
    }
  }

  const { translate } = useContext(I18nContext);
  const { alert } = useContext(ModalContext);

  const schema = (apiGroup: IApi): ({ [key: string]: any }) => ({
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
      optionsFrom: () => Services.teamApis(props.currentTeam._id)
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

  if (!creation && apiGroupRequest.isLoading) {
    return <Spinner />;
  } else if (creation || (apiGroupRequest.data && !isError(apiGroupRequest.data))) {
    const apiGroup = creation || apiGroupRequest.data as IApi
    return (
      <Can I={manage} a={API} team={props.currentTeam} dispatchError>
        <div className="d-flex flex-row justify-content-between align-items-center">
          {creation ? (<h2>{apiGroup.name}</h2>) : (<div className="d-flex align-items-center justify-content-between" style={{ flex: 1 }}>
            <h2 className="me-2">{apiGroup.name}{additionalHeader ? ` - ${additionalHeader}` : ''}</h2>
          </div>)}
          <button onClick={() => toggleExpertMode()} className="btn btn-sm btn-outline-primary">
            {expertMode && translate('Standard mode')}
            {!expertMode && translate('Expert mode')}
          </button>
        </div>
        <div className="row">
          <div className="section col container-api">
            <div className="mt-2">
              {params.tab === 'infos' && (<div>
                <Form
                  schema={schema(apiGroup)}
                  flow={flow}
                  onSubmit={save}
                  value={apiGroup} />
              </div>)}
              {params.tab === 'plans' && (<div>
                <TeamApiPricings
                  {...props}
                  api={apiGroup}
                  reload={() => queryClient.invalidateQueries({ queryKey: ["apigroup"] })}
                  team={props.currentTeam}
                  tenant={tenant}
                  setDefaultPlan={plan => setDefaultPlan(apiGroup, plan)}
                  creation={!!creation}
                  expertMode={expertMode}
                  injectSubMenu={(component) => methods.addMenu({
                    blocks: {
                      links: { links: { plans: { childs: { menu: { component } } } } },
                    },
                  })}
                  openApiSelectModal={() => alert({ message: 'oops' })}
                  setHeader={(planName) => setAdditionalHeader(planName)} />

              </div>)}
              {tab === 'settings' && <TeamApiSettings api={apiGroup} apiGroup {...props} />}
              {tab === 'stats' && !match && <TeamApiConsumption api={apiGroup} apiGroup {...props} />}
              {tab === 'stats' && match && match.params.planId && (<TeamPlanConsumption apiGroup />)}
              {tab === 'subscriptions' && <TeamApiSubscriptions api={apiGroup} {...props} />} {/* FIXME: a props APIGROUP has been removed...maybe add it in team api sub component */}
            </div>
          </div>
        </div>
      </Can>
    );
  } else {
    return <div>Error while fetching api group details</div>
  }


};
