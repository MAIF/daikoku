import React, { Component } from 'react';
import moment from 'moment';

import { t, Translation } from '../../../locales';

export class SimpleNotification extends Component {
  typeFormatter = (type) => {
    switch (type) {
      case 'ApiAccess':
        return (
          <i
            className="fas fa-key"
            style={{ marginRight: 5 }}
            title={t('Ask access to API', this.props.currentLanguage)}
          />
        );
      case 'TeamAccess':
        return (
          <i
            className="fas fa-users"
            style={{ marginRight: 5 }}
            title={t('Ask to join a team', this.props.currentLanguage)}
          />
        );
      case 'ApiSubscription':
        return (
          <i
            className="fas fa-file-signature"
            style={{ marginRight: 5 }}
            title={t('Subscription to an API', this.props.currentLanguage)}
          />
        );
      case 'OtoroshiSyncSubscriptionError':
        return (
          <i
            className="fas fa-pastafarianism"
            style={{ marginRight: 5 }}
            title={t('Otoroshi sync error', this.props.currentLanguage)}
          />
        );
      case 'OtoroshiSyncApiError':
        return (
          <i
            className="fas fa-pastafarianism"
            style={{ marginRight: 5 }}
            title={t('Otoroshi sync error', this.props.currentLanguage)}
          />
        );
      case 'ApiKeyDeletionInformation':
        return (
          <i
            className="fas fa-trash"
            style={{ marginRight: 5 }}
            title={t('ApiKey deletion information', this.props.currentLanguage)}
          />
        );
      case 'ApiKeyRotationInProgress':
        return (
          <i
            className="fas fa-sync-alt"
            style={{ marginRight: 5 }}
            title={t('ApiKey rotation in progress', this.props.currentLanguage)}
          />
        );
      case 'ApiKeyRotationEnded':
        return (
          <i
            className="fas fa-sync-alt"
            style={{ marginRight: 5 }}
            title={t('ApiKey rotation ended', this.props.currentLanguage)}
          />
        );
      case 'TeamInvitation':
        return (
          <i
            className="fas fa-envelope-alt"
            style={{ marginRight: 5 }}
            title={t('Team invitation', this.props.currentLanguage)}
          />
        );
    }
  };

  actionFormatter({ status, date }, notificationType) {
    switch (status) {
      case 'Pending':
        return (
          <div>
            <a
              className="btn btn-outline-success btn-sm mr-1"
              href="#"
              title={t('Accept')}
              onClick={() => this.props.accept()}>
              <i className="fas fa-check" />
            </a>
            {notificationType === 'AcceptOrReject' && (
              <a
                className="btn btn-outline-danger btn-sm"
                href="#"
                title={t('Reject')}
                onClick={() => this.props.reject()}>
                <i className="fas fa-times" />
              </a>
            )}
          </div>
        );
      case 'Accepted':
        return (
          <a
            className="btn disabled"
            title={moment(date).format(
              t('moment.date.format', this.props.currentLanguage, 'DD MMM. YYYY à HH:mm z')
            )}
            disabled>
            <i className="fas fa-check" />
          </a>
        );
      case 'Rejected':
        return (
          <a
            className="btn disabled"
            title={moment(date).format(
              t('moment.date.format', this.props.currentLanguage, 'DD MMM. YYYY à HH:mm z')
            )}
            disabled>
            <i className="fas fa-times" />
          </a>
        );
    }
  }

  fromFormatter(action, sender) {
    switch (action.type) {
      case 'ApiAccess':
        return `${sender.name}/${this.props.getTeam(action.team).name}`;
      case 'TeamAccess':
        return sender.name;
      case 'TeamInvitation':
        return this.props.getTeam(action.team).name;
      case 'ApiSubscription':
        return `${sender.name}/${this.props.getTeam(action.team).name}`;
      case 'OtoroshiSyncSubscriptionError':
        return 'Otoroshi verifier job';
      case 'OtoroshiSyncApiError':
        return 'Otoroshi verifier job';
      case 'ApiKeyDeletionInformation':
        return `${sender.name}`;
      case 'ApiKeyRotationInProgress':
        return 'Otoroshi verifier job';
      case 'ApiKeyRotationEnded':
        return 'Otoroshi verifier job';
    }
  }

  render() {
    const { notification, getApi } = this.props;
    let infos = {};
    if (['ApiAccess', 'ApiSubscription'].includes(notification.action.type)) {
      const api = getApi(notification.action.api);
      const plan = api.possibleUsagePlans.find((p) => p._id === notification.action.plan);

      infos = { api, plan };
    }

    let style = {};
    if (this.props.fade) {
      style = { opacity: 0.3 };
    }
    return (
      <div style={style}>
        <div className="alert section" role="alert">
          <div className="d-flex flex-column">
            <div className="d-flex align-items-center">
              {this.typeFormatter(notification.action.type)}
              <h5 className="alert-heading mb-0">
                {notification.action.type === 'ApiAccess' && (
                  <div>
                    <Translation
                      i18nkey="notif.api.access"
                      language={this.props.currentLanguage}
                      replacements={[infos.api.name]}>
                      Request access to {infos.api.name}
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'TeamAccess' && (
                  <div>
                    <Translation
                      i18nkey="notif.membership.team"
                      language={this.props.currentLanguage}>
                      membership request to your team
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'ApiSubscription' && (
                  <div>
                    <Translation
                      i18nkey="notif.api.subscription"
                      language={this.props.currentLanguage}
                      replacements={[infos.api.name, infos.api.plan]}>
                      Request subscription to {infos.api.name} for plan {infos.plan.type}
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'ApiKeyDeletionInformation' && (
                  <div>
                    <Translation
                      i18nkey="notif.apikey.deletion"
                      language={this.props.currentLanguage}
                      replacements={[notification.action.clientId, notification.action.api]}>
                      Your apiKey with clientId {notification.action.clientId} for api{' '}
                      {notification.action.api} has been deleted
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'OtoroshiSyncSubscriptionError' && (
                  <div>{notification.action.message}</div>
                )}
                {notification.action.type === 'OtoroshiSyncApiError' && (
                  <div>{notification.action.message}</div>
                )}
                {notification.action.type === 'ApiKeyRotationInProgress' && (
                  <div>
                    <Translation
                      i18nkey="notif.apikey.rotation.inprogress"
                      language={this.props.currentLanguage}
                      replacements={[
                        notification.action.clientId,
                        notification.action.api,
                        notification.action.plan,
                      ]}>
                      Your apiKey with clientId {notification.action.clientId} (
                      {notification.action.api}/{notification.action.plan}) has started its
                      rotation. Its clientSecret hab been updated.
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'ApiKeyRotationEnded' && (
                  <div>
                    <Translation
                      i18nkey="notif.apikey.rotation.ended"
                      language={this.props.currentLanguage}
                      replacements={[
                        notification.action.clientId,
                        notification.action.api,
                        notification.action.plan,
                      ]}>
                      Your apiKey with clientId {notification.action.clientId} (
                      {notification.action.api}/{notification.action.plan}) has ended its rotation.
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'TeamInvitation' && (
                  <div>
                    <Translation
                      i18nkey="team.invitation"
                      language={this.props.currentLanguage}
                      replacements={[
                        notification.sender.name,
                        this.props.getTeam(notification.action.team).name,
                      ]}>
                      {notification.sender.name}, as admin of{' '}
                      {this.props.getTeam(notification.action.team).name}, invit you in his team.
                    </Translation>
                  </div>
                )}
              </h5>
            </div>
            <div className="d-flex mt-1 justify-content-end">
              {this.actionFormatter(notification.status, notification.notificationType)}
            </div>
          </div>
          <hr />
          <div className="d-flex justify-content-between" style={{ fontSize: 12 }}>
            <div className="">{this.fromFormatter(notification.action, notification.sender)}</div>
            <div className="">{moment(notification.date).toNow(true)}</div>
          </div>
        </div>
      </div>
    );
  }
}
