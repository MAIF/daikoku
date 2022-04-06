import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import * as Services from '../../../services';

import { AvatarChooser, Can, manage, tenant, Spinner } from '../../utils';
import { toastr } from 'react-redux-toastr';
import { I18nContext } from '../../../locales/i18n-context';
import { useTenantBackOffice } from '../../../contexts';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

export const TeamEditForAdmin = () => {
  const context = useSelector(s => s.context);
  useTenantBackOffice();
  
  const [team, setTeam] = useState(null);
  const [create, setCreate] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const { translateMethod, Translation } = useContext(I18nContext);

  const flow = [
    '_id',
    'name',
    'description',
    'contact',
    'avatar',
    'avatarFrom',
    'metadata',
    'apisCreationPermission',
  ];

  const schema = {
    _id: {
      type: 'string',
      props: { label: 'Id', disabled: true },
    },
    type: {
      type: 'select',
      props: {
        label: translateMethod('Type'),
        possibleValues: [
          { label: 'Personal', value: 'Personal' },
          { label: 'Organization', value: 'Organization' },
        ],
      },
    },
    name: {
      type: 'string',
      props: { label: translateMethod('Name') },
    },
    description: {
      type: 'string',
      props: { label: translateMethod('Description') },
    },
    contact: {
      type: 'string',
      props: { label: translateMethod('Team contact') },
    },
    avatar: {
      type: 'string',
      props: { label: translateMethod('Team avatar') },
    },
    avatarFrom: {
      type: AvatarChooser,
      props: {
        team: () => team,
      },
    },
    metadata: {
      type: 'object',
      visible: () => window.location.pathname.indexOf('/edition') === -1,
      props: {
        label: translateMethod('Metadata'),
      },
    },
    apisCreationPermission: {
      type: 'bool',
      visible: () => context.tenant.creationSecurity,
      props: {
        label: translateMethod('APIs creation permission'),
        help: translateMethod('apisCreationPermission.help', false, 'test.help'),
      },
    },
  };

  const save = () => {
    if (location && location.state && location.state.newTeam) {
      Services.createTeam(team).
        then((team) => {
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
            navigate(`/settings/teams/${team._humanReadableId}/members`);
          }
        });
    } else {
      Services.updateTeam(team)
        .then((t) => {
          setTeam(t);
          toastr.success(translateMethod('team.updated'));
        });
    }
  };

  const members = () => {
    navigate(`/settings/teams/${team._humanReadableId}/members`);
  };

  useEffect(() => {
    if (location && location.state && location.state.newTeam) {
      setTeam(location.state.newTeam);
      setCreate(true);
    } else {
      Services.teamFull(params.teamSettingId)
        .then(setTeam);
    }
  }, []);

  if (!team) {
    return null;
  }

  return (
    <Can I={manage} a={tenant} dispatchError>
      <div className="row d-flex justify-content-start align-items-center mb-2">
        {team && (
          <div className="ms-1 avatar__container">
            <img src={team.avatar} className="img-fluid" alt="avatar" />
          </div>
        )}
        <h1 className="h1-rwd-reduce ms-2">Team - {team.name}</h1>
      </div>
      <div className="row">
        <React.Suspense fallback={<Spinner />}>
          <LazyForm
            flow={flow}
            schema={schema}
            value={team}
            onChange={setTeam}
            style={{ marginBottom: 100, paddingTop: 20 }}
          />
        </React.Suspense>
        <div className="row form-back-fixedBtns">
          <div className="d-flex justify-content-end">
            <Link className="btn btn-outline-primary" to={'/settings/teams'}>
              <i className="fas fa-chevron-left me-1" />
              <Translation i18nkey="Back">Back</Translation>
            </Link>
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
              onClick={save}
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
      </div>
    </Can>
  );
}
