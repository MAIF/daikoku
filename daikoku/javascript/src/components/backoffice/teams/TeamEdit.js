import React, { Component } from 'react';
import { connect } from 'react-redux';

import { updateTeamPromise } from '../../../core/context';
import * as Services from '../../../services';

import { TeamBackOffice } from '..';
import { AvatarChooser, Spinner } from '../../utils';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

export class TeamEditComponent extends Component {
  state = {
    team: null,
    tab: 'infos',
  };

  flow =
    window.location.pathname.indexOf('/edition') === -1
      ? ['_id', '_tenant', 'name', 'description', 'contact', 'avatar', 'avatarFrom', 'metadata']
      : ['_id', 'name', 'description', 'contact', 'avatar', 'avatarFrom', 'metadata'];

  schema = {
    _id: {
      type: 'string',
      props: { label: 'Id', disabled: true },
    },
    _tenant: {
      type: 'select',
      props: {
        label: 'Tenant',
        valuesFrom: '/api/tenants',
        transformer: tenant => ({ label: tenant.name, value: tenant._id }),
      },
    },
    type: {
      type: 'select',
      props: {
        label: 'Type',
        possibleValues: [
          { label: 'Personal', value: 'Personal' },
          { label: 'Organization', value: 'Organization' },
        ],
      },
    },
    name: {
      type: 'string',
      props: { label: 'Name' },
    },
    description: {
      type: 'string',
      props: { label: 'Description' },
    },
    contact: {
      type: 'string',
      props: { label: 'Team contact' },
    },
    avatar: {
      type: 'string',
      props: { label: 'Team avatar' },
    },
    avatarFrom: {
      type: AvatarChooser,
      props: {
        team: () => this.state.team,
        currentLanguage: this.props.currentLanguage,
      },
    },
    metadata: {
      type: 'object',
      visible: () => window.location.pathname.indexOf('/edition') === -1,
      props: {
        label: 'Metadata',
      },
    },
  };

  componentDidMount() {
    this.setState({ team: { ...this.props.currentTeam } });
  }

  save = () => {
    if (this.props.location && this.props.location.state && this.props.location.state.newTeam) {
      Services.createTeam(this.state.team).then(team => {
        this.setState({ team });
        window.location.reload();
      });
    } else {
      Services.updateTeam(this.state.team).then(team => {
        this.setState({ team }, () => this.props.updateTeam(team));
      });
    }
  };

  members = () => {
    this.props.history.push(`/${this.state.team._humanReadableId}/settings/members`);
  };

  render() {
    if (!this.state.team) {
      return null;
    }

    return (
      <TeamBackOffice>
        <div className="row d-flex justify-content-start align-items-center">
          {this.state.team && (
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
              }}>
              <img
                src={this.state.team.avatar}
                style={{ width: 200, borderRadius: '50%', backgroundColor: 'white' }}
                alt="avatar"
              />
            </div>
          )}
          <h1 className="h1-rwd-reduce ml-2">Team - {this.state.team.name}</h1>
        </div>
        <div className="row">
          <React.Suspense fallback={<Spinner />}>
            <LazyForm
              flow={this.flow}
              schema={this.schema}
              value={this.state.team}
              onChange={team => this.setState({ team })}
              style={{ marginBottom: 100 }}
            />
          </React.Suspense>
        </div>
        <div className="row form-back-fixedBtns">
          <a
            className="btn btn-outline-primary"
            href="#"
            onClick={() => this.props.history.goBack()}>
            <i className="fas fa-chevron-left" /> Back
          </a>
          <button
            style={{ marginLeft: 5 }}
            type="button"
            className="btn btn-outline-primary"
            disabled={this.state.create}
            onClick={this.members}>
            <span>
              <i className="fas fa-users" /> Members
            </span>
          </button>
          <button
            style={{ marginLeft: 5 }}
            type="button"
            className="btn btn-outline-success"
            onClick={this.save}>
            {!this.state.create && (
              <span>
                <i className="fas fa-save" /> Save
              </span>
            )}
            {this.state.create && (
              <span>
                <i className="fas fa-save" /> Create
              </span>
            )}
          </button>
        </div>
      </TeamBackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateTeam: team => updateTeamPromise(team),
};

export const TeamEdit = connect(mapStateToProps, mapDispatchToProps)(TeamEditComponent);
