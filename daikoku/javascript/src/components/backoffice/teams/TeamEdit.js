import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { Link, useNavigate } from 'react-router-dom';

import { I18nContext, updateTeamPromise } from '../../../core';
import * as Services from '../../../services';

import { AvatarChooser, Spinner } from '../../utils';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

export function TeamEditForm(props) {
  const { translateMethod } = useContext(I18nContext);

  const flow = ['name', 'description', 'contact', 'avatar', 'avatarFrom', 'apiKeyVisibility'];

  const schema = {
    _id: {
      type: 'string',
      props: { label: translateMethod('Id'), disabled: true },
    },
    _tenant: {
      type: 'select',
      props: {
        label: translateMethod('Tenant'),
        valuesFrom: '/api/tenants',
        transformer: (tenant) => ({ label: tenant.name, value: tenant._id }),
      },
    },
    type: {
      type: 'select',
      props: {
        label: translateMethod('Type'),
        possibleValues: [
          { label: translateMethod('Personal'), value: 'Personal' },
          {
            label: translateMethod('Organization'),
            value: 'Organization',
          },
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
        team: () => props.team,
      },
    },
    apiKeyVisibility: {
      type: 'select',
      props: {
        label: translateMethod('apikey visibility'),
        possibleValues: [
          { label: translateMethod('Administrator'), value: 'Administrator' },
          { label: translateMethod('ApiEditor'), value: 'ApiEditor' },
          { label: translateMethod('User'), value: 'User' },
        ],
      },
    },
  };

  if (!props.team) {
    return null;
  }

  useEffect(() => {
    document.title = `${props.team.name} - ${translateMethod('Edition')}`
  }, [])

  return (
    <>
      <div className="row d-flex justify-content-start align-items-center mb-2">
        {props.team && (
          <div className="d-flex ml-1 avatar__container">
            <img className="img-fluid" src={props.team.avatar} alt="avatar" />
          </div>
        )}
        <h1 className="h1-rwd-reduce ml-2">{props.team.name}</h1>
      </div>
      <div className="row">
        <React.Suspense fallback={<Spinner />}>
          <LazyForm
            flow={flow}
            schema={schema}
            value={props.team}
            onChange={(team) => props.updateTeam(team)}
          />
        </React.Suspense>
      </div>
    </>
  );
}

const TeamEditComponent = ({ currentTeam }) => {
  const [team, setTeam] = useState(currentTeam);
  const navigate = useNavigate()

  const { translateMethod, Translation } = useContext(I18nContext);

  const members = () => {
    navigate(`/${team._humanReadableId}/settings/members`);
  };

  const save = () => {
    Services.updateTeam(team).then((updatedTeam) => {
      if (team._humanReadableId !== updatedTeam._humanReadableId) {
        navigate(`/${updatedTeam._humanReadableId}/settings/edition`);
      }
      toastr.success(
        translateMethod(
          'team.updated.success',
          false,
          `team ${team.name} successfully updated`,
          team.name
        )
      );
    });
  };

  return (
    <>
      <TeamEditForm team={team} updateTeam={setTeam} />
      <div className="row form-back-fixedBtns">
        <Link className="btn btn-outline-primary" to={`/${currentTeam._humanReadableId}/settings`}>
          <i className="fas fa-chevron-left mr-1" />
          <Translation i18nkey="Back">Back</Translation>
        </Link>
        {team && team.type !== "Personal" && <button
          style={{ marginLeft: 5 }}
          type="button"
          className="btn btn-outline-primary"
          onClick={members}>
          <span>
            <i className="fas fa-users mr-1" />
            <Translation i18nkey="Members">Members</Translation>
          </span>
        </button>}
        <button
          style={{ marginLeft: 5 }}
          type="button"
          className="btn btn-outline-success"
          onClick={save}>
          <span>
            <i className="fas fa-save mr-1" />
            <Translation i18nkey="Save">Save</Translation>
          </span>
        </button>
      </div>
    </>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateTeam: (team) => updateTeamPromise(team),
};

export const TeamEdit = connect(mapStateToProps, mapDispatchToProps)(TeamEditComponent);
