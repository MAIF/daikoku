import React, { useState, useRef, useContext, useEffect } from 'react';
import { useParams, useLocation, useNavigate, useMatch } from 'react-router-dom';
import { Form, constraints, type, format } from '@maif/react-forms';
import { useSelector } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import { Can, manage, api as API, Spinner } from '../../utils';
import { ModalContext, useApiGroupBackOffice } from '../../../contexts';
import { I18nContext, toggleExpertMode } from '../../../core';
import * as Services from '../../../services';
import {
  TeamApiPricings,
  TeamApiSettings,
  TeamPlanConsumption,
  TeamApiSubscriptions,
  TeamApiConsumption,
} from '.';
import { useDispatch } from 'react-redux';

type LocationState = {
  newApiGroup?: any
}

export const TeamApiGroup = () => {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/apigroups/:apiGroupId/stats/plan/:planId');

  const [apiGroup, setApiGroup] = useState<any>();

  const { currentTeam, expertMode, tenant } = useSelector((s: any) => s.context);
  const dispatch = useDispatch();

  const state: LocationState = location.state as LocationState
  const creation = state?.newApiGroup;

  const methods = useApiGroupBackOffice(apiGroup, creation);

  useEffect(() => {
    if (state?.newApiGroup) {
      setApiGroup(state.newApiGroup);
    }
    else {
      Services.teamApi(currentTeam._id, params.apiGroupId!, '1.0.0').then(setApiGroup);
    }
  }, [params.apiGroupId, state?.newApiGroup]);

  const save = (group: any) => {
    if (creation) {
      return Services.createTeamApi(currentTeam._id, group).then((createdGroup) => {
        if (createdGroup.error) {
          toastr.error(translate('Error'), translate(createdGroup.error));
          return createdGroup;
        } else if (createdGroup.name) {
          toastr.success(
            translate('Success'),
            translate({ key: 'group.created.success', replacements: [createdGroup.name] })
          );

          methods.setApiGroup(createdGroup);
          navigate(
            `/${currentTeam._humanReadableId}/settings/apigroups/${createdGroup._humanReadableId}/infos`
          );
        }
      });
    } else {
      return Services.saveTeamApiWithId(
        currentTeam._id,
        group,
        group.currentVersion,
        group._humanReadableId
      ).then((res) => {
        if (res.error) {
          toastr.error(translate('error'), translate(res.error));
          return res;
        } else {
          toastr.success(translate('Success'), translate('Group saved'));
          setApiGroup(group);

          if (res._humanReadableId !== group._humanReadableId) {
            navigate(
              `/${currentTeam._humanReadableId}/settings/apigrouups/${res._humanReadableId}/infos`
            );
          }
        }
      });
    }
  };

  const { translate } = useContext(I18nContext);
  const { alert } = useContext(ModalContext);

  const schema: ({ [key: string]: any }) = {
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
    published: {
      type: type.bool,
      label: translate('Published'),
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
      transformer: (t: any) => ({
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
        test: (v: any) => v !== 'Public',
      },
      label: translate('Authorized teams'),
      optionsFrom: '/api/teams',
      transformer: (t: any) => ({
        label: t.name,
        value: t._id
      }),
    },
    apis: {
      type: type.string,
      label: translate({ key: 'API', plural: true }),
      format: format.select,
      isMulti: true,
      optionsFrom: Services.teamApis(currentTeam._id).then((apis) => apis.filter((api: any) => api._id !== apiGroup?._id && !api.apis)),
      transformer: (api: any) => ({
        label: `${api.name} - ${api.currentVersion}`,
        value: api._id
      }),
    },
  };

  const simpleOrExpertMode = (entry: string, expert: boolean) => {
    return !!expert || !schema[entry]?.expert;
  };
  const flow = [
    {
      label: translate('Basic.informations'),
      flow: ['published', 'name', 'smallDescription', 'apis'].filter((entry) =>
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
  return (<Can I={manage} a={API} team={currentTeam} dispatchError>
    {!apiGroup && <Spinner />}
    {apiGroup && (<>
      <div className="d-flex flex-row justify-content-between align-items-center">
        {creation ? (<h2>{apiGroup.name}</h2>) : (<div className="d-flex align-items-center justify-content-between" style={{ flex: 1 }}>
          <h2 className="me-2">{apiGroup.name}</h2>
        </div>)}
        <button onClick={() => dispatch(toggleExpertMode())} className="btn btn-sm btn-outline-primary">
          {expertMode && translate('Standard mode')}
          {!expertMode && translate('Expert mode')}
        </button>
      </div>
      <div className="row">
        <div className="section col container-api">
          <div className="mt-2">
            {params.tab === 'infos' && (<div>
              <Form
                schema={schema}
                flow={flow}
                onSubmit={save}
                value={apiGroup} />
            </div>)}
            {params.tab === 'plans' && (<div>
              <TeamApiPricings
                value={apiGroup}
                team={currentTeam}
                tenant={tenant}
                save={save}
                creation={creation}
                expertMode={expertMode}
                injectSubMenu={(component: any) => methods.addMenu({
                  blocks: {
                    links: { links: { plans: { childs: { menu: { component } } } } },
                  },
                })}
                openApiSelectModal={() => alert({message: 'oops'})} />
            </div>)}
            {tab === 'settings' && <TeamApiSettings api={apiGroup} apiGroup />}
            {tab === 'stats' && !match && <TeamApiConsumption api={apiGroup} apiGroup />}
            {tab === 'stats' && match && match.params.planId && (<TeamPlanConsumption api={apiGroup} apiGroup />)}
            {tab === 'subscriptions' && <TeamApiSubscriptions api={apiGroup} />} {/* FIXME: a props APIGROUP has been removed...maybe add it in team api sub component */}
          </div>
        </div>
      </div>
    </>)}
  </Can>);
};
