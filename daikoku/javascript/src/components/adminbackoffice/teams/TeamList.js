import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as Services from '../../../services';
import _ from 'lodash';

import { UserBackOffice } from '../../backoffice';
import { PaginatedComponent, AvatarWithAction, Can, manage, daikoku } from '../../utils';
import { t, Translation } from '../../../locales';

class TeamListComponent extends Component {
  state = {
    teams: [],
  };

  createNewTeam = () => {
    Services.fetchNewTeam().then(newTeam => {
      this.props.history.push(`/settings/teams/${newTeam._id}`, { newTeam });
    });
  };

  componentDidMount() {
    this.updateTeams();
  }

  deleteTeam = teamId => {
    window
      .confirm(
        t('delete team', this.props.currentTeam, 'Are you sure you want to delete this team ?')
      )
      .then(ok => {
        if (ok) {
          Services.deleteTeam(teamId).then(() => {
            this.updateTeams();
          });
        }
      });
  };

  updateTeams = () => {
    Services.teams().then(teams => this.setState({ teams }));
  };

  render() {
    const filteredTeams = this.state.search
      ? this.state.teams.filter(({ name }) => name.toLowerCase().includes(this.state.search))
      : this.state.teams;

    const actions = team => {
      const basicActions = [
        {
          action: () => this.deleteTeam(team._id),
          iconClass: 'fas fa-trash delete-icon',
          tooltip: t('Delete team', this.props.currentLanguage),
        },
        {
          redirect: () => this.props.history.push(`/settings/teams/${team._humanReadableId}`),
          iconClass: 'fas fa-pen',
          tooltip: t('Edit team', this.props.currentLanguage),
        },
      ];

      if (team.type === 'Personal') {
        return basicActions;
      }

      return [...basicActions, {
        redirect: () => this.props.history.push(`/settings/teams/${team._humanReadableId}/members`),
        iconClass: 'fas fa-users',
        tooltip: t('Team members', this.props.currentLanguage),
      }];
    };

    return (
      <UserBackOffice tab="Teams">
        <Can I={manage} a={daikoku} dispatchError>
          <div className="row">
            <div className="col">
              <div className="d-flex justify-content-between align-items-center">
                <h1>
                  <Translation i18nkey="Teams" language={this.props.currentLanguage}>
                    Teams
                  </Translation>
                  <a
                    className="btn btn-sm btn-access-negative mb-1 ml-1"
                    title={t('Create a new team', this.props.currentLanguage)}
                    href="#"
                    onClick={e => {
                      e.preventDefault();
                      this.createNewTeam();
                    }}>
                    <i className="fas fa-plus-circle" />
                  </a>
                </h1>
                <input
                  placeholder={t('Find a team', this.props.currentLanguage)}
                  className="form-control col-5"
                  onChange={e => {
                    this.setState({ search: e.target.value });
                  }}
                />
              </div>
              <PaginatedComponent
                items={_.sortBy(filteredTeams, [team => team.name.toLowerCase()])}
                count={15}
                formatter={team => {
                  return (
                    <AvatarWithAction
                      key={team._id}
                      avatar={team.avatar}
                      infos={
                        <>
                          <span className="team__name text-truncate">{team.name}</span>
                        </>
                      }
                      actions={actions(team)}
                    />
                  );
                }}
                currentLanguage={this.props.currentLanguage}
              />
            </div>
          </div>
        </Can>
      </UserBackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const TeamList = connect(mapStateToProps)(TeamListComponent);
