import React, { Component } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import { Translation } from '../../../locales';

export class OrgaCard extends Component {
  redirectToOrga = () => {
    const { orga } = this.props;
    window.location = `/api/tenants/${orga._id}/_redirect`;
  };

  render() {
    const { orga } = this.props;
    return (
      <div className="row border-bottom py-4">
        <div className="team__avatar col-2">
          <img
            className="img-fluid"
            src={orga.style.logo ? orga.style.logo : '/assets/images/daikoku.svg'}
            alt="avatar"
          />
        </div>
        <div className="col-10">
          <div className="row">
            <div className="col-12 d-flex justify-content-between">
              <div
                className={classNames('cursor-pointer', {
                  'api--forbidden': orga.status === 'CAN_JOIN',
                })}
                onClick={this.redirectToOrga}>
                <h3>
                  {orga.title}
                  {this.props.user.isDaikokuAdmin && (
                    <a href={`/settings/tenants/${orga._id}`} className="ml-3 team__settings">
                      <i className="fas fa-cogs fa-xxs" />
                    </a>
                  )}
                </h3>
              </div>
              <div className="ml-2">
                <div className="btn_group">
                  {orga.status === 'CAN_JOIN' && (
                    <button
                      className="btn btn-sm btn-access-negative mr-2"
                      onClick={this.redirectToOrga}>
                      <Translation i18nkey="Join" language={this.props.currentLanguage}>
                        Join
                      </Translation>
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="col-12">{orga.desc}</div>
          </div>
        </div>
      </div>
    );
  }
}

OrgaCard.propTypes = {
  user: PropTypes.object,
  orga: PropTypes.object.isRequired,
  currentLanguage: PropTypes.string,
};
