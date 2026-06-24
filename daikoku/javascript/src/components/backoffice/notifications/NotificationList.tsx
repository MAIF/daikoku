import { constraints, format, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnFiltersState, createColumnHelper } from '@tanstack/react-table';
import classNames from 'classnames';
import { formatDistanceToNow } from 'date-fns';
import debounce from 'lodash/debounce';
import { useContext, useMemo } from 'react';
import { ArrowRight, Ban, Check, Smile } from "lucide-react";

import { I18nContext, ModalContext, TranslateParams } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import { CustomSubscriptionData } from '../../../contexts/modals/SubscriptionMetadataModal';
import * as Services from '../../../services';
import {
  IAccountCreationGQL,
  IApiGQL,
  IApiPost,
  isError,
  Issue,
  ISubscription,
  ISubscriptionDemandGQL,
  ITeamFullGql,
  ITeamSimple,
  ITenant,
  IUsagePlan,
  IUser,
  IValidationStep,
} from '../../../types';
import { BulkAction, DynamicTable, DynamicTableColumnCtx, FetchData, FetchResult, FilterDef } from '../../inputs/DynamicTable';
import { getLanguageFns } from '../../utils';
import { FeedbackButton } from '../../utils/FeedbackButton';
import { SimpleApiKeyCard } from '../apikeys/TeamApiKeysForApi';
import { IApiSubscriptionGql } from '../apis';

// ─── Types ───────────────────────────────────────────────────────────────────

type NotificationsGQL = {
  notifications: Array<NotificationGQL>
  total: number,
  totalFiltered: number,
  totalByTypes: Array<{ type: string, total: number }>,
  totalByNotificationTypes: Array<{ type: string, total: number }>,
  totalByTeams: Array<{ team: string, total: number }>,
  totalByApis: Array<{ api: string, total: number }>,
  totalSelectable: number
}

type NotificationActionGQL =
  | { __typename: 'ApiAccess'; api: IApiGQL; team: ITeamFullGql }
  | { __typename: 'TeamInvitation'; team: ITeamFullGql; user: IUser }
  | {
    __typename: 'ApiSubscription';
    api: IApiGQL; team: ITeamFullGql; plan: IUsagePlan;
    parentSubscriptionId: IApiSubscriptionGql; motivation: string; demand: ISubscriptionDemandGQL;
  }
  | { __typename: 'NewCommentOnIssueV2'; api: IApiGQL; issue: Issue }
  | { __typename: 'NewPostPublishedV2'; api: IApiGQL; post: IApiPost }
  | { __typename: 'ApiKeyRefreshV2'; api: IApiGQL; subscription: IApiSubscriptionGql; plan: IUsagePlan; message?: string }
  | { __typename: 'ApiKeyDeletionInformationV2'; clientId: string; api: IApiGQL }
  | { __typename: 'TransferApiOwnership'; api: IApiGQL; team: ITeamFullGql }
  | { __typename: 'ApiSubscriptionAccept'; team: ITeamFullGql; api: IApiGQL; plan: IUsagePlan }
  | { __typename: 'ApiSubscriptionReject'; team: ITeamFullGql; api: IApiGQL; plan: IUsagePlan; message: string }
  | { __typename: 'OtoroshiSyncSubscriptionError'; message: string }
  | { __typename: 'OtoroshiSyncApiError'; message: string; api: IApiGQL }
  | { __typename: 'ApiKeyRotationInProgressV2'; api: IApiGQL; subscription: IApiSubscriptionGql; plan: IUsagePlan }
  | { __typename: 'ApiKeyRotationEnded'; clientId: string; apiName: string; planName: string }
  | { __typename: 'ApiKeyRotationEndedV2'; api: IApiGQL; subscription: IApiSubscriptionGql; plan: IUsagePlan }
  | { __typename: 'NewIssueOpenV2'; api: IApiGQL; issue: Issue }
  | { __typename: 'CheckoutForSubscription'; plan: IUsagePlan; step: IValidationStep & { type: 'payment' }; demand: ISubscriptionDemandGQL; api: IApiGQL }
  | { __typename: 'ApiSubscriptionTransferSuccess'; subscription: ISubscription }
  | { __typename: 'AccountCreationAttempt'; demand?: IAccountCreationGQL; motivation: string };

type NotificationGQL = {
  _id: string
  action: NotificationActionGQL
  _deleted: boolean
  _tenant: ITeamFullGql
  date: number
  notificationType: { value: 'AcceptOnly' | 'AcceptOrReject' }
  sender: { id: string; name: string }
  status: { date?: number; status: 'Pending' | 'Accepted' | 'Rejected' }
  team?: { _id: string; name: string }
  tenant: { id: string }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const defaultColumnFilters: ColumnFiltersState = [{ id: 'unreadOnly', value: true }];

const getApiFromNotification = (
  notification: NotificationGQL,
): { _id: string; name: string; currentVersion?: string } | undefined => {
  switch (notification.action.__typename) {
    case 'ApiAccess':
    case 'ApiSubscription':
    case 'ApiSubscriptionReject':
    case 'ApiSubscriptionAccept':
    case 'OtoroshiSyncApiError':
    case 'ApiKeyDeletionInformationV2':
    case 'ApiKeyRotationInProgressV2':
    case 'ApiKeyRotationEndedV2':
    case 'ApiKeyRefreshV2':
    case 'NewPostPublishedV2':
    case 'NewIssueOpenV2':
    case 'NewCommentOnIssueV2':
    case 'TransferApiOwnership':
    case 'CheckoutForSubscription': {
      const _api = notification.action.api;
      return { _id: _api._id, name: _api.name, currentVersion: _api.currentVersion };
    }
    default:
      return;
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

export const NotificationList = () => {
  const { translate, language } = useContext(I18nContext);
  const { customGraphQLClient, tenant, reloadUnreadNotificationsCount } = useContext(GlobalContext);
  const { openSubMetadataModal, openFormModal, alert, openCustomModal } = useContext(ModalContext);
  const queryClient = useQueryClient();

  // Server-side autocomplete for the API filter: instead of fetching every
  // visible API up front (blocking) we load a handful at a time as the user
  // types. The DynamicTable keeps the id->label cache needed to render the
  // labels of already-selected APIs.
  const loadApiOptions = useMemo(
    () =>
      debounce((input: string, callback: (options: Array<{ label: string; value: string }>) => void) => {
        Services.getMyVisibleApisLight(input, -1).then(apis => {
          callback(apis.map(a => ({ label: a.name, value: a._id })));
        });
      }, 300),
    []
  );

  const myTeamsRequest = useQuery({
    queryKey: ['myTeams'],
    queryFn: () => Services.myTeams(),
    select: data => (isError(data) ? [] : data),
  });

  const notificationTypes = [
    { type: 'ApiAccess' }, { type: 'ApiSubscription' }, { type: 'ApiSubscriptionReject' },
    { type: 'ApiSubscriptionAccept' }, { type: 'OtoroshiSyncSubscriptionError' },
    { type: 'OtoroshiSyncApiError' }, { type: 'ApiKeyDeletionInformationV2' },
    { type: 'ApiKeyRotationInProgressV2' }, { type: 'ApiKeyRotationEndedV2' },
    { type: 'TeamInvitation' }, { type: 'ApiKeyRefreshV2' }, { type: 'NewPostPublishedV2' },
    { type: 'NewIssueOpenV2' }, { type: 'NewCommentOnIssueV2' }, { type: 'TransferApiOwnership' },
    { type: 'ApiSubscriptionTransferSuccess' }, { type: 'CheckoutForSubscription' },
    { type: 'AccountCreation' },
  ];

  // ─── Actions ─────────────────────────────────────────────────────────────

  const accept = (notification: string, sub?: CustomSubscriptionData) => {
    return Services.acceptNotificationOfTeam(notification, sub)
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
      .then(reloadUnreadNotificationsCount);
  };
  const reject = (notification: string, message?: string) => {
    return Services.rejectNotificationOfTeam(notification, message)
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
      .then(reloadUnreadNotificationsCount);
  };

  // ─── Formatters ──────────────────────────────────────────────────────────

  const statusFormatter = (status: { date?: number; status: 'Pending' | 'Accepted' | 'Rejected' }) => {
    switch (status.status) {
      case 'Accepted':
        return (
          <div className='d-flex justify-content-end align-items-center gap-2 color-success'>
            <Check />
            {translate("notification.page.status.accepted.label")}
          </div>
        );
      case 'Rejected':
        return (
          <div className='d-flex  justify-content-end align-items-center gap-2 color-danger'>
            <Ban />
            {translate("notification.page.status.rejected.label")}
          </div>
        );
      default:
        return null;
    }
  };

  const actionFormatter = (notification: NotificationGQL) => {
    switch (notification.action.__typename) {
      case 'NewPostPublishedV2':
        return (
          <div className='action-container'>
            <div className="d-flex justify-content-end">
              <a href={`/${notification.action.api.team._humanReadableId}/${notification.action.api._humanReadableId}/${notification.action.api.currentVersion}/news`}
                onClick={() => notification.status.status === 'Pending' ? accept(notification._id) : {}}
                className="btn --tertiary --small --icon-only" target='_blank'
                title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
                aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              >
                <ArrowRight />
              </a>
            </div>
            {notification.status.status === 'Pending' && <FeedbackButton
              className="btn --tertiary --small --icon-only"
              title={translate('notifications.page.table.read.action.label')}
              aria-label={translate('notifications.page.table.read.action.label')}
              onPress={() => accept(notification._id)}
            >
              <Ban />
            </FeedbackButton>}
          </div>
        );
      case 'NewIssueOpenV2':
      case 'NewCommentOnIssueV2': {
        const api = notification.action.api;
        return (
          <div className='action-container'>
            <div className="d-flex justify-content-end">
              <a href={`/${api.team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/issues/${notification.action.issue._id}`}
                onClick={() => notification.status.status === 'Pending' ? accept(notification._id) : {}}
                className="btn --tertiary --small --icon-only"
                target='_blank'
                title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
                aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              >
                <ArrowRight />
              </a>
            </div>
            {notification.status.status === 'Pending' && <FeedbackButton
              className="btn --tertiary --small --icon-only"
              title={translate('notifications.page.table.read.action.label')}
              aria-label={translate('notifications.page.table.read.action.label')}
              onPress={() => accept(notification._id)}
            >
              <Ban />
            </FeedbackButton>}
          </div>
        );
      }
      case 'ApiSubscription': {
        const _demand = notification.action.demand;
        const _api = notification.action.api;
        const _plan = notification.action.plan;
        const _team = notification.action.team;
        if (notification.status.status === 'Pending') {
          return (
            <div className='action-container'>
              <div className="d-flex justify-content-end gap-2">
                <FeedbackButton className="btn --tertiary --small --icon-only"
                  title={translate('Accept')} aria-label={translate('Accept')}
                  onPress={() =>
                    Services.getSubscriptionDemand(notification.team!._id, _demand._id)
                      .then(demand => {
                        if (!isError(demand)) {
                          openSubMetadataModal({
                            save: (sub) => accept(notification._id, sub),
                            api: _api._id,
                            plan: _plan._id,
                            team: _team,
                            subscriptionDemand: demand,
                            creationMode: true,
                          })
                        }
                      })
                  }
                >
                  <Check />
                </FeedbackButton>
                <button className="btn --tertiary --small --icon-only"
                  title={translate('Reject')} aria-label={translate('Reject')}
                  onClick={() => {
                    openFormModal<{ message: string }>({
                      title: translate('Message'),
                      schema: {
                        message: {
                          type: type.string, format: format.text, label: null,
                          constraints: [constraints.required()],
                        },
                      },
                      onSubmit: ({ message }) => reject(notification._id, message),
                      actionLabel: translate('Send')
                    })
                  }}
                >
                  <Ban />
                </button>
              </div>
            </div>
          );
        } else {
          return <div className="action-container">{statusFormatter(notification.status)}</div>;
        }
      }
      case 'CheckoutForSubscription': {
        const _checkoutDemand = notification.action.demand;
        return (
          <div className="action-container">
            <div className='d-flex flex-row flex-grow-1 gap-2 justify-content-end'>
              <FeedbackButton type="success"
                className="btn --tertiary --small --icon-only"
                onPress={() =>
                  Services.rerunProcess(_checkoutDemand.team._id, _checkoutDemand._id)
                    .then(r => window.location.href = r.checkoutUrl)
                }
                onSuccess={() => { }} feedbackTimeout={100}>
                <ArrowRight />
              </FeedbackButton>
            </div>
          </div>
        );
      }
      case 'ApiKeyRefreshV2':
      case 'ApiKeyRotationInProgressV2':
      case 'ApiKeyRotationEndedV2':
        return (
          <div className='action-container'>
            <div className="d-flex justify-content-end">
            </div>
            {notification.status.status === 'Pending' && <FeedbackButton
              className="btn --tertiary --small --icon-only"
              title={translate('notifications.page.table.read.action.label')}
              aria-label={translate('notifications.page.table.read.action.label')}
              onPress={() => accept(notification._id)}
            >
              <Ban />
            </FeedbackButton>}
          </div>
        );
      default:
        return (
          <div className="action-container">
            <div className='d-flex flex-row flex-grow-1 gap-2 justify-content-end'>
              {notification.notificationType.value === 'AcceptOrReject' && notification.status.status === 'Pending' && (
                <FeedbackButton
                  className="btn --tertiary --small --icon-only"
                  title={translate('Accept')}
                  aria-label={translate('Accept')}
                  onPress={() => accept(notification._id)}
                >
                  <Check />
                </FeedbackButton>
              )}
              {notification.notificationType.value === 'AcceptOrReject' && notification.status.status === 'Pending' && (
                <FeedbackButton
                  className="btn --tertiary --small --icon-only"
                  onPress={() => reject(notification._id)}
                  onSuccess={() => { }} feedbackTimeout={100} disabled={false}
                  // title={translate('Reject')}
                  aria-label={translate('Reject')}
                // onClick={() => reject(notification._id)}
                >
                  <Ban />
                </FeedbackButton>
              )}
              {notification.notificationType.value === 'AcceptOrReject' && notification.status.status !== 'Pending' && statusFormatter(notification.status)}
            </div>
            {notification.status.status === 'Pending' && notification.notificationType.value !== 'AcceptOrReject' && (
              <FeedbackButton
                className="btn --tertiary --small --icon-only"
                title={translate('notifications.page.table.read.action.label')}
                aria-label={translate('notifications.page.table.read.action.label')}
                onPress={() => accept(notification._id)}
              >
                <Ban />
              </FeedbackButton>
            )}
          </div>
        );
    }
  };

  const notificationFormatter = (
    notification: NotificationGQL,
    translate: (params: string | TranslateParams) => string,
    tenant: ITenant
  ) => {
    switch (notification.action.__typename) {
      case 'CheckoutForSubscription':
        return translate('notif.CheckoutForSubscription');
      case 'ApiAccess':
        return translate({ key: 'notif.api.access', replacements: [notification.action.api.name] });
      case 'TransferApiOwnership':
        return translate({ key: 'notif.api.transfer', replacements: [notification.action.api.name] });
      case 'ApiSubscription': {
        const desc = translate({ key: `notif.api.subscription.${tenant.display}`, replacements: [notification.action.plan.customName] });
        const _api = notification.action.api;
        const _plan = notification.action.plan;
        const _team = notification.action.team;
        const _demand = notification.action.demand;
        const _motivation = notification.action.motivation;
        return (
          <>
            {desc}
            <a href='#' title={translate('notifications.page.subscription.demand.detail.button.label')}
              aria-label={translate('notifications.page.subscription.demand.detail.button.label')}
              className='underline'
              onClick={() => openCustomModal({
                title: translate('notifications.page.subscription.demand.detail.modal.title'),
                content: (
                  <div>
                    {[['API', _api.name], ['Plan/Env', _plan.customName], ['Message', _motivation], ['Equipe', _team.name], ['demandeur', notification.sender.name], ['Date', notification.date]].map(([label, val]) => (
                      <div key={label as string} className="notification-subscription-demand-summary">
                        <span className='label'>{label}</span>
                        <span>{val}</span>
                      </div>
                    ))}
                    <div className="accordion" id="accordionExample">
                      <div className="accordion-item">
                        <h2 className="accordion-header">
                          <button className="accordion-button collapsed" type="button"
                            data-bs-toggle="collapse" data-bs-target="#collapseOne"
                            aria-expanded="false" aria-controls="collapseOne">
                            [{translate('notifications.page.subscription.demand.detail.modal.raw.button.label')}]
                          </button>
                        </h2>
                        <div id="collapseOne" className="accordion-collapse collapse" data-bs-parent="#accordionExample">
                          <div className="accordion-body">
                            <pre>{JSON.stringify(_demand.motivation, null, 4)}</pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ),
                actions: (close) => notification.status.status === 'Pending' ? (
                  <>
                    <button className='btn btn-outline-danger' onClick={close}>{translate('Reject')}</button>
                    <button className='btn btn-outline-success'
                      onClick={() => Services.getSubscriptionDemand(notification.team!._id, _demand._id)
                        .then(demand => {
                          if (!isError(demand)) {
                            openSubMetadataModal({
                              save: (sub) => accept(notification._id, sub),
                              api: _api._id, plan: _plan._id, team: _team,
                              subscriptionDemand: demand, creationMode: true,
                            });
                          }
                        })}>
                      {translate('Accept')}
                    </button>
                  </>
                ) : (
                  <button className="btn btn-outline-info">{translate('Close')}</button>
                ),
                noClose: true,
              })}>
              <span className='ms-2'>[{translate('notifications.page.subscription.demand.detail.modal.raw.button.label')}]</span>
            </a>
          </>
        );
      }
      case 'ApiSubscriptionReject': {
        const desc = translate({ key: 'notif.api.demand.reject', replacements: [notification.action.plan.customName] });
        const _message = notification.action.message;
        return (
          <>
            {desc}
            <a href='#' className='underline'
              aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              onClick={() => alert({
                title: translate('notifications.page.subscription.demand.reject.detail.modal.title'),
                message: <div><i>{_message}</i></div>,
              })}>
              <span className='ms-2'>[{translate('notifications.page.subscription.demand.reject.detail.button.label')}]</span>
            </a>
          </>
        );
      }
      case 'ApiSubscriptionAccept':
        return translate({ key: 'notif.api.demand.accept', replacements: [notification.action.plan.customName] });
      case 'ApiKeyDeletionInformationV2': {
        const desc = translate({ key: 'notif.apikey.deletion' });
        const clientId = notification.action.clientId;
        return (
          <>
            {desc}
            <a href='#' className='underline'
              aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              onClick={() => alert({
                title: translate('notifications.page.subscription.deletion.detail.modal.title'),
                message: <div>{translate('subscription.display.credentials.clientId')} : <i>{clientId}</i></div>,
              })}>
              <span className='ms-2'>[{translate('notifications.page.subscription.demand.reject.detail.button.label')}]</span>
            </a>
          </>
        );
      }
      case 'OtoroshiSyncSubscriptionError':
      case 'OtoroshiSyncApiError':
        return notification.action.message;
      case 'ApiKeyRotationInProgressV2': {
        const __api = notification.action.api;
        const __plan = notification.action.plan;
        const __team = notification.action.api.team;
        const __subscription = notification.action.subscription;
        return (
          <>
            {translate('notif.apikey.rotation.inprogress')}
            <a href='#' className='underline'
              aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              onClick={() => alert({
                title: translate('notifications.page.subscription.deletion.detail.modal.title'),
                message: <SimpleApiKeyCard //@ts-ignore
                  api={__api} plan={__plan} apiTeam={__team as ITeamSimple} //@ts-ignore
                  subscription={__subscription} />,
              })}>
              <span className='ms-2'>[{translate('notifications.page.subscription.demand.reject.detail.button.label')}]</span>
            </a>
          </>
        );
      }
      case 'ApiKeyRotationEndedV2': {
        const __api = notification.action.api;
        const __plan = notification.action.plan;
        const __team = notification.action.api.team;
        const __subscription = notification.action.subscription;
        return (
          <>
            {translate('notif.apikey.rotation.ended')}
            <a href='#' className='underline'
              aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              onClick={() => alert({
                title: translate('notifications.page.subscription.deletion.detail.modal.title'),
                message: <SimpleApiKeyCard //@ts-ignore
                  api={__api} plan={__plan} apiTeam={__team as ITeamSimple} //@ts-ignore
                  subscription={__subscription} />,
              })}>
              <span className='ms-2'>[{translate('notifications.page.subscription.demand.reject.detail.button.label')}]</span>
            </a>
          </>
        );
      }
      case 'ApiKeyRefreshV2': {
        const __api = notification.action.api;
        const __plan = notification.action.plan;
        const __team = notification.action.api.team;
        const __subscription = notification.action.subscription;
        return (
          <>
            {translate('notif.apikey.refresh')}
            <a href='#' className='underline'
              aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              onClick={() => alert({
                title: translate('notifications.page.subscription.deletion.detail.modal.title'),
                message: <SimpleApiKeyCard //@ts-ignore
                  api={__api} plan={__plan} apiTeam={__team as ITeamSimple} //@ts-ignore
                  subscription={__subscription} />,
              })}>
              <span className='ms-2'>[{translate('notifications.page.subscription.demand.reject.detail.button.label')}]</span>
            </a>
          </>
        );
      }
      case 'TeamInvitation':
        return translate({ key: 'notif.team.invitation', replacements: [notification.action.team.name] });
      case 'NewPostPublishedV2':
        return translate({ key: 'notif.new.published.post', replacements: [notification.action.api.name] });
      case 'NewIssueOpenV2':
        return translate({ key: 'notif.issues', replacements: [notification.action.api.name] });
      case 'NewCommentOnIssueV2':
        return translate('notif.issues.comment');
      case 'ApiSubscriptionTransferSuccess':
        return translate('notif.subscription.transfer.success');
      case 'AccountCreationAttempt': {
        const description = translate('notif.account.creation.attempt');
        const value = notification.action.demand?.value;
        const formStep = notification.action.demand?.steps.map(s => s.step).find(s => s.type === 'form');
        const regexp = /\[\[(.+?)\]\]/g;
        const matches = formStep?.formatter.match(regexp);
        const formattedValue = matches?.reduce((acc, match) => {
          const key = match.replace('[[', '').replace(']]', '');
          return acc.replace(match, value?.[key] || match);
        }, formStep?.formatter ?? '');
        return (
          <>
            {description}
            {value && (
              <a href='#' className='underline'
                aria-label={translate('notifications.page.account.creation.attempt.detail.button.label')}
                title={translate('notifications.page.account.creation.attempt.detail.button.label')}
                onClick={() => alert({
                  title: translate('notifications.page.account.creation.attempt.detail.modal.title'),
                  message: (
                    <div>
                      {!!formattedValue && <em>{formattedValue}</em>}
                      <pre>{JSON.stringify(value, null, 2)}</pre>
                    </div>
                  ),
                })}>
                <span className='ms-2'>[{translate('notifications.page.account.creation.attempt.detail.button.label')}]</span>
              </a>
            )}
          </>
        );
      }
      default:
        return '';
    }
  };

  const columnHelper = createColumnHelper<NotificationGQL>();

  const buildColumns = ({ setColumnFilters, selectAll, seedFilterLabels }: DynamicTableColumnCtx) => [
    columnHelper.display({
      id: 'select',
      meta: { className: 'select-cell', size: 5 },
      cell: ({ row }) => {
        const notification = row.original;
        if (row.getCanSelect())
          return (
            <>
              <input
                type="checkbox"
                className={classNames('form-check-input select-input')}
                checked={row.getIsSelected() || (row.getCanSelect() && selectAll)}
                disabled={!row.getCanSelect()}
                onChange={row.getToggleSelectedHandler()}
              />
              <span className={classNames('indicator flex-grow-1 d-flex justify-content-end', { unread: notification.status.status === 'Pending' })} />
            </>
          );
        return (
          <span className={classNames('indicator flex-grow-1 d-flex justify-content-end', { unread: notification.status.status === 'Pending' })} />
        );
      },
    }),
    columnHelper.display({
      id: 'api',
      meta: { className: 'api-cell', title: translate('notifications.page.table.header.label.api'), size: 15 },
      cell: (info) => {
        const notification = info.row.original;
        const api = getApiFromNotification(notification);
        if (!api) return null;
        return (
          <a href='#' onClick={() => {
            seedFilterLabels('api', [{ label: api.name, value: api._id }]);
            setColumnFilters(prev => [
              ...prev.filter(f => f.id !== 'api'),
              { id: 'api', value: [api._id] },
            ]);
          }}>
            {api.name}{api.currentVersion ? ` (${api.currentVersion})` : null}
          </a>
        );
      }
    }),
    columnHelper.accessor('action.__typename', {
      id: 'type',
      meta: { className: 'type-cell', title: translate('notifications.page.table.header.label.type'), size: 15 },
      enableColumnFilter: true,
      cell: (info) => {
        const typeName = info.getValue();
        const label = translate(`notifications.page.filters.type.${typeName}.label`);
        return (
          <span
            className="tag --primary"
            onClick={() =>
              setColumnFilters(prev => [
                ...prev.filter(f => f.id !== 'type'),
                { id: 'type', value: [typeName] },
              ])
            }
          >
            {label}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'description',
      meta: { className: 'description-cell', title: translate('notifications.page.table.header.label.description'), size: 30 },
      cell: (info) => (
        <div className='notification d-flex align-items-center gap-3'>
          <div className='notification__description'>
            {notificationFormatter(info.row.original, translate, tenant)}
          </div>
        </div>
      ),
    }),
    columnHelper.display({
      id: 'team',
      meta: { className: 'team-cell', title: translate('notifications.page.table.header.label.team'), size: 15 },
      cell: (info) => {
        const team = info.row.original.team;
        if (!team) return null;
        return (
          <a href='#' onClick={() =>
            setColumnFilters(prev => [
              ...prev.filter(f => f.id !== 'team'),
              { id: 'team', value: [team._id] },
            ])
          }>
            {team.name}
          </a>
        );
      },
    }),
    columnHelper.accessor('sender.name', {
      id: 'sender',
      meta: { className: 'sender-cell', title: translate('notifications.page.table.header.label.sender'), size: 12 },
      enableColumnFilter: true,
      cell: (info) => {
        const sender = info.getValue();
        const isSystem = sender.startsWith('Otoroshi');
        return (
          <div className='sender d-flex gap-2 align-items-center'>
            {!isSystem && <Smile size={16} />}
            {sender}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'date',
      enableColumnFilter: false,
      meta: { className: 'date-cell', title: translate('notifications.page.table.header.label.date'), size: 7 },
      cell: (info) => {
        const date = formatDistanceToNow(info.row.original.date, {
          includeSeconds: false, addSuffix: true, locale: getLanguageFns(language),
        });
        return <div className="notification__date">{date}</div>;
      },
    }),
    columnHelper.display({
      id: 'action',
      enableColumnFilter: false,
      meta: { className: 'action-cell', title: translate('notifications.page.table.header.label.actions'), size: 15 },
      cell: (info) => (
        <div className='notification__actions'>{actionFormatter(info.row.original)}</div>
      ),
    }),
  ];

  // ─── fetchData ────────────────────────────────────────────────────────────

  const fetchData: FetchData<NotificationGQL> = ({ limit, offset, filters }) =>
    customGraphQLClient
      .request<{ myNotifications: NotificationsGQL }>(Services.graphql.getMyNotifications, {
        limit,
        offset,
        filterTable: JSON.stringify([...(filters ?? [])]),
      })
      .then(({ myNotifications }): FetchResult<NotificationGQL> => ({
        items: myNotifications.notifications,
        total: myNotifications.total,
        totalFiltered: myNotifications.totalFiltered,
        totalSelectable: myNotifications.totalSelectable,
        filterCounts: {
          team: myNotifications.totalByTeams.map(t => ({ key: t.team, total: t.total })),
          api: myNotifications.totalByApis.map(a => ({ key: a.api, total: a.total })),
          type: myNotifications.totalByNotificationTypes.map(t => ({ key: t.type, total: t.total })),
        },
      }));

  // ─── Filters ─────────────────────────────────────────────────────────────

  const filters: FilterDef[] = [
    {
      id: 'team',
      type: 'multiselect',
      labelKey: 'notifications.page.filters.team.label',
      labelKeyAll: 'notifications.page.filters.all.team.label',
      options: (myTeamsRequest.data ?? []).map(t => ({ label: t.name, value: t._id })),
      isLoading: myTeamsRequest.isLoading || myTeamsRequest.isPending,
      countKey: 'team',
    },
    {
      id: 'api',
      type: 'multiselect',
      labelKey: 'notifications.page.filters.api.label',
      labelKeyAll: 'notifications.page.filters.all.api.label',
      loadOptions: loadApiOptions,
      countKey: 'api',
    },
    {
      id: 'type',
      type: 'multiselect',
      labelKey: 'notifications.page.filters.type.label',
      labelKeyAll: 'notifications.page.filters.all.type.label',
      options: notificationTypes.map(v => ({
        label: translate(`notifications.page.filters.type.${v.type}.label`),
        value: v.type,
      })),
      countKey: 'type',
    },
    {
      id: 'unreadOnly',
      type: 'boolean',
      onLabel: translate('notifications.page.filters.unread.notifications.label'),
      offLabel: translate('notifications.page.filters.all.notifications.label'),
    },
  ];

  // ─── Bulk actions ─────────────────────────────────────────────────────────

  const bulkActions: BulkAction<NotificationGQL>[] = [
    {
      label: translate('notifications.page.table.read.bulk.action.label'),
      onClick: async (rows, selectAll, ctx) => {
        const ids = rows.map(r => r._id);
        await Services.acceptNotificationOfTeamByBulk(ids, selectAll);
        ctx.resetFilters();
        ctx.refetch();
        reloadUnreadNotificationsCount();
      },
    },
  ];

  // ─── Aria label per row ───────────────────────────────────────────────────

  const getRowAriaLabel = (notif: NotificationGQL): string => {
    const date = formatDistanceToNow(notif.date, {
      includeSeconds: true, addSuffix: true, locale: getLanguageFns(language),
    });
    return translate({
      key: 'notifications.page.notification.ariaLabel',
      replacements: [
        translate(`notifications.page.filters.type.${notif.action.__typename}.label`),
        notif.sender.name,
        date,
      ],
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <h1 className="jumbotron-heading" id='notif-label'>
        {translate('notifications.page.table.title')}
      </h1>
      <DynamicTable<NotificationGQL>
        queryKey={['notifications']}
        columns={buildColumns}
        fetchData={fetchData}
        filters={filters}
        defaultFilters={defaultColumnFilters}
        enableRowSelection={row => {
          const n = row.original;
          return n.status.status === 'Pending' && n.notificationType.value === 'AcceptOnly';
        }}
        bulkActions={bulkActions}
        pageSize={25}
        getRowId={row => row._id}
        getRowAriaLabel={getRowAriaLabel}
        countLabelKey="notifications.page.total.label"
      />
    </>
  );
};
