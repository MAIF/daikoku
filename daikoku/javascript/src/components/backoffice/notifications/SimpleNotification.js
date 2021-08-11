import React, { Component } from 'react';
import moment from 'moment';

import { t, Translation } from '../../../locales';
import { formatPlanType, Option } from '../../utils';

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
      case 'ApiKeyRefresh':
        return (
          <i
            className="fas fa-sync-alt"
            style={{ marginRight: 5 }}
            title={t('Apikey refresh', this.props.currentLanguage)}
          />
        );
      case 'NewPostPublished':
        return (
          <i
            className="fas fa-newspaper-alt"
            style={{ marginRight: 5 }}
            title={t('New Published Post', this.props.currentLanguage)}
          />
        );
      case 'NewIssueOpen':
        return (
          <i
            className="fas fa-exclamation-circle"
            style={{ marginRight: 5 }}
            title={t('New issues open', this.props.currentLanguage)}
          />
        );
      case 'NewCommentOnIssue':
        return (
          <i
            className="fas fa-comment-circle"
            style={{ marginRight: 5 }}
            title={t('New comment on issue', this.props.currentLanguage)}
          />
        );
    }
  };

  actionFormatter(notification) {
    const { status, date } = notification.status;
    const { notificationType } = notification;

    if (
      status === 'Pending' &&
      (notification.action.type === 'NewIssueOpen' ||
        notification.action.type === 'NewCommentOnIssue')
    ) {
      return (
        <div>
          <button
            type="button"
            className="btn btn-outline-success btn-sm mr-1"
            onClick={() => this.props.accept()}>
            <i className="fas fa-check" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-success"
            onClick={() => {
              this.props.accept();
              this.props.history.push(notification.action.linkTo);
            }}>
            <i className="fas fa-eye" />
          </button>
        </div>
      );
    } else {
      switch (status) {
        case 'Pending':
          switch (this.props.notification.action.type) {
            case 'ApiSubscription':
              return (
                <div>
                  <a
                    className="btn btn-outline-success btn-sm mr-1"
                    href="#"
                    title={t('Accept')}
                    onClick={() =>
                      this.props.openSubMetadataModal({
                        save: this.props.accept,
                        api: this.props.notification.action.api,
                        plan: this.props.notification.action.plan,
                        team: this.props.getTeam(this.props.notification.action.team),
                        notification: this.props.notification,
                        creationMode: true,
                        currentLanguage: this.props.currentLanguage,
                      })
                    }>
                    <i className="fas fa-check" />
                  </a>
                  <a
                    className="btn btn-outline-danger btn-sm"
                    href="#"
                    title={t('Reject')}
                    onClick={() => this.props.reject()}>
                    <i className="fas fa-times" />
                  </a>
                </div>
              );
            default:
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
          }
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
  }

  fromFormatter(action, sender) {
    switch (action.type) {
      case 'ApiAccess':
        return `${sender.name}/${this.props.getTeam(action.team).name}`;
      case 'TeamAccess':
      case 'NewPostPublished':
      case 'NewIssueOpen':
      case 'NewCommentOnIssue':
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
      case 'ApiKeyRefresh':
        return `${sender.name}`;
    }
  }

  render() {
    const { notification, getApi } = this.props;
    let infos = {};
    if (['ApiAccess', 'ApiSubscription'].includes(notification.action.type)) {
      const api = getApi(notification.action.api);
      const plan = !api
        ? { customName: t('deleted', this.props.currentLanguage) }
        : api.possibleUsagePlans.find((p) => p._id === notification.action.plan);
      infos = { api: api || { name: t('Deleted API', this.props.currentLanguage) }, plan };
    }

    let style = {};
    if (this.props.fade) {
      style = { opacity: 0.3 };
    }

    moment.locale(this.props.currentLanguage);

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
                     
                      replacements={[infos.api.name]}>
                      Request access to {infos.api.name}
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'TeamAccess' && (
                  <div>
                    <Translation
                      i18nkey="notif.membership.team"
                     >
                      membership request to your team
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'ApiSubscription' && (
                  <div>
                    <Translation
                      i18nkey="notif.api.subscription"
                     
                      replacements={[
                        infos.api.name,
                        Option(infos.plan.customName).getOrElse(formatPlanType(infos.plan)),
                      ]}>
                      Request subscription to {infos.api.name} for plan {infos.plan.type}
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'ApiKeyDeletionInformation' && (
                  <div>
                    <Translation
                      i18nkey="notif.apikey.deletion"
                     
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
                {notification.action.type === 'ApiKeyRefresh' && (
                  <div>
                    <Translation
                      i18nkey="notif.apikey.refresh"
                     
                      replacements={[
                        notification.action.subscription,
                        notification.action.api,
                        notification.action.plan,
                      ]}>
                      Your subscription {notification.action.subscription} (
                      {notification.action.api}/{notification.action.plan}) has been refreshed.
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'TeamInvitation' && (
                  <div>
                    <Translation
                      i18nkey="team.invitation"
                     
                      replacements={[
                        notification.sender.name,
                        this.props.getTeam(notification.action.team).name,
                      ]}>
                      {notification.sender.name}, as admin of{' '}
                      {this.props.getTeam(notification.action.team).name}, invit you in his team.
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'NewPostPublished' && (
                  <div>
                    <Translation
                      i18nkey="team.invitation"
                     
                      replacements={[
                        notification.sender.name,
                        this.props.getTeam(notification.action.teamId).name,
                      ]}>
                      {notification.sender.name}, as admin of{' '}
                      {this.props.getTeam(notification.action.teamId).name}, has published a new
                      post on {notification.action.apiName}.
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'NewIssueOpen' && (
                  <div>
                    <Translation
                      i18nkey="issues.notification"
                     
                      replacements={[notification.action.apiName]}>
                      {notification.sender.name} has published a new issue on{' '}
                      {notification.action.apiName}.
                    </Translation>
                  </div>
                )}
                {notification.action.type === 'NewCommentOnIssue' && (
                  <div>
                    <Translation
                      i18nkey="issues.comment.notification"
                     
                      replacements={[notification.action.apiName]}>
                      {notification.sender.name} has published a new comment on issue of{' '}
                      {notification.action.apiName}.
                    </Translation>
                  </div>
                )}
              </h5>
            </div>
            <div className="d-flex mt-1 justify-content-end">
              {this.actionFormatter(notification)}
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
