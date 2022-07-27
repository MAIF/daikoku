import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Form, type, format, constraints } from '@maif/react-forms';

import * as Services from '../../../services';
import { AvatarChooser, Can, manage, tenant } from '../../utils';
import { toastr } from 'react-redux-toastr';
import { I18nContext } from '../../../locales/i18n-context';
import { useTenantBackOffice } from '../../../contexts';

export const TeamEditForAdmin = () => {
  const context = useSelector((s) => s.context);
  useTenantBackOffice();

  const [team, setTeam] = useState(null);
  const [create, setCreate] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const { translateMethod, Translation } = useContext(I18nContext);

  const schema = {
    name: {
      type: type.string,
      label: translateMethod('Name'),
      constraints: [
        constraints.required(translateMethod('constraints.required.name'))
      ]
    },
    description: {
      type: type.string,
      label: translateMethod('Description'),
    },
    contact: {
      type: type.string,
      format: format.email,
      label: translateMethod('Team contact'),
      constraints: [
        constraints.email(translateMethod('constraint.format.email'))
      ]
    },
    avatar: {
      type: type.string,
      label: translateMethod('Team avatar'),
      render: (props) => <AvatarChooser team={() => team} {...props} />
    },
    metadata: {
      type: type.object,
      visible: window.location.pathname.indexOf('/edition') === -1,
      label: translateMethod('Metadata'),
    },
    apisCreationPermission: {
      type: 'bool',
      visible: () => context.tenant.creationSecurity,
      label: translateMethod('APIs creation permission'),
      help: translateMethod('apisCreationPermission.help', false, 'test.help'),
    },
  };

  const save = (data) => {
    if (location && location.state && location.state.newTeam) {
      Services.createTeam(data)
        .then((team) => {
          if (team.error) toastr.error(translateMethod('team_api_post.failed'));
          else {
            toastr.success(
              translateMethod(
                'team.created',
                false,
                `Team ${team.name} successfully created`,
                team.name
              )
            );
            back()
          }
        });
    } else {
      Services.updateTeam(data)
        .then(() => {
          toastr.success(translateMethod('team.updated'));
          back()
        });
    }
  };

  const back = () => navigate('/settings/teams')

  const members = () => {
    navigate(`/settings/teams/${team._humanReadableId}/members`);
  };

  useEffect(() => {
    if (location && location.state && location.state.newTeam) {
      setTeam(location.state.newTeam);
      setCreate(true);
    } else {
      Services.teamFull(params.teamSettingId).then(setTeam);
    }
  }, []);

  if (!team) {
    return null;
  }

  return (
    <Can I={manage} a={tenant} dispatchError>
      <div className="row">
        <Form
          schema={schema}
          value={team}
          onSubmit={save}
          footer={({ valid }) => {
            return (
              <div className="row form-back-fixedBtns">
                <div className="d-flex justify-content-end">
                  <button
                    style={{ marginLeft: 5 }}
                    type="button"
                    className="btn btn-outline-primary"
                    disabled={create}
                    onClick={members}
                  >
                    <span>
                      <i className="fas fa-users me-1" />
                      <Translation i18nkey="Members" isPlural>
                        Members
                      </Translation>
                    </span>
                  </button>
                  <button
                    style={{ marginLeft: 5 }}
                    type="button"
                    className="btn btn-outline-success"
                    onClick={valid}
                  >
                    {!create && (
                      <span>
                        <i className="fas fa-save me-1" />
                        <Translation i18nkey="Save">Save</Translation>
                      </span>
                    )}
                    {create && (
                      <span>
                        <i className="fas fa-save me-1" />
                        <Translation i18nkey="Create">Create</Translation>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )
          }}
        />
      </div>
    </Can>
  );
};
