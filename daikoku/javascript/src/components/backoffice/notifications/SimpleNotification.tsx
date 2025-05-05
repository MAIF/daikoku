import { constraints, format, type } from '@maif/react-forms';
import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

import { I18nContext, ModalContext } from '../../../contexts';
import * as Services from '../../../services';
import { isError, ITesting } from '../../../types';
import { formatDate, getLanguageFns, Option } from '../../utils';
import { FeedbackButton } from '../../utils/FeedbackButton';

type LimitedTeam = {
  _id: string
  name?: string
  type: string
}
type NotificationGQL = {
  _id: string
  action: {
    message?: string
    motivation?: string
    api?: {
      _id: string
      name: string
      testing: ITesting
    }
    apiName?: string
    subscriptionName?: string
    planName?: string
    __typename: string
    linkTo?: string
    team?: LimitedTeam
    clientId?: string
    plan?: {
      _id: string
      customName?: string
      typeName: string
    }
    user?: {
      id: string
      name: string
    }
    parentSubscriptionId?: {
      _id: string
      apiKey: {
        clientName: string;
        clientId: string;
        clientSecret: string;
      }
    }
    demand?: {
      id: string
      motivation: string
    }
  }
  date: number
  notificationType: {
    value: string
  }
  sender: {
    id: string
    name: string
  }
  status: {
    date?: number
    status: string
  }
  team: {
    _id: string
    name: string
  }
  tenant: {
    id: string
  }

}
interface ISimpleNotificationProps {
  notification: NotificationGQL
  accept: (values?: object) => void
  reject: (message?: string) => void
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
      case 'TransferApiOwnership':
        return (
          <i
            className="fa-solid fa-arrow-down-from-dotted-line"
            style={{ marginRight: 5 }}
            title={translate('transfer.api.ownership')}
          />
        );
      case 'ApiSubscriptionDemand':
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

  const actionFormatter = (notification: NotificationGQL) => {
    const { status, date } = notification.status;
    if (
      status === 'Pending' &&
      (notification.action.__typename === 'NewIssueOpen' ||
        notification.action.__typename === 'NewCommentOnIssue')
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
              notification.action.linkTo ?
                navigate(notification.action.linkTo, { replace: true }) : navigate("/apis", { replace: true })
            }}
          >
            <i className="fas fa-eye" />
          </button>
        </div>
      );
    } else {
      switch (status) {
        case 'Pending':
          switch (props.notification.action.__typename) {
            case 'ApiSubscriptionDemand':
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
                      aria-label={translate('Accept')}
                      onClick={() =>
                        Services.getSubscriptionDemand(props.notification.team._id, props.notification.action.demand!.id)
                          .then(demand => {
                            if (!isError(demand)) {
                              openSubMetadataModal({
                                save: props.accept,
                                api: props.notification.action.api?._id,
                                plan: props.notification.action.plan!._id,
                                team: props.notification.action.team,
                                notification: props.notification,
                                subscriptionDemand: demand,
                                creationMode: true,
                              })
                            }
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
                      aria-label={translate('Reject')}
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
                      aria-label={translate('Accept')}
                      onClick={() => props.accept()}
                    >
                      <i className="fas fa-check" />
                    </a>
                  </div>

                </div>
              )
            case 'CheckoutForSubscription':
              return (
                <div className='d-flex flex-row flex-grow-1 justify-content-between'>
                  <div>{props.notification.action.apiName}/{props.notification.action.planName}</div>
                  <div className='d-flex flex-row flex-nowrap'>
                    <FeedbackButton
                      type="success"
                      className="ms-1"
                      onPress={() => Services.rerunProcess(props.notification.action.team?._id!, props.notification.action.demand!.id)
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
                    aria-label={translate('Accept')}
                    onClick={() => props.accept()}
                  >
                    <i className="fas fa-check" />
                  </a>
                  {notification.notificationType.value === 'AcceptOrReject' && (
                    <a
                      className="btn btn-outline-danger btn-sm"
                      href="#"
                      title={translate('Reject')}
                      aria-label={translate('Reject')}
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
              title={formatDate(date!, translate('date.locale'), translate('date.format.short.seconds'))}
            >
              <i className="fas fa-check" />
            </a>
          );
        case 'Rejected':
          return (
            <a
              className="btn disabled"
              title={formatDate(date!, translate('date.locale'), translate('date.format.short.seconds'))}
            >
              <i className="fas fa-times" />
            </a>
          );
      }
    }
  };

  const fromFormatter = (action: any, sender: any) => {
    switch (action.__typename) {
      case 'ApiAccess':
        return `${sender.name}/${props.notification.action.team?.name ?? translate("Unknown team")}`;
      case 'NewPostPublished':
      case 'NewIssueOpen':
      case 'NewCommentOnIssue':
        return sender.name;
      case 'TransferApiOwnership':
        return `${sender.name}`;
      case 'ApiSubscriptionReject':
      case 'ApiSubscriptionAccept':
      case 'TeamInvitation':
        return props.notification.action.team?.name ?? translate("Unknown team");
      case 'ApiSubscriptionDemand':
        return `${sender.name}/${props.notification.action.team?.name ?? translate("Unknown team")}`;
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

  const { notification } = props;
  let infos = {};
  if (['ApiAccess', 'ApiSubscriptionDemand', 'TransferApiOwnership', 'ApiSubscriptionReject', 'ApiSubscriptionAccept'].includes(notification.action.__typename)) {
    const api = notification.action.api
    const plan = !api
      ? { customName: translate('deleted') }
      : notification.action.plan ? notification.action.plan : notification.action.plan
    infos = { api: api || { name: translate('Deleted API') }, plan };
  }

  return (<div>
    <div className="alert section" role="alert">
      <div className="d-flex flex-column">
        <div className="d-flex align-items-center">
          {typeFormatter(notification.action.__typename)}
          <h5 className="alert-heading mb-0">
            {notification.action.__typename === 'CheckoutForSubscription' && (<div>
              <Translation i18nkey="notif.CheckoutForSubscription">
                You can checkout your subscription
              </Translation>
            </div>)}
            {notification.action.__typename === 'ApiAccess' && (<div>
              <Translation i18nkey="notif.api.access" replacements={[(infos as any).api.name]}>
                Request access to {(infos as any).api.name}
              </Translation>
            </div>)}
            {notification.action.__typename === 'TransferApiOwnership' && (<div>
              {`request to transfer the ownership of `}
              <strong>{(infos as any).api.name}</strong>
            </div>)}
            {notification.action.__typename === 'ApiSubscriptionDemand' && (<div>
              <Translation i18nkey="notif.api.subscription" replacements={[
                (infos as any).api.name,
                (infos as any).api.currentVersion,
                (infos as any).plan.customName,
              ]}>
                Request subscription to {(infos as any).api.name}-{(infos as any).api.currentVersion} for plan {(infos as any).plan}
              </Translation>
            </div>)}
            {notification.action.__typename === 'ApiSubscriptionReject' && translate({
              key: 'notif.api.demand.reject',
              replacements: [
                (infos as any).api.name,
                (infos as any).api.currentVersion,
                (infos as any).plan.customName]
            })}
            {notification.action.__typename === 'ApiSubscriptionAccept' && translate({
              key: 'notif.api.demand.accept',
              replacements: [
                (infos as any).api.name,
                (infos as any).api.currentVersion,
                (infos as any).plan.customName]
            })}
            {notification.action.__typename === 'ApiKeyDeletionInformation' && (<div>
              <Translation i18nkey="notif.apikey.deletion" replacements={[notification.action.clientId, notification.action.apiName]}>
                Your apiKey with clientId {notification.action.clientId} for api{' '}
                {notification.action.apiName} has been deleted
              </Translation>
            </div>)}
            {notification.action.__typename === 'OtoroshiSyncSubscriptionError' && (<div>{notification.action.message}</div>)}
            {notification.action.__typename === 'OtoroshiSyncApiError' && (<div>{notification.action.message}</div>)}
            {notification.action.__typename === 'ApiKeyRotationInProgress' && (<div>
              <Translation i18nkey="notif.apikey.rotation.inprogress" replacements={[
                notification.action.clientId,
                notification.action.apiName,
                notification.action.planName,
              ]}>
                Your apiKey with clientId {notification.action.clientId} (
                {notification.action.apiName}/{notification.action.planName}) has started its rotation.
                Its clientSecret hab been updated.
              </Translation>
            </div>)}
            {notification.action.__typename === 'ApiKeyRotationEnded' && (<div>
              <Translation i18nkey="notif.apikey.rotation.ended" replacements={[
                notification.action.parentSubscriptionId?.apiKey.clientId,
                notification.action.api,
                notification.action.plan,
              ]}>
                Your apiKey with clientId {notification.action.parentSubscriptionId?.apiKey.clientId} (
                {notification.action.api}/{notification.action.plan}) has ended its rotation.
              </Translation>
            </div>)}
            {notification.action.__typename === 'ApiKeyRefresh' && (<div>
              <Translation i18nkey="notif.apikey.refresh" replacements={[
                notification.action.subscriptionName,
                notification.action.apiName,
                notification.action.planName ? notification.action.planName : notification.action.plan?.typeName,
              ]}>
                Your subscription {notification.action.parentSubscriptionId?._id} ({notification.action.api}/
                {notification.action.plan}) has been refreshed.
              </Translation>
            </div>)}
            {notification.action.__typename === 'TeamInvitation' && (<div>
              <Translation i18nkey="team.invitation" replacements={[
                notification.sender.name,
                notification.action.team?.name,
              ]}>
                {notification.sender.name}, as admin of{' '}
                {notification.action.team?.name}, invite you in his team.
              </Translation>
            </div>)}
            {notification.action.__typename === 'NewPostPublished' && (<div>
              <Translation
                i18nkey="new.published.post.notification"
                replacements={[
                  notification.sender.name,
                  notification.action.team?.name,
                  notification.action.apiName
                ]}
              >
                {notification.sender.name}, as admin of{' '}
                {notification.action.team?.name}, has published a new post on{' '}
                {notification.action.api?.name}.
              </Translation>
            </div>)}
            {notification.action.__typename === 'NewIssueOpen' && (<div>
              <Translation i18nkey="issues.notification" replacements={[notification.action.apiName]}>
                {notification.sender.name} has published a new issue on{' '}
                {notification.action.apiName}.
              </Translation>
            </div>)}
            {notification.action.__typename === 'NewCommentOnIssue' && (<div>
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
        <div className="">{formatDistanceToNow(notification.date, { includeSeconds: true, addSuffix: true, locale: getLanguageFns(language) })}</div>
      </div>
    </div>
  </div>);
}
