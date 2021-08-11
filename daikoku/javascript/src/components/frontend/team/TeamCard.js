import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Can, read, team as TEAM } from '../../utils';
import { Translation } from '../../../locales';

export class TeamCard extends Component {
  //todo: rename some "api"class to  "team"class
  render() {
    const { team } = this.props;
    return (
      <div className="row border-bottom py-4">
        <div className="team__avatar col-2">
          <img
            className="img-fluid"
            src={this.props.team.avatar ? this.props.team.avatar : '/assets/images/daikoku.svg'}
            alt="avatar"
          />
        </div>
        <div className="col-10">
          <div className="row">
            <div className="col-12 d-flex justify-content-between">
              <div onClick={this.props.redirectToTeamPage}>
                <h3 className="cursor-pointer underline-on-hover">
                  {this.props.team.name}
                  <Can I={read} a={TEAM} team={this.props.team}>
                    <a
                      href="#"
                      className="ml-3 team__settings"
                      onClick={this.props.redirectToTeamSettings}>
                      <i className="fas fa-cogs fa-xxs" />
                    </a>
                  </Can>
                </h3>
                <Translation
                 
                  i18nkey={`${team._id}.description`}
                  extraConf={team.translation}>
                  {team.description}
                </Translation>
              </div>
              <div className="ml-2">
                <div className="btn_group">
                  {team.canJoin && !team.alreadyJoin && (
                    <button
                      className="btn btn-sm btn-access-negative mr-2"
                      onClick={this.props.askToJoin}>
                      <Translation i18nkey="Join">
                        Join
                      </Translation>
                    </button>
                  )}
                  {team.canJoin && team.alreadyJoin && (
                    <button className="btn btn-sm btn-access-negative mr-2">
                      <Translation i18nkey="Pending request">
                        Pending request
                      </Translation>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

TeamCard.propTypes = {
  user: PropTypes.object,
  team: PropTypes.object.isRequired,
  currentLanguage: PropTypes.string,
  askToJoin: PropTypes.func,
  redirectToTeamPage: PropTypes.func,
  redirectToTeamSettings: PropTypes.func,
};
