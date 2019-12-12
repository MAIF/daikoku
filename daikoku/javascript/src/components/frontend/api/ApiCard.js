import React, { Component } from 'react';
import { PropTypes } from 'prop-types';

import { Can, manage, api as API } from '../../utils';
import { ActionWithTeamSelector } from '../../utils/ActionWithTeamSelector';
import { Translation, t } from '../../../locales';

export class ApiCard extends Component {
  componentDidCatch(e) {
    console.log('ApiCardError', e);
  }

  authorizedOn = api => api.visibility === 'Public' || api.authorizations.some(a => a.authorized);
  allTeamsAuthorizedOn = api =>
    api.visibility === 'Public' || api.authorizations.every(a => a.authorized);
  isPending = api => api.authorizations && api.authorizations.every(a => a.pending || a.authorized);

  redirectToApiPage = auth => {
    if (auth) {
      this.props.redirectToApiPage();
    }
  };

  render() {
    const api = this.props.api;
    const team = this.props.team || { name: '--', avatar: '#', _id: api.team };
    const isAuthorized = this.authorizedOn(api);
    const allTeamsAreAuthorized = this.allTeamsAuthorizedOn(api);
    const isPending = this.isPending(api);

    return (
      <div className="row border-bottom py-4">
        <div className="col-12 d-flex justify-content-between">
          <div
            className={isAuthorized ? 'cursor-pointer underline-on-hover a-fake' : 'api--forbidden'}
            onClick={() => this.redirectToApiPage(isAuthorized)}>
            <h3>
              {this.props.showTeam ? team.name + '/' : ''}
              {api.name}
            </h3>
          </div>

          <div className="ml-2">
            <div className="btn_group">
              <Can I={manage} a={API} team={team}>
                <button
                  type="button"
                  className="btn btn-sm btn-access-negative"
                  onClick={this.props.redirectToEditPage}>
                  <i className="fas fa-edit" />
                </button>
              </Can>
              {!allTeamsAreAuthorized && !isPending && api.visibility !== 'Private' && (
                <ActionWithTeamSelector
                  title="Api access"
                  description={t(
                    'api.access.request',
                    this.props.currentLanguage,
                    false,
                    `You will send an access request to the API "${api.name}". For which team do you want to send the request ?`,
                    [api.name]
                  )}
                  buttonLabel="Send"
                  pendingTeams={api.authorizations
                    .filter(auth => auth.pending)
                    .map(auth => auth.team)}
                  authorizedTeams={api.authorizations
                    .filter(auth => auth.authorized)
                    .map(auth => auth.team)}
                  teams={this.props.myTeams}
                  action={teams => this.props.askForApiAccess(teams)}
                  withAllTeamSelector={true}>
                  <button className="btn btn-sm btn-access-negative ml-1 mr-2">
                    <Translation i18nkey="Access" language={this.props.currentLanguage}>
                      Access
                    </Translation>
                  </button>
                </ActionWithTeamSelector>
              )}
              {isPending && (
                <button className="btn btn-sm btn-access-negative mr-2">
                  <Translation i18nkey="Pending request" language={this.props.currentLanguage}>
                    Pending request
                  </Translation>
                </button>
              )}
            </div>
          </div>
          {api.visibility === 'Private' && (
            <div className="api__visibility api__visibility--private" />
          )}
        </div>
        <div className="col-12">
          <Translation
            language={this.props.currentLanguage}
            i18nkey={`${api._humanReadableId}.description`}
            extraConf={api.translation}>
            {api.smallDescription}
          </Translation>
        </div>
        <div className="col-12 d-flex mt-3">
          {!!api.tags.length && (
            <div className="d-flex">
              <i className="fas fa-tag mr-2" />
              {api.tags.map(tag => (
                <span
                  className="badge badge-warning mr-1 cursor-pointer"
                  key={tag}
                  onClick={() => this.props.handleTagSelect(tag)}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="col-12 d-flex mt-1">
          {!!api.categories.length && (
            <div className="d-flex">
              <i className="fas fa-folder mr-2" />
              {api.categories.map(category => (
                <small
                  className="badge badge-warning mr-1 cursor-pointer"
                  key={category}
                  onClick={() => this.props.handleCategorySelect(category)}>
                  {category}
                </small>
              ))}
            </div>
          )}
        </div>
        <div className="col-12 d-flex mt-2">
          {this.props.teamVisible && (
            <small
              className="cursor-pointer underline-on-hover a-fake d-flex align-items-baseline"
              onClick={() => this.props.redirectToTeamPage(team)}>
              <img alt="avatar" src={team.avatar} style={{ marginRight: 5, width: 20 }} />
              {team.name}
            </small>
          )}
        </div>
      </div>
    );
  }
}

ApiCard.propTypes = {
  user: PropTypes.object,
  api: PropTypes.object.isRequired,
  teamVisible: PropTypes.bool,
  team: PropTypes.object,
  myTeams: PropTypes.array.isRequired,

  askForApiAccess: PropTypes.func.isRequired,
  redirectToTeamPage: PropTypes.func.isRequired,
  redirectToApiPage: PropTypes.func.isRequired,
  redirectToEditPage: PropTypes.func.isRequired,
  handleTagSelect: PropTypes.func,
  handleCategorySelect: PropTypes.func,
};
