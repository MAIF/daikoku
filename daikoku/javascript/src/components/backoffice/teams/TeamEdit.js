import React, { Component, useState } from 'react';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import { updateTeamPromise } from '../../../core/context';
import * as Services from '../../../services';
import { t, Translation } from '../../../locales';

import { TeamBackOffice } from '..';
import { AvatarChooser, Spinner } from '../../utils';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

export class TeamEditForm extends Component {
  flow = ['name', 'description', 'contact', 'avatar', 'avatarFrom'];

  schema = {
    _id: {
      type: 'string',
      props: { label: t('Id', this.props.currentLanguage), disabled: true },
    },
    _tenant: {
      type: 'select',
      props: {
        label: t('Tenant', this.props.currentLanguage),
        valuesFrom: '/api/tenants',
        transformer: tenant => ({ label: tenant.name, value: tenant._id }),
      },
    },
    type: {
      type: 'select',
      props: {
        label: t('Type', this.props.currentLanguage),
        possibleValues: [
          { label: t('Personal', this.props.currentLanguage), value: 'Personal' },
          {
            label: t('Organization', this.props.currentLanguage),
            value: 'Organization',
          },
        ],
      },
    },
    name: {
      type: 'string',
      props: { label: t('Name', this.props.currentLanguage) },
    },
    description: {
      type: 'string',
      props: { label: t('Description', this.props.currentLanguage) },
    },
    contact: {
      type: 'string',
      props: { label: t('Team contact', this.props.currentLanguage) },
    },
    avatar: {
      type: 'string',
      props: { label: t('Team avatar', this.props.currentLanguage) },
    },
    avatarFrom: {
      type: AvatarChooser,
      props: {
        team: () => this.props.team,
        currentLanguage: this.props.currentLanguage,
      },
    }
  };

  render() {
    if (!this.props.team) {
      return null;
    }

    return (
      <>
        <div className="row d-flex justify-content-start align-items-center">
          {this.props.team && (
            <div
              style={{
                width: '100px',
                height: '100px',
                borderRadius: '50px',
                border: '3px solid #fff',
                boxShadow: '0px 0px 0px 3px lightgrey',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                overflow: 'hidden',
              }}>
              <img
                style={{ width: '100%', height: 'auto' }}
                src={this.props.team.avatar}
                alt="avatar"
              />
            </div>
          )}
          <h1 className="h1-rwd-reduce ml-2">
            {this.props.team.name}
          </h1>
        </div>
        <div className="row">
          <React.Suspense fallback={<Spinner />}>
            <LazyForm
              flow={this.flow}
              schema={this.schema}
              value={this.props.team}
              onChange={team => this.props.updateTeam(team)}
            />
          </React.Suspense>
        </div>
      </>
    );
  }
}





const TeamEditComponent = ({ currentLanguage, history, currentTeam }) => {
  const [team, setTeam] = useState(currentTeam)


  const members = () => {
    history.push(`/${team._humanReadableId}/settings/members`);
  };

  const save = () => {
    Services.updateTeam(team)
      .then(() => toastr.success(
        t(
          'team.updated.success',
          currentLanguage,
          false,
          `team ${team.name} successfully updated`,
          team.name
        )
      ));
  };

  return (
    <TeamBackOffice>
      <TeamEditForm team={team} updateTeam={setTeam} currentLanguage={currentLanguage} />
      <div className="row form-back-fixedBtns">
        <a
          className="btn btn-outline-primary"
          href="#"
          onClick={() => history.goBack()}>
          <i className="fas fa-chevron-left mr-1" />
          <Translation i18nkey="Back" language={currentLanguage}>
            Back
            </Translation>
        </a>
        <button
          style={{ marginLeft: 5 }}
          type="button"
          className="btn btn-outline-primary"
          onClick={members}>
          <span>
            <i className="fas fa-users mr-1" />
            <Translation i18nkey="Members" language={currentLanguage}>
              Members
              </Translation>
          </span>
        </button>
        <button
          style={{ marginLeft: 5 }}
          type="button"
          className="btn btn-outline-success"
          onClick={save}>
          <span>
            <i className="fas fa-save mr-1" />
            <Translation i18nkey="Save" language={currentLanguage}>
              Save
            </Translation>
          </span>
        </button>
      </div>
    </TeamBackOffice>
  )
}

const mapStateToProps = state => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateTeam: team => updateTeamPromise(team),
};

export const TeamEdit = connect(mapStateToProps, mapDispatchToProps)(TeamEditComponent);
