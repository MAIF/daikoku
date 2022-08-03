import React, { useContext } from 'react';
import moment from 'moment';
import { useNavigate } from 'react-router-dom';

import { formatPlanType, Option } from '../../utils';
import { I18nContext } from '../../../core';

export function SimpleNotification(props: any) {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, language, Translation } = useContext(I18nContext);

  const navigate = useNavigate();

  const typeFormatter = (type: any) => {
    switch (type) {
      case 'ApiAccess':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-key"
            style={{ marginRight: 5 }}
            title={translateMethod('Ask access to API')}
          />
        );
      case 'TeamAccess':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-users"
            style={{ marginRight: 5 }}
            title={translateMethod('Ask to join a team')}
          />
        );
      case 'TransferApiOwnership':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fa-solid fa-arrow-down-from-dotted-line"
            style={{ marginRight: 5 }}
            title={translateMethod('transfer.api.ownership')}
          />
        );
      case 'ApiSubscription':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-file-signature"
            style={{ marginRight: 5 }}
            title={translateMethod('Subscription to an API')}
          />
        );
      case 'OtoroshiSyncSubscriptionError':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-pastafarianism"
            style={{ marginRight: 5 }}
            title={translateMethod('Otoroshi sync error')}
          />
        );
      case 'OtoroshiSyncApiError':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-pastafarianism"
            style={{ marginRight: 5 }}
            title={translateMethod('Otoroshi sync error')}
          />
        );
      case 'ApiKeyDeletionInformation':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-trash"
            style={{ marginRight: 5 }}
            title={translateMethod('ApiKey deletion information')}
          />
        );
      case 'ApiKeyRotationInProgress':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-sync-alt"
            style={{ marginRight: 5 }}
            title={translateMethod('ApiKey rotation in progress')}
          />
        );
      case 'ApiKeyRotationEnded':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-sync-alt"
            style={{ marginRight: 5 }}
            title={translateMethod('ApiKey rotation ended')}
          />
        );
      case 'TeamInvitation':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-envelope-alt"
            style={{ marginRight: 5 }}
            title={translateMethod('Team invitation')}
          />
        );
      case 'ApiKeyRefresh':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-sync-alt"
            style={{ marginRight: 5 }}
            title={translateMethod('Apikey refresh')}
          />
        );
      case 'NewPostPublished':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-newspaper-alt"
            style={{ marginRight: 5 }}
            title={translateMethod('New Published Post')}
          />
        );
      case 'NewIssueOpen':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-exclamation-circle"
            style={{ marginRight: 5 }}
            title={translateMethod('New issues open')}
          />
        );
      case 'NewCommentOnIssue':
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <i
            className="fas fa-comment-circle"
            style={{ marginRight: 5 }}
            title={translateMethod('New comment on issue')}
          />
        );
    }
  };

  const actionFormatter = (notification: any) => {
    const { status, date } = notification.status;
    const { notificationType } = notification;

    if (
      status === 'Pending' &&
      (notification.action.type === 'NewIssueOpen' ||
        notification.action.type === 'NewCommentOnIssue')
    ) {
      return (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button
            type="button"
            className="btn btn-outline-success btn-sm me-1"
            onClick={() => props.accept()}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-check" />
          </button>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button
            type="button"
            className="btn btn-sm btn-outline-success"
            onClick={() => {
              props.accept();
              navigate(notification.action.linkTo);
            }}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-eye" />
          </button>
        </div>
      );
    } else {
      switch (status) {
        case 'Pending':
          switch (props.notification.action.type) {
            case 'ApiSubscription':
              return (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <a
                    className="btn btn-outline-success btn-sm me-1"
                    href="#"
                    title={translateMethod('Accept')}
                    onClick={() =>
                      props.openSubMetadataModal({
                        save: props.accept,
                        api: props.notification.action.api,
                        plan: props.notification.action.plan,
                        team: props.getTeam(props.notification.action.team),
                        notification: props.notification,
                        creationMode: true,
                      })
                    }
                  >
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-check" />
                  </a>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <a
                    className="btn btn-outline-danger btn-sm"
                    href="#"
                    title={translateMethod('Reject')}
                    onClick={() => props.reject()}
                  >
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-times" />
                  </a>
                </div>
              );
            default:
              return (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <a
                    className="btn btn-outline-success btn-sm me-1"
                    href="#"
                    title={translateMethod('Accept')}
                    onClick={() => props.accept()}
                  >
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-check" />
                  </a>
                  {notificationType === 'AcceptOrReject' && (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <a
                      className="btn btn-outline-danger btn-sm"
                      href="#"
                      title={translateMethod('Reject')}
                      onClick={() => props.reject()}
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="fas fa-times" />
                    </a>
                  )}
                </div>
              );
          }
        case 'Accepted':
          return (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <a
              className="btn disabled"
              title={moment(date).format(
                translateMethod('moment.date.format', 'DD MMM. YYYY à HH:mm z')
              )}
              // @ts-expect-error TS(2322): Type '{ children: Element; className: string; titl... Remove this comment to see the full error message
              disabled
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-check" />
            </a>
          );
        case 'Rejected':
          return (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <a
              className="btn disabled"
              title={moment(date).format(
                translateMethod('moment.date.format', 'DD MMM. YYYY à HH:mm z')
              )}
              // @ts-expect-error TS(2322): Type '{ children: Element; className: string; titl... Remove this comment to see the full error message
              disabled
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-times" />
            </a>
          );
      }
    }
  };

  const fromFormatter = (action: any, sender: any) => {
    switch (action.type) {
      case 'ApiAccess':
        return `${sender.name}/${Option(props.getTeam(action.team))
          .map((team: any) => team.name)
          .getOrNull()}`;
      case 'TeamAccess':
      case 'NewPostPublished':
      case 'NewIssueOpen':
      case 'NewCommentOnIssue':
        return sender.name;
      case 'TransferApiOwnership':
        return `${sender.name}`;
      case 'TeamInvitation':
        return props.getTeam(action.team).name;
      case 'ApiSubscription':
        return `${sender.name}/${Option(props.getTeam(action.team))
          .map((team: any) => team.name)
          .getOrNull()}`;
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
  };

  const { notification, getApi } = props;
  let infos = {};
  if (['ApiAccess', 'ApiSubscription', 'TransferApiOwnership'].includes(notification.action.type)) {
    const api = getApi(notification.action.api);
    const plan = !api
      ? { customName: translateMethod('deleted') }
      : api.possibleUsagePlans.find((p: any) => p._id === notification.action.plan);
    infos = { api: api || { name: translateMethod('Deleted API') }, plan };
  }

  let style = {};
  if (props.fade) {
    style = { opacity: 0.3 };
  }

  moment.locale(language);

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div style={style}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="alert section" role="alert">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex flex-column">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex align-items-center">
            {typeFormatter(notification.action.type)}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <h5 className="alert-heading mb-0">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'ApiAccess' && (<div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="notif.api.access" replacements={[(infos as any).api.name]}>
                    Request access to {(infos as any).api.name}
                  </Translation>
                </div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'TeamAccess' && (<div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="notif.membership.team">
                    membership request to your team
                  </Translation>
                </div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'TransferApiOwnership' && (<div>
                  {`request to transfer the ownership of `}
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <strong>{(infos as any).api.name}</strong>
                </div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'ApiSubscription' && (<div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="notif.api.subscription" replacements={[
            (infos as any).api.name,
            Option((infos as any).plan.customName).getOrElse(formatPlanType((infos as any).plan, translateMethod)),
        ]}>
                    Request subscription to {(infos as any).api.name} for plan {(infos as any).plan.type}
                  </Translation>
                </div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'ApiKeyDeletionInformation' && (<div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="notif.apikey.deletion" replacements={[notification.action.clientId, notification.action.api]}>
                    Your apiKey with clientId {notification.action.clientId} for api{' '}
                    {notification.action.api} has been deleted
                  </Translation>
                </div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'OtoroshiSyncSubscriptionError' && (<div>{notification.action.message}</div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'OtoroshiSyncApiError' && (<div>{notification.action.message}</div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'ApiKeyRotationInProgress' && (<div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="notif.apikey.rotation.inprogress" replacements={[
            notification.action.clientId,
            notification.action.api,
            notification.action.plan,
        ]}>
                    Your apiKey with clientId {notification.action.clientId} (
                    {notification.action.api}/{notification.action.plan}) has started its rotation.
                    Its clientSecret hab been updated.
                  </Translation>
                </div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'ApiKeyRotationEnded' && (<div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="notif.apikey.rotation.ended" replacements={[
            notification.action.clientId,
            notification.action.api,
            notification.action.plan,
        ]}>
                    Your apiKey with clientId {notification.action.clientId} (
                    {notification.action.api}/{notification.action.plan}) has ended its rotation.
                  </Translation>
                </div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'ApiKeyRefresh' && (<div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="notif.apikey.refresh" replacements={[
            notification.action.subscription,
            notification.action.api,
            notification.action.plan,
        ]}>
                    Your subscription {notification.action.subscription} ({notification.action.api}/
                    {notification.action.plan}) has been refreshed.
                  </Translation>
                </div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'TeamInvitation' && (<div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="team.invitation" replacements={[
            notification.sender.name,
            props.getTeam(notification.action.team).name,
        ]}>
                    {notification.sender.name}, as admin of{' '}
                    {props.getTeam(notification.action.team).name}, invit you in his team.
                  </Translation>
                </div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'NewPostPublished' && (<div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="team.invitation" replacements={[
            notification.sender.name,
            props.getTeam(notification.action.teamId).name,
        ]}>
                    {notification.sender.name}, as admin of{' '}
                    {props.getTeam(notification.action.teamId).name}, has published a new post on{' '}
                    {notification.action.apiName}.
                  </Translation>
                </div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'NewIssueOpen' && (<div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="issues.notification" replacements={[notification.action.apiName]}>
                    {notification.sender.name} has published a new issue on{' '}
                    {notification.action.apiName}.
                  </Translation>
                </div>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {notification.action.type === 'NewCommentOnIssue' && (<div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="issues.comment.notification" replacements={[notification.action.apiName]}>
                    {notification.sender.name} has published a new comment on issue of{' '}
                    {notification.action.apiName}.
                  </Translation>
                </div>)}
            </h5>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex mt-1 justify-content-end">{actionFormatter(notification)}</div>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <hr />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex justify-content-between" style={{ fontSize: 12 }}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="">{fromFormatter(notification.action, notification.sender)}</div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="">{moment(notification.date).toNow(true)}</div>
        </div>
      </div>
    </div>);
}
