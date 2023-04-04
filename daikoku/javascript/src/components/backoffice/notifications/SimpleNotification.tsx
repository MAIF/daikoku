import React, { useContext } from 'react';
import moment from 'moment';
import { useNavigate } from 'react-router-dom';
import { constraints, format, type } from '@maif/react-forms';

import { formatPlanType, Option } from '../../utils';
import { I18nContext } from '../../../core';
import { IApi, INotification, ITeamSimple } from '../../../types';
import { ModalContext } from '../../../contexts';
import * as Services from '../../../services';
import { FeedbackButton } from '../../utils/FeedbackButton';


interface ISimpleNotificationProps {
  notification: INotification
  accept: (values?: object) => void
  reject: (message?: string) => void
  getApi: (id: string) => IApi
  getTeam: (id: string) => ITeamSimple
}
export function SimpleNotification(props: ISimpleNotificationProps) {
  const { translate, language, Translation } = useContext(I18nContext);
  const { openFormModal, openSubMetadataModal } = useContext(ModalContext)

  const navigate = useNavigate();

  const typeFormatter = (type: string) => {
    switch (type) {
      case 'ApiAccess':
        return (
          <i
            className="fas fa-key"
            style={{ marginRight: 5 }}
            title={translate('Ask access to API')}
          />
        );
      case 'TeamAccess':
        return (
          <i
            className="fas fa-users"
            style={{ marginRight: 5 }}
            title={translate('Ask to join a team')}
          />
        );
      case 'TransferApiOwnership':
        return (
          <i
            className="fa-solid fa-arrow-down-from-dotted-line"
            style={{ marginRight: 5 }}
            title={translate('transfer.api.ownership')}
          />
        );
      case 'ApiSubscription':
        return (
          <i
            className="fas fa-file-signature"
            style={{ marginRight: 5 }}
            title={translate('Subscription to an API')}
          />
        );
      case 'ApiSubscriptionReject':
        return (
          <i
            className="fas fa-skull-crossbones"
            style={{ marginRight: 5 }}
            title={translate('Subscription to an API is refused')}
          />
        );
      case 'ApiSubscriptionAccept':
        return (
          <i
            className="fas fa-check"
            style={{ marginRight: 5 }}
            title={translate('Subscription to an API is accepted')}
          />
        );
      case 'OtoroshiSyncSubscriptionError':
        return (
          <i
            className="fas fa-pastafarianism"
            style={{ marginRight: 5 }}
            title={translate('Otoroshi sync error')}
          />
        );
      case 'OtoroshiSyncApiError':
        return (
          <i
            className="fas fa-pastafarianism"
            style={{ marginRight: 5 }}
            title={translate('Otoroshi sync error')}
          />
        );
      case 'ApiKeyDeletionInformation':
        return (
          <i
            className="fas fa-trash"
            style={{ marginRight: 5 }}
            title={translate('ApiKey deletion information')}
          />
        );
      case 'ApiKeyRotationInProgress':
        return (
          <i
            className="fas fa-sync-alt"
            style={{ marginRight: 5 }}
            title={translate('ApiKey rotation in progress')}
          />
        );
      case 'ApiKeyRotationEnded':
        return (
          <i
            className="fas fa-sync-alt"
            style={{ marginRight: 5 }}
            title={translate('ApiKey rotation ended')}
          />
        );
      case 'TeamInvitation':
        return (
          <i
            className="fas fa-envelope-alt"
            style={{ marginRight: 5 }}
            title={translate('Team invitation')}
          />
        );
      case 'ApiKeyRefresh':
        return (
          <i
            className="fas fa-sync-alt"
            style={{ marginRight: 5 }}
            title={translate('Apikey refresh')}
          />
        );
      case 'NewPostPublished':
        return (
          <i
            className="fas fa-newspaper"
            style={{ marginRight: 5 }}
            title={translate('New Published Post')}
          />
        );
      case 'NewIssueOpen':
        return (
          <i
            className="fas fa-exclamation-circle"
            style={{ marginRight: 5 }}
            title={translate('New issues open')}
          />
        );
      case 'NewCommentOnIssue':
        return (
          <i
            className="fas fa-comment-circle"
            style={{ marginRight: 5 }}
            title={translate('New comment on issue')}
          />
        );
      case 'CheckoutForSubscription':
        return (
          <i
            className="fas fa-comment-credit-card"
            style={{ marginRight: 5 }}
            title={translate('Checkout subscription')}
          />
        )
    }
  };

  const actionFormatter = (notification: INotification) => {
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
            className="btn btn-outline-success btn-sm me-1"
            onClick={() => props.accept()}
          >
            <i className="fas fa-check" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-success"
            onClick={() => {
              props.accept();
              navigate(notification.action.linkTo, { replace: true });
            }}
          >
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
                <div className='d-flex flex-row flex-grow-1'>
                  <div className='d-flex flex-wrap flex-grow-1'>
                    {props.notification.action.motivation}
                  </div>
                  <div className='d-flex flex-row flex-nowrap'>
                    <a
                      className="btn btn-outline-success btn-sm me-1"
                      // todo: @baudelotphilippe, don't sure it's the best solution
                      style={{ height: '30px' }}
                      href="#"
                      title={translate('Accept')}
                      onClick={() =>
                        openSubMetadataModal({
                          save: props.accept,
                          api: props.notification.action.api,
                          plan: props.notification.action.plan,
                          team: props.getTeam(props.notification.action.team),
                          notification: props.notification,
                          creationMode: true,
                        })
                      }
                    >
                      <i className="fas fa-check" />
                    </a>
                    <a
                      className="btn btn-outline-danger btn-sm"
                      style={{ height: '30px' }}
                      href="#"
                      title={translate('Reject')}
                      onClick={() => {
                        openFormModal<{ message: string }>({
                          title: translate('Message'),
                          schema: {
                            message: {
                              type: type.string,
                              format: format.text,
                              label: null,
                              constraints: [
                                constraints.required()
                              ]
                            }
                          },
                          onSubmit: ({ message }) => props.reject(message),
                          actionLabel: translate('Send')
                        })
                      }}
                    >
                      <i className="fas fa-times" />
                    </a>
                  </div>

                </div>
              );
            case 'ApiSubscriptionReject':
              return (
                <div className='d-flex flex-row flex-grow-1'>
                  <div className='d-flex flex-wrap flex-grow-1'>
                    {props.notification.action.message}
                  </div>
                  <div className='d-flex flex-row flex-nowrap'>
                    <a
                      className="btn btn-outline-success btn-sm me-1"
                      // todo: @baudelotphilippe, don't sure it's the best solution
                      style={{ height: '30px' }}
                      title={translate('Accept')}
                      onClick={() => props.accept()}
                    >
                      <i className="fas fa-check" />
                    </a>
                  </div>

                </div>
              )
            case 'CheckoutForSubscription':
              const api = props.getApi(props.notification.action.api)
              const maybePlan = api.possibleUsagePlans.find(p => p._id === props.notification.action.plan)
              const planName = Option(maybePlan).map(p => p.customName).getOrElse(maybePlan?.type)
              return (
                <div className='d-flex flex-row flex-grow-1 justify-content-between'>
                  <div>{api.name}/{planName}</div>
                  <div className='d-flex flex-row flex-nowrap'>
                    <FeedbackButton
                      type="success"
                      className="ms-1"
                      onPress={() => Services.rerunProcess(props.notification.team, props.notification.action.demand)
                        .then(r => window.location.href = r.checkoutUrl)}
                      onSuccess={() => console.debug("success")}
                      feedbackTimeout={100}
                      disabled={false}
                    >{translate('Checkout')}</FeedbackButton>
                  </div>

                </div>
              )
            default:
              return (
                <div>
                  <a
                    className="btn btn-outline-success btn-sm me-1"
                    href="#"
                    title={translate('Accept')}
                    onClick={() => props.accept()}
                  >
                    <i className="fas fa-check" />
                  </a>
                  {notificationType === 'AcceptOrReject' && (
                    <a
                      className="btn btn-outline-danger btn-sm"
                      href="#"
                      title={translate('Reject')}
                      onClick={() => props.reject()}
                    >
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
                translate({ key: 'moment.date.format', defaultResponse: 'DD MMM. YYYY à HH:mm z' })
              )}
            >
              <i className="fas fa-check" />
            </a>
          );
        case 'Rejected':
          return (
            <a
              className="btn disabled"
              title={moment(date).format(
                translate({ key: 'moment.date.format', defaultResponse: 'DD MMM. YYYY à HH:mm z' })
              )}
            >
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
      case 'ApiSubscriptionReject':
      case 'ApiSubscriptionAccept':
      case 'TeamInvitation':
      case 'CheckoutForSubscription':
        return sender.name;
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
  if (['ApiAccess', 'ApiSubscription', 'TransferApiOwnership', 'ApiSubscriptionReject', 'ApiSubscriptionAccept'].includes(notification.action.type)) {
    const api = getApi(notification.action.api);
    const plan = !api
      ? { customName: translate('deleted') }
      : api.possibleUsagePlans.find((p: any) => p._id === notification.action.plan);
    infos = { api: api || { name: translate('Deleted API') }, plan };
  }

  moment.locale(language);

  return (<div>
    <div className="alert section" role="alert">
      <div className="d-flex flex-column">
        <div className="d-flex align-items-center">
          {typeFormatter(notification.action.type)}
          <h5 className="alert-heading mb-0">
            {notification.action.type === 'CheckoutForSubscription' && (<div>
              <Translation i18nkey="notif.CheckoutForSubscription">
                You can checkout your subscription
              </Translation>
            </div>)}
            {notification.action.type === 'ApiAccess' && (<div>
              <Translation i18nkey="notif.api.access" replacements={[(infos as any).api.name]}>
                Request access to {(infos as any).api.name}
              </Translation>
            </div>)}
            {notification.action.type === 'TeamAccess' && (<div>
              <Translation i18nkey="notif.membership.team">
                membership request to your team
              </Translation>
            </div>)}
            {notification.action.type === 'TransferApiOwnership' && (<div>
              {`request to transfer the ownership of `}
              <strong>{(infos as any).api.name}</strong>
            </div>)}
            {notification.action.type === 'ApiSubscription' && (<div>
              <Translation i18nkey="notif.api.subscription" replacements={[
                (infos as any).api.name,
                Option((infos as any).plan.customName).getOrElse(formatPlanType((infos as any).plan, translate)),
              ]}>
                Request subscription to {(infos as any).api.name} for plan {(infos as any).plan.type}
              </Translation>
            </div>)}
            {notification.action.type === 'ApiSubscriptionReject' && translate({
              key: 'notif.api.demand.reject',
              replacements: [(infos as any).api.name, Option((infos as any).plan.customName).getOrElse(formatPlanType((infos as any).plan, translate))]
            })}
            {notification.action.type === 'ApiSubscriptionAccept' && translate({
              key: 'notif.api.demand.accept',
              replacements: [(infos as any).api.name, Option((infos as any).plan.customName).getOrElse(formatPlanType((infos as any).plan, translate))]
            })}
            {notification.action.type === 'ApiKeyDeletionInformation' && (<div>
              <Translation i18nkey="notif.apikey.deletion" replacements={[notification.action.clientId, notification.action.api]}>
                Your apiKey with clientId {notification.action.clientId} for api{' '}
                {notification.action.api} has been deleted
              </Translation>
            </div>)}
            {notification.action.type === 'OtoroshiSyncSubscriptionError' && (<div>{notification.action.message}</div>)}
            {notification.action.type === 'OtoroshiSyncApiError' && (<div>{notification.action.message}</div>)}
            {notification.action.type === 'ApiKeyRotationInProgress' && (<div>
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
            {notification.action.type === 'ApiKeyRotationEnded' && (<div>
              <Translation i18nkey="notif.apikey.rotation.ended" replacements={[
                notification.action.clientId,
                notification.action.api,
                notification.action.plan,
              ]}>
                Your apiKey with clientId {notification.action.clientId} (
                {notification.action.api}/{notification.action.plan}) has ended its rotation.
              </Translation>
            </div>)}
            {notification.action.type === 'ApiKeyRefresh' && (<div>
              <Translation i18nkey="notif.apikey.refresh" replacements={[
                notification.action.subscription,
                notification.action.api,
                notification.action.plan,
              ]}>
                Your subscription {notification.action.subscription} ({notification.action.api}/
                {notification.action.plan}) has been refreshed.
              </Translation>
            </div>)}
            {notification.action.type === 'TeamInvitation' && (<div>
              <Translation i18nkey="team.invitation" replacements={[
                notification.sender.name,
                props.getTeam(notification.action.team).name,
              ]}>
                {notification.sender.name}, as admin of{' '}
                {props.getTeam(notification.action.team).name}, invit you in his team.
              </Translation>
            </div>)}
            {notification.action.type === 'NewPostPublished' && (<div>
              <Translation
                i18nkey="new.published.post.notification"
                replacements={[
                  notification.sender.name,
                  props.getTeam(notification.action.teamId).name,
                  notification.action.apiName
                ]}
              >
                {notification.sender.name}, as admin of{' '}
                {props.getTeam(notification.action.teamId).name}, has published a new post on{' '}
                {notification.action.apiName}.
              </Translation>
            </div>)}
            {notification.action.type === 'NewIssueOpen' && (<div>
              <Translation i18nkey="issues.notification" replacements={[notification.action.apiName]}>
                {notification.sender.name} has published a new issue on{' '}
                {notification.action.apiName}.
              </Translation>
            </div>)}
            {notification.action.type === 'NewCommentOnIssue' && (<div>
              <Translation i18nkey="issues.comment.notification" replacements={[notification.action.apiName]}>
                {notification.sender.name} has published a new comment on issue of{' '}
                {notification.action.apiName}.
              </Translation>
            </div>)}
          </h5>
        </div>
        <div className="d-flex mt-1 justify-content-end">{actionFormatter(notification)}</div>
      </div>
      <hr />
      <div className="d-flex justify-content-between" style={{ fontSize: 12 }}>
        <div className="">{fromFormatter(notification.action, notification.sender)}</div>
        <div className="">{moment(notification.date).toNow(true)}</div>
      </div>
    </div>
  </div>);
}
