import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import { Can, read, team as TEAM } from '../../utils';
import { I18nContext } from '../../../core';

export function TeamCard(props) {
  const { Translation } = useContext(I18nContext);

  const { team } = props;
  return (
    <div className="row border-bottom py-4">
      <div className="team__avatar col-2">
        <img
          className="img-fluid"
          src={props.team.avatar ? props.team.avatar : '/assets/images/daikoku.svg'}
          alt="avatar"
        />
      </div>
      <div className="col-10">
        <div className="row">
          <div className="col-12 d-flex justify-content-between">
            <div onClick={props.redirectToTeamPage}>
              <h3 className="cursor-pointer underline-on-hover">
                {props.team.name}
                <Can I={read} a={TEAM} team={props.team}>
                  <a
                    href="#"
                    className="ms-3 team__settings"
                    onClick={props.redirectToTeamSettings}>
                    <i className="fas fa-cogs fa-xxs" />
                  </a>
                </Can>
              </h3>
              <Translation i18nkey={`${team._id}.description`} extraConf={team.translation}>
                {team.description}
              </Translation>
            </div>
            <div className="ms-2">
              <div className="btn_group">
                {team.canJoin && !team.alreadyJoin && (
                  <button className="btn btn-sm btn-access-negative me-2" onClick={props.askToJoin}>
                    <Translation i18nkey="Join">Join</Translation>
                  </button>
                )}
                {team.canJoin && team.alreadyJoin && (
                  <button className="btn btn-sm btn-access-negative me-2">
                    <Translation i18nkey="Pending request">Pending request</Translation>
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

TeamCard.propTypes = {
  user: PropTypes.object,
  team: PropTypes.object.isRequired,
  askToJoin: PropTypes.func,
  redirectToTeamPage: PropTypes.func,
  redirectToTeamSettings: PropTypes.func,
};
