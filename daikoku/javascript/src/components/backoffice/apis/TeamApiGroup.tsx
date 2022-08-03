import React, { useState, useRef, useContext, useEffect } from 'react';
import { useParams, useLocation, useNavigate, useMatch } from 'react-router-dom';
import { Form, constraints, type, format } from '@maif/react-forms';
import { useSelector } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';

import { Can, manage, api as API, Spinner } from '../../utils';
import { useApiGroupBackOffice } from '../../../contexts';
import { I18nContext } from '../../../core';
import * as Services from '../../../services';
import {
  TeamApiPricings,
  TeamApiSettings,
  TeamPlanConsumption,
  TeamApiSubscriptions,
  TeamApiConsumption,
} from '.';

export const TeamApiGroup = () => {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/apigroups/:apiGroupId/stats/plan/:planId');

  const [apiGroup, setApiGroup] = useState();

  const { currentTeam, expertMode, tenant } = useSelector((s) => (s as any).context);

  const creation = (location as any)?.state?.newApiGroup;

  const methods = useApiGroupBackOffice(apiGroup, creation);

  useEffect(() => {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (location?.state?.newApiGroup) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        setApiGroup(location.state.newApiGroup);
    }
    else {
        Services.teamApi(currentTeam._id, params.apiGroupId, '1.0.0').then(setApiGroup);
    }
}, [params.apiGroupId, (location as any).state?.newApiGroup]);(location as any)?.state?.newApiGroup) {
      setApiGroup((location as any).state.newApiGroup);
    } else {
      Services.teamApi(currentTeam._id, params.apiGroupId, '1.0.0').then(setApiGroup);
    }
  // @ts-expect-error TS(7031): Binding element 'params' implicitly has an 'any' t... Remove this comment to see the full error message
  }, [params.apiGroupId, location.state?.newApiGroup]);

  const save = (group: any) => {
    if ((location as any).state?.newApiGroup) {
      // @ts-expect-error TS(2304): Cannot find name 'currentTeam'.
      return Services.createTeamApi(currentTeam._id, group).then((createdGroup) => {
        if (createdGroup.error) {
          toastr.error(translateMethod(createdGroup.error));
          return createdGroup;
        } else if (createdGroup.name) {
          toastr.success(
            translateMethod(
              'group.created.success',
              false,
              `API group "${createdGroup.name}" created`,
              createdGroup.name
            )
          );

          // @ts-expect-error TS(2304): Cannot find name 'methods'.
          methods.setApiGroup(createdGroup);
          // @ts-expect-error TS(2552): Cannot find name 'navigate'. Did you mean 'navigat... Remove this comment to see the full error message
          navigate(
            `/${            
// @ts-expect-error TS(2304): Cannot find name 'currentTeam'.
currentTeam._humanReadableId}/settings/apigroups/${createdGroup._humanReadableId}/infos`
          );
        }
      });
    } else {
      return Services.saveTeamApiWithId(
        // @ts-expect-error TS(2304): Cannot find name 'currentTeam'.
        currentTeam._id,
        group,
        group.currentVersion,
        group._humanReadableId
      ).then((res) => {
        if (res.error) {
          toastr.error(translateMethod(res.error));
          return res;
        } else {
          toastr.success(translateMethod('Group saved'));
          // @ts-expect-error TS(2552): Cannot find name 'setApiGroup'. Did you mean 'newA... Remove this comment to see the full error message
          setApiGroup(group);

          if (res._humanReadableId !== group._humanReadableId) {
            // @ts-expect-error TS(2552): Cannot find name 'navigate'. Did you mean 'navigat... Remove this comment to see the full error message
            navigate(
              `/${              
// @ts-expect-error TS(2304): Cannot find name 'currentTeam'.
currentTeam._humanReadableId}/settings/apigrouups/${res._humanReadableId}/infos`
            );
          }
        }
      });
    }
  };

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const schema = {
    name: {
        type: type.string,
        label: translateMethod('Name'),
        placeholder: translateMethod('Name'),
        constraints: [
            constraints.required(translateMethod('constraints.required.name')),
            constraints.test('name_already_exist', translateMethod('api.already.exists'), (name, context) => Services.checkIfApiNameIsUnique(name, context.parent._id).then((r) => !r.exists)),
        ],
    },
    smallDescription: {
        type: type.string,
        format: format.text,
        label: translateMethod('Small desc.'),
    },
    description: {
        type: type.string,
        format: format.markdown,
        label: translateMethod('Description'),
    },
    published: {
        type: type.bool,
        label: translateMethod('Published'),
    },
    tags: {
        type: type.string,
        array: true,
        label: translateMethod('Tags'),
        expert: true,
    },
    categories: {
        type: type.string,
        format: format.select,
        isMulti: true,
        createOption: true,
        label: translateMethod('Categories'),
        optionsFrom: '/api/categories',
        transformer: (t: any) => ({
            label: t,
            value: t
        }),
        expert: true,
    },
    visibility: {
        type: type.string,
        format: format.buttonsSelect,
        label: translateMethod('Visibility'),
        options: [
            { label: translateMethod('Public'), value: 'Public' },
            { label: translateMethod('Private'), value: 'Private' },
            {
                label: translateMethod('PublicWithAuthorizations'),
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
            test: (v: any) => v !== 'Public',
        },
        label: translateMethod('Authorized teams'),
        optionsFrom: '/api/teams',
        transformer: (t: any) => ({
            label: t.name,
            value: t._id
        }),
    },
    apis: {
        type: type.string,
        label: translateMethod('API', true),
        format: format.select,
        isMulti: true,
        // @ts-expect-error TS(2304): Cannot find name 'currentTeam'.
        optionsFrom: Services.teamApis(currentTeam._id).then((apis) => apis.filter((api: any) => api._id !== (apiGroup as any)?._id && !api.apis)),
        transformer: (api: any) => ({
            label: `${api.name} - ${api.currentVersion}`,
            value: api._id
        }),
    },
};

  const simpleOrExpertMode = (entry: any, expert: any) => {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return !!expert || !schema[entry]?.expert;
  };
  const flow = [
    {
      label: translateMethod('Basic.informations'),
      flow: ['published', 'name', 'smallDescription', 'apis'].filter((entry) =>
        // @ts-expect-error TS(2304): Cannot find name 'expertMode'.
        simpleOrExpertMode(entry, expertMode)
      ),
      collapsed: false,
    },
    {
      label: translateMethod('Description'),
      flow: ['description'],
      collapsed: true,
    },
    {
      label: translateMethod('Tags and categories'),
      // @ts-expect-error TS(2304): Cannot find name 'expertMode'.
      flow: ['tags', 'categories'].filter((entry) => simpleOrExpertMode(entry, expertMode)),
      collapsed: true,
    },
    {
      label: translateMethod('Visibility'),
      flow: ['visibility', 'authorizedTeams'].filter((entry) =>
        // @ts-expect-error TS(2304): Cannot find name 'expertMode'.
        simpleOrExpertMode(entry, expertMode)
      ),
      collapsed: true,
    },
  ];

  const { tab } = params;
  return (<Can I={manage} a={API} team={currentTeam} dispatchError>
      {!apiGroup && <Spinner />}
      {apiGroup && (<>
          <div className="d-flex flex-row justify-content-between align-items-center">
            {creation ? (<h2>{(apiGroup as any).name}</h2>) : (<div className="d-flex align-items-center justify-content-between" style={{ flex: 1 }}>
                <h2 className="me-2">{(apiGroup as any).name}</h2>
              </div>)}
            <button onClick={() => toggleExpertMode()} className="btn btn-sm btn-outline-primary">
              {expertMode && translateMethod('Standard mode')}
              {!expertMode && translateMethod('Expert mode')}
            </button>
          </div>
          <div className="row">
            <div className="section col container-api">
              <div className="mt-2">
                {params.tab === 'infos' && (<div>
                    <Form schema={schema} flow={flow} onSubmit={save} value={apiGroup}/>
                  </div>)}
                {params.tab === 'plans' && (<div>
                    <TeamApiPricings value={apiGroup} team={currentTeam} tenant={tenant} save={save} creation={creation} expertMode={expertMode} injectSubMenu={(component: any) => methods.addMenu({
                blocks: {
                    links: { links: { plans: { childs: { menu: { component } } } } },
                },
            })} openApiSelectModal={() => alert('oops')}/>
                  </div>)}
                {tab === 'settings' && <TeamApiSettings api={apiGroup} apiGroup/>}
                {tab === 'stats' && !match && <TeamApiConsumption api={apiGroup} apiGroup/>}
                {tab === 'stats' && match && match.params.planId && (<TeamPlanConsumption api={apiGroup} apiGroup/>)}
                {tab === 'subscriptions' && <TeamApiSubscriptions api={apiGroup} apiGroup/>}
              </div>
            </div>
          </div>
        </>)}
    </Can>);
};
