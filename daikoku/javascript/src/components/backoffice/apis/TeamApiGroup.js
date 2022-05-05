import React, { useState, useRef, useContext, useEffect, } from 'react';
import { useParams, useLocation, useNavigate, useMatch } from 'react-router-dom';
import { Form, constraints, type, format } from '@maif/react-forms';
import { useSelector } from 'react-redux'
import { toastr } from 'react-redux-toastr';

import { useApiGroupBackOffice } from '../../../contexts';
import { I18nContext } from '../../../core';
import * as Services from '../../../services';

export const TeamApiGroup = () => {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [apiGroup, setApiGroup] = useState()

  const { currentTeam, expertMode } = useSelector(s => s.context)

  useApiGroupBackOffice(apiGroup)

  useEffect(() => {
    if (location?.state?.newApiGroup) {
      setApiGroup(location.state.newApiGroup)
    } else {
      Services.teamApi(currentTeam._id, params.apiGroupId, '1.0.0')
        .then(setApiGroup)
    }
  }, [params.apiGroupId, location.state?.newApiGroup]);

  const save = (group) => {
    if (location.state?.newApiGroup) {
      return Services.createTeamApi(currentTeam._id, group)
        .then((createdGroup) => {
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
          toastr.error(translateMethod(res.error));
          return res;
        } else {
          toastr.success(translateMethod('Group saved'));
          setApiGroup(group);

          if (res._humanReadableId !== group._humanReadableId) {
            navigate(
              `/${currentTeam._humanReadableId}/settings/apigrouups/${res._humanReadableId}/infos`
            );
          }
        }
      });
    }
  }


  const { translateMethod } = useContext(I18nContext);

  const schema = {
    name: {
      type: type.string,
      label: translateMethod('Name'),
      placeholder: translateMethod('Name'),
      constraints: [
        constraints.required(translateMethod('constraints.required.name')),
        constraints.test(
          'name_already_exist',
          translateMethod('api.already.exists'),
          (name, context) =>
            Services.checkIfApiNameIsUnique(name, context.parent._id)
              .then((r) => !r.exists)
        ),
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
      transformer: (t) => ({ label: t, value: t }),
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
        test: (v) => v !== 'Public',
      },
      label: translateMethod('Authorized teams'),
      optionsFrom: '/api/teams',
      transformer: (t) => ({ label: t.name, value: t._id }),
    },
    apis: {
      type: type.string,
      label: translateMethod('APIs'),
      format: format.select,
      isMulti: true,
      optionsFrom: Services.teamApis(currentTeam._id),
      transformer: api => ({ label: `${api.name} - ${api.currentVersion}`, value: api._id })

    },
  };

  const simpleOrExpertMode = (entry, expert) => {
    return !!expert || !schema[entry]?.expert;
  };
  const flow = [
    {
      label: translateMethod('Basic'),
      flow: ['published', 'name', 'smallDescription', 'apis'].filter((entry) =>
        simpleOrExpertMode(entry, expertMode)
      ),
      collapsed: false,
    },
    {
      label: translateMethod('Description'),
      flow: ['description'],
      collapsed: true
    },
    {
      label: translateMethod('Tags and categories'),
      flow: ['tags', 'categories'].filter(
        (entry) => simpleOrExpertMode(entry, expertMode)
      ),
      collapsed: true,
    },
    {
      label: translateMethod('Visibility'),
      flow: ['visibility', 'authorizedTeams'].filter((entry) => simpleOrExpertMode(entry, expertMode)),
      collapsed: true,
    },
  ];


  return (
    <div>
      <Form
        schema={schema}
        flow={flow}
        onSubmit={save}
        value={apiGroup}
      />
    </div>
  )
}