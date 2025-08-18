import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnFiltersState, createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, PaginationState, SortingState, useReactTable } from '@tanstack/react-table';
import classNames from 'classnames';
import { formatDistanceToNow } from 'date-fns';
import { useContext, useEffect, useMemo, useState } from 'react';
import Select, { components, MultiValue, OptionProps, ValueContainerProps } from 'react-select';

import { constraints, format, type } from '@maif/react-forms';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { I18nContext, ModalContext, TranslateParams } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import { CustomSubscriptionData } from '../../../contexts/modals/SubscriptionMetadataModal';
import * as Services from '../../../services';
import { DaikokuMode, Display, IApi, IApiGQL, IApiPost, IIssuesTag, isError, Issue, ISubscription, ISubscriptionDemand, ISubscriptionDemandGQL, ITeamFullGql, ITeamSimple, ITenant, ITesting, IUsagePlan, IUser, IValidationStepPayment } from '../../../types';
import { getLanguageFns, Spinner } from '../../utils';
import { FeedbackButton } from '../../utils/FeedbackButton';
import { Option as opt } from '../../utils';
import { IApiSubscriptionGql } from '../apis';
import { SimpleApiKeyCard } from '../apikeys/TeamApiKeysForApi';
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends unknown, TValue> extends NotificationColumnMeta { }
}

type NotificationColumnMeta = {
  className?: string;
};

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
type LimitedTeam = {
  _id: string
  name: string
  type: string
}

type NotificationActionGQL =
  | {
    __typename: 'ApiAccess';
    api: IApiGQL;
    team: ITeamFullGql;
  }
  | {
    __typename: 'TeamInvitation';
    team: ITeamFullGql;
    user: IUser;
  }
  | {
    __typename: 'ApiSubscription';
    api: IApiGQL;
    team: ITeamFullGql;
    plan: IUsagePlan;
    parentSubscriptionId: IApiSubscriptionGql;
    motivation: string;
    demand: ISubscriptionDemandGQL;
  }
  | {
    __typename: 'NewCommentOnIssue';
    teamId: string;
    linkTo: string;
    apiName: string;
  }
  | {
    __typename: 'NewCommentOnIssueV2';
    api: IApiGQL;
    issue: Issue
  }
  | {
    __typename: 'NewPostPublished';
    apiName: string;
    team: ITeamFullGql;
  }
  | {
    __typename: 'NewPostPublishedV2';
    api: IApiGQL;
    post: IApiPost
  }
  | {
    __typename: 'ApiKeyRefresh';
    subscriptionName: string;
    apiName: string;
    planName: string;
  }
  | {
    __typename: 'ApiKeyRefreshV2';
    api: IApiGQL;
    subscription: IApiSubscriptionGql;
    plan: IUsagePlan
    message?: string
  }
  | {
    __typename: 'ApiKeyDeletionInformation';
    apiName: string;
    clientId: string;
  }
  | {
    __typename: 'ApiKeyDeletionInformationV2';
    clientId: string;
    api: IApiGQL;
    subscription: IApiSubscriptionGql;
  }
  | {
    __typename: 'TransferApiOwnership';
    api: IApiGQL
    team: ITeamFullGql;
  }
  | {
    __typename: 'ApiSubscriptionAccept';
    team: ITeamFullGql;
    api: IApiGQL;
    plan: IUsagePlan;
  }
  | {
    __typename: 'ApiSubscriptionReject';
    team: ITeamFullGql;
    api: IApiGQL;
    plan: IUsagePlan;
    message: string;
  }
  | {
    __typename: 'OtoroshiSyncSubscriptionError';
    message: string;
  }
  | {
    __typename: 'OtoroshiSyncApiError';
    message: string;
    api: IApiGQL;
  }
  | {
    __typename: 'ApiKeyRotationInProgress';
    clientId: string;
    apiName: string;
    planName: string;
  }
  | {
    __typename: 'ApiKeyRotationInProgressV2';
    api: IApiGQL;
    subscription: IApiSubscriptionGql
    plan: IUsagePlan;
  }
  | {
    __typename: 'ApiKeyRotationEnded';
    clientId: string;
    apiName: string;
    planName: string;
  }
  | {
    __typename: 'ApiKeyRotationEndedV2';
    api: IApiGQL;
    subscription: IApiSubscriptionGql
    plan: IUsagePlan;
  }
  | {
    __typename: 'NewIssueOpen';
    linkTo: string;
    apiName: string;
  }
  | {
    __typename: 'NewIssueOpenV2';
    api: IApiGQL;
    issue: Issue;
  }
  | {
    __typename: 'CheckoutForSubscription';
    plan: IUsagePlan;
    step: IValidationStepPayment;
    demand: ISubscriptionDemandGQL;
    api: IApiGQL;
  }
  | {
    __typename: 'ApiSubscriptionTransferSuccess';
    subscription: ISubscription;
  };

type NotificationGQL = {
  _id: string
  action: NotificationActionGQL
  _deleted: boolean
  _tenant: ITeamFullGql
  date: number
  notificationType: {
    value: 'AcceptOnly' | 'AcceptOrReject'
  }
  sender: {
    id: string
    name: string
  }
  status: {
    date?: number
    status: 'Pending' | 'Accepted' | 'Rejected'
  }
  team?: {
    _id: string
    name: string
  }
  tenant: {
    id: string
  }

}

type Option = {
  label: string;
  value: string;
};
type ExtraProps = {
  labelKey: string;
  labelKeyAll: string;
  getCount: (data: string) => number
};
const GenericValueContainer = (
  props: ValueContainerProps<Option, true> & { selectProps: ExtraProps }
) => {
  const { translate } = useContext(I18nContext);

  const { getValue, hasValue, selectProps } = props;
  const selectedValues = getValue();
  const nbValues = selectedValues.length;

  const label = translate({ key: selectProps.labelKey, plural: nbValues > 1 })
  return (
    <components.ValueContainer {...props}>
      {!hasValue || nbValues === 0 ? (
        translate(selectProps.labelKeyAll)
      ) : (
        <>
          {label}
          <span className="ms-2 badge badge-custom">{nbValues}</span>
        </>
      )}
    </components.ValueContainer>
  );
};

const VISIBLE_APIS = `
    query AllVisibleApis ($teamId: String, $research: String, $selectedTeam: String, $selectedTag: String, $selectedCategory: String, $limit: Int, $offset: Int, $groupId: String) {
      visibleApis (teamId: $teamId, research: $research, selectedTeam: $selectedTeam, selectedTag: $selectedTag, selectedCategory: $selectedCategory, limit: $limit, offset: $offset, groupId: $groupId) {
        apis {
          api {
            name
            _id
          }
        }
      }
    }`

export const NotificationList = () => {
  const { translate, language } = useContext(I18nContext);
  const { customGraphQLClient, tenant, reloadUnreadNotificationsCount } = useContext(GlobalContext)
  const { openSubMetadataModal, openFormModal, alert, openCustomModal } = useContext(ModalContext)

  const pageSize = 25;
  const [selectAll, setSelectAll] = useState(false);
  const [limit, setLimit] = useState(pageSize);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

  const defaultColumnFilters = [{ "id": "unreadOnly", "value": true }];
  const [searchParams] = useSearchParams();
  const initialFilters = useMemo(() => {
    const f = searchParams.get('filter');
    return f ? JSON.parse(decodeURIComponent(f)) : defaultColumnFilters;
  }, [searchParams]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialFilters)

  const queryClient = useQueryClient();
  const notificationListQuery = useInfiniteQuery({
    queryKey: ['notifications', limit, columnFilters],
    queryFn: ({ pageParam = 0 }) => customGraphQLClient.request<{ myNotifications: NotificationsGQL }>(Services.graphql.getMyNotifications, {
      limit,
      offset: pageParam,
      filterTable: JSON.stringify([...(columnFilters ?? [])])
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const totalFilteredCount = lastPage.myNotifications.totalFiltered;
      const nextOffset = pages.length * pageSize;

      return nextOffset < totalFilteredCount ? nextOffset : undefined;
    }
  })

  useEffect(() => {
    const q = JSON.stringify(columnFilters);
    window.history.replaceState(null, '', `?filter=${q}`);
  }, [columnFilters]);

  const visibleApisRequest = useQuery({
    queryKey: ['apis'],
    queryFn: () => customGraphQLClient.request<{ visibleApis: { apis: [{ api: { _id: string, name: string } }] } }>(
      VISIBLE_APIS,
      {
        limit: -1,
        offset: 0,
      }),
    select: d => d.visibleApis.apis.map(a => a.api)
  })

  const myTeamsRequest = useQuery({
    queryKey: ['myTeams'],
    queryFn: () => Services.myTeams(),
    select: data => isError(data) ? [] : data
  })

  const notificationTypes = [
    { type: "ApiAccess" },
    { type: "ApiSubscription" },
    { type: "ApiSubscriptionReject" },
    { type: "ApiSubscriptionAccept" },
    { type: "OtoroshiSyncSubscriptionError" },
    { type: "OtoroshiSyncApiError" },
    { type: "ApiKeyDeletionInformation" },
    { type: "ApiKeyDeletionInformationV2" },
    { type: "ApiKeyRotationInProgress" },
    { type: "ApiKeyRotationInProgressV2" },
    { type: "ApiKeyRotationEnded" },
    { type: "ApiKeyRotationEndedV2" },
    { type: "TeamInvitation" },
    { type: "ApiKeyRefresh" },
    { type: "ApiKeyRefreshV2" },
    { type: "NewPostPublished" },
    { type: "NewPostPublishedV2" },
    { type: "NewIssueOpen" },
    { type: "NewIssueOpenV2" },
    { type: "NewCommentOnIssue" },
    { type: "NewCommentOnIssueV2" },
    { type: "TransferApiOwnership" },
    { type: "ApiSubscriptionTransferSuccess" },
    { type: "CheckoutForSubscription" },
  ];

  const notificationActionTypes = [
    { value: "AcceptOnly" },
    { value: "AcceptOrReject" },
  ]

  const accept = (notification: string, sub?: CustomSubscriptionData) => {
    Services.acceptNotificationOfTeam(notification, sub)
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
      .then(reloadUnreadNotificationsCount)
  }
  const reject = (notification: string, message?: string) => {
    Services.rejectNotificationOfTeam(notification, message)
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
      .then(reloadUnreadNotificationsCount)
  }
  const handleBulkRead = (e) => {
    const notificationsIds = table.getSelectedRowModel().rows.map(r => r.original._id)
    Services.acceptNotificationOfTeamByBulk(notificationsIds, selectAll)
      .then(() => table.getToggleAllPageRowsSelectedHandler()(e))
      .then(() => setSelectAll(false))
      .then(() => setColumnFilters(defaultColumnFilters))
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
      .then(reloadUnreadNotificationsCount)
  }

  const notificationAriaLabelFormatter = (notif: NotificationGQL): string => {
    const date = formatDistanceToNow(notif.date, { includeSeconds: true, addSuffix: true, locale: getLanguageFns(language) })

    return translate({
      key: 'notifications.page.notification.ariaLabel',
      replacements: [
        translate(`notifications.page.filters.type.${notif.action.__typename}.label`),
        notif.sender.name,
        date
      ]
    })
  }

  const statusFormatter = (status: { date?: number, status: 'Pending' | 'Accepted' | 'Rejected' }) => {
    switch (status.status) {
      case 'Pending':
        return;
      case 'Accepted':
        return (
          <div className='d-flex justify-content-end align-items-center gap-2 color-success'>
            <i className='fas fa-check' />
            {translate("notification.page.status.accepted.label")}
          </div>
        );
      case 'Rejected':
        return (
          <div className='d-flex  justify-content-end align-items-center gap-2 color-danger'>
            <i className='fas fa-ban' />
            {translate("notification.page.status.rejected.label")}
          </div>
        );
    }
  }

  const actionFormatter = (notification: NotificationGQL) => {
    switch (notification.action.__typename) {
      case 'NewPostPublishedV2':
        return (
          <div className='action-container'>
            <div className="d-flex justify-content-end">
              <a
                href={`/${notification.action.api.team._humanReadableId}/${notification.action.api._humanReadableId}/${notification.action.api.currentVersion}/news`}
                onClick={() => notification.status.status === 'Pending' ? accept(notification._id) : {}}
                className="nav_item cursor-pointer bg-info"
                target='_blank'
                title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
                aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              >
                <i className="fas fa-arrow-right" />
              </a>
            </div>
            {notification.status.status === 'Pending' && <button
              type="button"
              className="nav_item cursor-pointer no-bg"
              title={translate('notifications.page.table.read.action.label')}
              aria-label={translate('notifications.page.table.read.action.label')}
              onClick={() => accept(notification._id)}
            >
              <i className="fas fa-times" />
            </button>}
          </div>
        );
      case 'NewIssueOpen':
      case 'NewCommentOnIssue':
        return (
          <div className='action-container'>
            <div className="d-flex justify-content-end">
              <a
                href={notification.action.linkTo}
                onClick={() => notification.status.status === 'Pending' ? accept(notification._id) : {}}
                className="nav_item cursor-pointer bg-info"
                target='_blank'
                title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
                aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              >
                <i className="fas fa-arrow-right" />
              </a>
            </div>
            {notification.status.status === 'Pending' && <button
              type="button"
              className="nav_item cursor-pointer no-bg"
              title={translate('notifications.page.table.read.action.label')}
              aria-label={translate('notifications.page.table.read.action.label')}
              onClick={() => accept(notification._id)}
            >
              <i className="fas fa-times" />
            </button>}
          </div>
        );
      case 'NewIssueOpenV2':
      case 'NewCommentOnIssueV2':
        const api = notification.action.api
        return (
          <div className='action-container'>
            <div className="d-flex justify-content-end">
              <a
                href={`/${api.team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/issues/${notification.action.issue._id}`}
                onClick={() => notification.status.status === 'Pending' ? accept(notification._id) : {}}
                className="nav_item cursor-pointer bg-info"
                target='_blank'
                title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
                aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              >
                <i className="fas fa-arrow-right" />
              </a>
            </div>
            {notification.status.status === 'Pending' && <button
              type="button"
              className="nav_item cursor-pointer no-bg"
              title={translate('notifications.page.table.read.action.label')}
              aria-label={translate('notifications.page.table.read.action.label')}
              onClick={() => accept(notification._id)}
            >
              <i className="fas fa-times" />
            </button>}
          </div>
        );
      case 'ApiSubscription':
        const _demand = notification.action.demand
        const _api = notification.action.api
        const _plan = notification.action.plan
        const _team = notification.action.team
        if (notification.status.status === 'Pending') {
          return (
            <div className='action-container'>
              <div className="d-flex justify-content-end gap-2">
                <button
                  className="nav_item cursor-pointer bg-success"
                  title={translate('Accept')}
                  aria-label={translate('Accept')}
                  onClick={() =>
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
                  <i className="fas fa-check" />
                </button>
                <button
                  className="nav_item cursor-pointer bg-danger"
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
                      onSubmit: ({ message }) => reject(notification._id, message),
                      actionLabel: translate('Send')
                    })
                  }}
                >
                  <i className="fas fa-ban" />
                </button>
              </div>
              <button
                type="button"
                className="nav_item cursor-pointer no-bg"
                disabled={true}
                title={translate('notifications.page.table.read.action.label')}
                aria-label={translate('notifications.page.table.read.action.label')}
                onClick={() => { }}
              >
                <i className="fas fa-times" />
              </button>
            </div>
          );
        } else {
          return (
            <div className="action-container">
              {statusFormatter(notification.status)}
            </div>
          )
        }
      case 'CheckoutForSubscription':
        const _checkoutDemand = notification.action.demand
        return (
          <div className="action-container">
            <div className='d-flex flex-row flex-grow-1 gap-2 justify-content-end'>
              <FeedbackButton
                type="success"
                className="nav_item cursor-pointer ms-1"
                onPress={() => Services.rerunProcess(_checkoutDemand.team._id, _checkoutDemand._id)
                  .then(r => window.location.href = r.checkoutUrl)}
                onSuccess={() => console.debug("success")}
                feedbackTimeout={100}
                disabled={false}
              >
                {translate('Checkout')}
              </FeedbackButton>
            </div>
          </div>
        )
      case 'ApiKeyRefresh':
      case 'ApiKeyRotationInProgress':
      case 'ApiKeyRotationEnded':
        return (
          <div className='action-container'>
            <div className="d-flex justify-content-end">
            </div>
            {notification.status.status === 'Pending' && <button
              type="button"
              className="nav_item cursor-pointer no-bg"
              title={translate('notifications.page.table.read.action.label')}
              aria-label={translate('notifications.page.table.read.action.label')}
              onClick={() => accept(notification._id)}
            >
              <i className="fas fa-times" />
            </button>}
          </div>
        )
      case 'ApiKeyRefreshV2':
      case 'ApiKeyRotationInProgressV2':
      case 'ApiKeyRotationEndedV2':
        return (
          <div className='action-container'>
            <div className="d-flex justify-content-end">
            </div>
            {notification.status.status === 'Pending' && <button
              type="button"
              className="nav_item cursor-pointer no-bg"
              title={translate('notifications.page.table.read.action.label')}
              aria-label={translate('notifications.page.table.read.action.label')}
              onClick={() => accept(notification._id)}
            >
              <i className="fas fa-times" />
            </button>}
          </div>
        );
      default:
        return (
          <div className="action-container">
            <div className='d-flex flex-row flex-grow-1 gap-2 justify-content-end'>
              {notification.notificationType.value === 'AcceptOrReject' && notification.status.status === 'Pending' && <button
                className="nav_item cursor-pointer bg-success"
                title={translate('Accept')}
                aria-label={translate('Accept')}
                onClick={() => accept(notification._id)}
              >
                <i className="fas fa-check" />
              </button>}
              {notification.notificationType.value === 'AcceptOrReject' && notification.status.status === 'Pending' && (
                <button
                  className="nav_item cursor-pointer bg-danger"
                  title={translate('Reject')}
                  aria-label={translate('Reject')}
                  onClick={() => reject(notification._id)}
                >
                  <i className="fas fa-ban" />
                </button>
              )}
              {notification.notificationType.value === 'AcceptOrReject' && notification.status.status !== 'Pending' && (
                statusFormatter(notification.status)
              )}
            </div>
            {notification.status.status === 'Pending' && <button
              type="button"
              className="nav_item cursor-pointer no-bg"
              disabled={notification.notificationType.value === 'AcceptOrReject'}
              title={translate('notifications.page.table.read.action.label')}
              aria-label={translate('notifications.page.table.read.action.label')}
              onClick={() => accept(notification._id)}
            >
              <i className="fas fa-times" />
            </button>}
          </div>
        );
    }
  };

  const notificationFormatter = (notification: NotificationGQL, translate: (params: string | TranslateParams) => string, tenant: ITenant) => {
    switch (notification.action.__typename) {
      case 'CheckoutForSubscription':
        return translate("notif.CheckoutForSubscription");
      case 'ApiAccess':
        return translate({ key: 'notif.api.access', replacements: [notification.action.api.name] })
      case 'TransferApiOwnership':
        return translate({ key: 'notif.api.transfer', replacements: [notification.action.api.name] })
      case 'ApiSubscription':
        const apiSubscriptionDescription = translate({
          key: `notif.api.subscription.${tenant.display}`,
          replacements: [notification.action.plan.customName]
        })
        const _api = notification.action.api
        const _plan = notification.action.plan
        const _team = notification.action.team
        const _demand = notification.action.demand
        const _motivation = notification.action.motivation
        return (
          <>
            {apiSubscriptionDescription}
            <a
              href='#'
              title={translate('notifications.page.subscription.demand.detail.button.label')}
              aria-label={translate('notifications.page.subscription.demand.detail.button.label')}
              className='underline'
              onClick={() => openCustomModal({
                title: translate('notifications.page.subscription.demand.detail.modal.title'),
                content: <div>
                  <div className="notification-subscription-demand-summary">
                    <span className='label'>API</span>
                    <span>{_api.name}</span>
                  </div>
                  <div className="notification-subscription-demand-summary">
                    <span className='label'>Plan/Env</span>
                    <span>{_plan.customName}</span>
                  </div>
                  <div className="notification-subscription-demand-summary">
                    <span className='label'>Message</span>
                    <span>{_motivation}</span>
                  </div>
                  <div className="notification-subscription-demand-summary">
                    <span className='label'>Equipe</span>
                    <span>{_team.name}</span>
                  </div>
                  <div className="notification-subscription-demand-summary">
                    <span className='label'>demandeur</span>
                    <span>{notification.sender.name}</span>
                  </div>
                  <div className="notification-subscription-demand-summary">
                    <span className='label'>Date</span>
                    <span>{notification.date}</span>
                  </div>
                  <div className="accordion" id="accordionExample">
                    <div className="accordion-item">
                      <h2 className="accordion-header">
                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="false" aria-controls="collapseOne">
                          [{translate("notifications.page.subscription.demand.detail.modal.raw.button.label")}]
                        </button>
                      </h2>
                      <div id="collapseOne" className="accordion-collapse collapse" data-bs-parent="#accordionExample">
                        <div className="accordion-body">
                          <pre>{JSON.stringify(_demand.motivation, null, 4)}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>,
                actions: (close) => notification.status.status === 'Pending' ? <>
                  <button className='btn btn-outline-danger' onClick={close}>{translate('Reject')}</button>
                  <button className='btn btn-outline-success' onClick={() => Services.getSubscriptionDemand(notification.team!._id, _demand._id)
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
                    })}>{translate('Accept')}</button>
                </> : <button className="btn btn-outline-info">{translate('Close')}</button>,
                noClose: true
              })}>
              <span className='ms-2'>[{translate("notifications.page.subscription.demand.detail.modal.raw.button.label")}]</span>
            </a>
          </>
        )
      case 'ApiSubscriptionReject':
        const apiSubscriptionRejectDescription = translate({
          key: 'notif.api.demand.reject',
          replacements: [notification.action.plan.customName]
        })
        const _message = notification.action.message
        return (
          <>
            {apiSubscriptionRejectDescription}
            <a
              href='#'
              className='underline'
              aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              onClick={() => alert({
                title: translate('notifications.page.subscription.demand.reject.detail.modal.title'),
                message: <div>
                  <i>{_message}</i>
                </div>
              })}>
              <span className='ms-2'>[{translate('notifications.page.subscription.demand.reject.detail.button.label')}]</span>
            </a>
          </>
        )
      case 'ApiSubscriptionAccept':
        return translate({
          key: 'notif.api.demand.accept',
          replacements: [notification.action.plan.customName]
        })
      case 'ApiKeyDeletionInformation':
        return translate({ key: 'notif.apikey.deletion' })
      case 'ApiKeyDeletionInformationV2': {
        const apiKeyDeletionInformationDescription = translate({ key: 'notif.apikey.deletion' })
        const __subscription = notification.action.subscription        
        return (
          <>
            {apiKeyDeletionInformationDescription}
            <a
              href='#'
              className='underline'
              aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              onClick={() => alert({
                title: translate('notifications.page.subscription.deletion.detail.modal.title'),
                message: <div>
                  {translate("subscription.display.credentials.clientId")} : <i>{__subscription.apiKey.clientId}</i>
                </div>
              })}>
              <span className='ms-2'>[{translate('notifications.page.subscription.demand.reject.detail.button.label')}]</span>
            </a>
          </>
        )
      }

      case 'OtoroshiSyncSubscriptionError':
      case 'OtoroshiSyncApiError':
        return notification.action.message
      case 'ApiKeyRotationInProgress':
        return translate('notif.apikey.rotation.inprogress');
      case 'ApiKeyRotationInProgressV2': {
        const apiKeyRotationInProgressDescription = translate('notif.apikey.rotation.inprogress')
        const __api = notification.action.api
        const __plan = notification.action.plan
        const __team = notification.action.api.team
        const __subscription = notification.action.subscription 
        return (
          <>
            {apiKeyRotationInProgressDescription}
            <a
              href='#'
              className='underline'
              aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              onClick={() => alert({
                title: translate('notifications.page.subscription.deletion.detail.modal.title'),
                message: <SimpleApiKeyCard //@ts-ignore
                  api={__api}
                  plan={__plan}
                  apiTeam={__team as ITeamSimple} //@ts-ignore
                  subscription={__subscription}
                />
              })}>
              <span className='ms-2'>[{translate('notifications.page.subscription.demand.reject.detail.button.label')}]</span>
            </a>
          </>
        )
      }
      case 'ApiKeyRotationEnded':
        return translate('notif.apikey.rotation.ended')
      case 'ApiKeyRotationEndedV2': {
        const apiKeyRotationEndedV2Description =  translate('notif.apikey.rotation.ended')
        const __api = notification.action.api
        const __plan = notification.action.plan
        const __team = notification.action.api.team
        const __subscription = notification.action.subscription 
        return <>
          {apiKeyRotationEndedV2Description}
          <a
            href='#'
            className='underline'
            aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
            title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
            onClick={() => alert({
              title: translate('notifications.page.subscription.deletion.detail.modal.title'),
              message: <SimpleApiKeyCard //@ts-ignore
                api={__api}
                plan={__plan}
                apiTeam={__team as ITeamSimple} //@ts-ignore
                subscription={__subscription}
              />
            })}>
            <span className='ms-2'>[{translate('notifications.page.subscription.demand.reject.detail.button.label')}]</span>
          </a>
        </>
      }
      case 'ApiKeyRefresh':
        return translate('notif.apikey.refresh')
      case 'ApiKeyRefreshV2': {
        const apiKeyRefreshV2Description = translate('notif.apikey.refresh')
        const __api = notification.action.api
        const __plan = notification.action.plan
        const __team = notification.action.api.team
        const __subscription = notification.action.subscription 
        return <>
          {apiKeyRefreshV2Description}
          <a
            href='#'
            className='underline'
            aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
            title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
            onClick={() => alert({
              title: translate('notifications.page.subscription.deletion.detail.modal.title'),
              message: <SimpleApiKeyCard //@ts-ignore
                api={__api}
                plan={__plan}
                apiTeam={__team as ITeamSimple} //@ts-ignore
                subscription={__subscription}
              />
            })}>
            <span className='ms-2'>[{translate('notifications.page.subscription.demand.reject.detail.button.label')}]</span>
          </a>
        </>
      }
      case 'TeamInvitation':
        return translate({
          key: 'notif.team.invitation',
          replacements: [notification.action.team.name]
        })
      case 'NewPostPublished':
        return translate({
          key: 'notif.new.published.post',
          replacements: [notification.action.apiName]
        })
      case 'NewPostPublishedV2':
        return translate({
          key: 'notif.new.published.post',
          replacements: [
            notification.action.api.name]
        })
      case 'NewIssueOpen':
        return translate({
          key: 'notif.issues',
          replacements: [notification.action.apiName]
        })
      case 'NewIssueOpenV2':
        return translate({
          key: 'notif.issues',
          replacements: [notification.action.api.name]
        })
      case 'NewCommentOnIssue':
      case 'NewCommentOnIssueV2':
        return translate('notif.issues.comment')
      case 'ApiSubscriptionTransferSuccess':
        return translate('notif.subscription.transfer.success')
      default:
        return '';

    }
  }

  const getApiFromNotification = (notification: NotificationGQL, apis?: Array<{ _id: string, name: string }>): { _id: string, name: string, currentVersion?: string } | undefined => {
    if (!apis) {
      return;
    }
    switch (notification.action.__typename) {
      case "ApiAccess":
      case "ApiSubscription":
      case "ApiSubscriptionReject":
      case "ApiSubscriptionAccept":
      case "OtoroshiSyncApiError":
      case "ApiKeyDeletionInformationV2":
      case "ApiKeyRotationInProgressV2":
      case "ApiKeyRotationEndedV2":
      case "ApiKeyRefreshV2":
      case "NewPostPublishedV2":
      case "NewIssueOpenV2":
      case "NewCommentOnIssueV2":
      case "TransferApiOwnership":
      case "CheckoutForSubscription":
        const _api = notification.action.api
        return ({ _id: _api._id, name: _api.name, currentVersion: _api.currentVersion })
      case "ApiKeyDeletionInformation":
      case "ApiKeyRotationInProgress":
      case "ApiKeyRotationEnded":
      case "NewPostPublished":
      case "NewIssueOpen":
      case "NewCommentOnIssue":
      case "ApiKeyRefresh":
        const _apiName = notification.action.apiName
        return apis.find(a => a.name === _apiName)
      case "TeamInvitation":
      case "OtoroshiSyncSubscriptionError":
      case "ApiSubscriptionTransferSuccess":
        return;
    }
  }

  const columnHelper = createColumnHelper<NotificationGQL>();
  const columns = [
    columnHelper.display({
      id: 'select',
      meta: { className: "select-cell" },
      cell: ({ row }) => {
        const notification = row.original;
        if (row.getCanSelect())
          return (
            <>
              <input //FIXME: aria-label
                type="checkbox"
                className={classNames('form-check-input select-input')}
                checked={row.getIsSelected() || row.getCanSelect() && selectAll}
                disabled={!row.getCanSelect()}
                onChange={row.getToggleSelectedHandler()}
              />
              <span className={classNames('indicator flex-grow-1 d-flex justify-content-end', { unread: notification.status.status === 'Pending' })} />
            </>
          );
        else
          return <span className={classNames('indicator flex-grow-1 d-flex justify-content-end', { unread: notification.status.status === 'Pending' })}></span>
      }
    }),
    columnHelper.display({
      id: 'api',
      meta: { className: "api-cell" },
      cell: (info) => {
        const notification = info.row.original;
        const api = getApiFromNotification(notification, visibleApisRequest.data)

        if (api)
          return <a href='#' onClick={() => handleSelectChange([{ label: api.name, value: api._id }], 'api')}>
            {api.name}{api.currentVersion ? ` (${api.currentVersion})` : null}
          </a>
        else
          return null;
      }
    }),
    columnHelper.accessor('action.__typename', {
      id: 'type',
      meta: { className: "type-cell" },
      enableColumnFilter: true,
      cell: (info) => {
        const type = info.getValue();
        const label = translate(`notifications.page.filters.type.${type}.label`)
        return (
          <span onClick={() => handleSelectChange([{ label, value: type }], 'type')}
            className={`badge badge-custom-custom`}>
            {label}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'description',
      meta: { className: "description-cell" },
      cell: (info) => {
        return <div className='notification d-flex align-items-center gap-3'>
          <div>
            <div className='notification__description'>
              {notificationFormatter(info.row.original, translate, tenant)}
            </div>
          </div>
        </div>;
      },
    }),
    columnHelper.display({
      id: 'team',
      meta: { className: "team-cell" },
      cell: (info) => {
        const notification = info.row.original;
        const team = notification.team;

        if (team)
          return <a href='#' onClick={() => handleSelectChange([{ label: team.name, value: team._id }], 'team')}>{team.name}</a>
        else
          return null;
      }
    }),
    columnHelper.accessor('sender.name', {
      id: 'sender',
      meta: { className: "sender-cell" },
      enableColumnFilter: true,
      cell: (info) => {
        const sender = info.getValue();
        const isSystem = sender.startsWith('Otoroshi')
        return <div className='sender'>
          {!isSystem && <i className="far fa-face-smile me-1"></i>}
          {sender}
        </div>;
      },
    }),
    columnHelper.display({
      id: 'date',
      enableColumnFilter: false,
      meta: { className: "date-cell" },
      cell: (info) => {
        const notification = info.row.original;
        const date = formatDistanceToNow(notification.date, { includeSeconds: false, addSuffix: true, locale: getLanguageFns(language) })
        return (
          <div className="notification__date">{date}</div>
        )
      },
    }),
    columnHelper.display({
      id: 'action',
      enableColumnFilter: false,
      meta: { className: "action-cell" },
      cell: (info) => {
        const notification = info.row.original;
        return (
          <div className='notification__actions'>{actionFormatter(notification)}</div>
        )
      },
    })
  ]

  const defaultData = useMemo(() => [], [])
  const table = useReactTable({
    data: notificationListQuery.data?.pages.flatMap(
      (page) => page.myNotifications.notifications
    ) ?? defaultData,
    columns: columns,
    getRowId: row => row._id,
    rowCount: notificationListQuery.data?.pages[0].myNotifications.totalFiltered,
    state: {
      pagination,
      //columnFilters,
      // sorting
    },
    onPaginationChange: setPagination,
    // onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    onColumnFiltersChange: setColumnFilters,
    // getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSubRowSelection: true,
    enableRowSelection: row => {
      const notification = row.original;
      return notification.status.status === 'Pending' && notification.notificationType.value === 'AcceptOnly';
    },
  })

  const menuStyle = {
    MenuPortal: (base) => ({ ...base, zIndex: 9999 }),
    menu: (base) => ({
      ...base,
      width: 'max-content',
      minWidth: '100%',
      zIndex: 100,
    }),
    menuList: (base) => ({
      ...base,
      whiteSpace: 'nowrap',
    }),
  };

  const getSelectValue = <T extends object>(id: string, data: Array<T>, labelKey: string, idKey: string): any => {
    const filter = columnFilters.find(f => f.id === id);

    const selectedValues = filter?.value as Array<string> ?? [];
    return data
      .filter(t => selectedValues.includes(t[idKey]))
      .map(t => ({ label: t[labelKey], value: t[idKey] }));
  }

  const handleSelectChange = (data: MultiValue<Option>, id: string) => {
    const filters = columnFilters.filter(f => f.id !== id)

    setColumnFilters([...filters, { id, value: data.map(d => d.value) }])
  }

  const unreadOnly = !!columnFilters.find(f => f.id === 'unreadOnly')?.value as boolean

  const totalByTeams = notificationListQuery.data?.pages[0].myNotifications.totalByTeams
  const totalByApis = notificationListQuery.data?.pages[0].myNotifications.totalByApis
  const totalByNotificationTypes = notificationListQuery.data?.pages[0].myNotifications.totalByNotificationTypes
  const totalSelectable = notificationListQuery.data?.pages[0].myNotifications.totalSelectable ?? 0
  const getTotalForTeam = (team: string) => {
    const total = totalByTeams?.find(total => total.team === team)?.total;
    if (!total) {
      return undefined;
    }
    return total
  }
  const getTotalForApi = (api: string) => {
    const total = totalByApis?.find(total => total.api === api)?.total;
    if (!total) {
      return undefined;
    }
    return total
  }
  const getTotalForNotifType = (type: string) => {
    const total = totalByNotificationTypes?.find(total => total.type === type)?.total;
    if (!total) {
      return undefined;
    }
    return total
  }



  const CustomOption = (props: OptionProps<Option, true> & { selectProps: ExtraProps }) => {
    const { data, innerRef, innerProps } = props;
    const total = props.selectProps.getCount(data.value)

    return (
      <div ref={innerRef} {...innerProps} className="d-flex justify-content-between align-items-center px-3 py-2 cursor-pointer select-menu-item gap-2">
        <span>{data.label}</span>

        {!!total && <span className="badge badge-custom-warning">
          {total}
        </span>}
      </div>
    );
  };

  const clearFilter = (id: string, value: string) => {
    const columnFilterValues = columnFilters.find(c => c.id === id)?.value as Array<string> ?? []
    setColumnFilters([...columnFilters.filter(c => c.id !== id), { id, value: columnFilterValues.filter(v => v !== value) }])
  }

  const displayFilters = () => {
    if (!columnFilters.length) {
      return null
    } else {
      const filterOrder = ['team', 'api', 'type', 'actionType']
      return (
        <div className='mt-2 d-flex flex-wrap flex-row gap-2'>
          {columnFilters
            .sort((a, b) => filterOrder.indexOf(a.id) - filterOrder.indexOf(b.id))
            .flatMap(f => {
              switch (true) {
                case f.id === 'team':
                  return ((f.value as Array<string>).map(value => {
                    const teamName = myTeamsRequest.data?.find(t => t._id === value)?.name;
                    return (
                      <button className='selected-filter d-flex gap-2 align-items-center' onClick={() => clearFilter(f.id, value)}>
                        {teamName}
                        <i className='fas fa-xmark' />
                      </button>
                    )
                  }))
                case f.id === 'api':
                  return ((f.value as Array<string>).map(value => {
                    const teamName = visibleApisRequest.data?.find(t => t._id === value)?.name;
                    return (
                      <button className='selected-filter d-flex gap-2 align-items-center' onClick={() => clearFilter(f.id, value)}>
                        {teamName}
                        <i className='fas fa-xmark' />
                      </button>
                    )
                  }))
                case f.id === 'type':
                  return ((f.value as Array<string>).map(value => {
                    const label = translate(`notifications.page.filters.type.${value}.label`)
                    return (
                      <button className='selected-filter d-flex gap-2 align-items-center' onClick={() => clearFilter(f.id, value)}>
                        {label}
                        <i className='fas fa-xmark' />
                      </button>
                    )
                  }))
                case f.id === 'actionType':
                  return ((f.value as Array<string>).map(value => {
                    const type = notificationActionTypes.find(t => t.value === value)
                    const label = translate(`notifications.page.filters.action.${type?.value}.label`)
                    return (
                      <button className='selected-filter d-flex gap-2 align-items-center' onClick={() => clearFilter(f.id, value)}>
                        {label}
                        <i className='fas fa-xmark' />
                      </button>
                    )
                  }))
              }
            })}
        </div>
      )
    }
  }


  return (
    <div className='flex-grow-1'>
      {/* {notificationListQuery.isLoading && <Spinner />}
      {notificationListQuery.data && ( */}
      <>
        <div className='table-header'>
          <div className='d-flex align-items-center gap-3' aria-live="polite">
            <h1 className="jumbotron-heading" id='notif-label'>
              {translate("notifications.page.table.title")}
            </h1>
          </div>
          <div className='d-flex flex-row justify-content-between align-items-center'>
            <div className='d-flex flex-row gap-3 justify-content-start align-items-center'>
              <Select
                isMulti //@ts-ignore
                components={{ ValueContainer: GenericValueContainer, Option: CustomOption }}
                options={(myTeamsRequest.data ?? []).map(t => ({ label: t.name, value: t._id }))}
                isLoading={myTeamsRequest.isLoading || myTeamsRequest.isPending}
                closeMenuOnSelect={true}
                labelKey={"notifications.page.filters.team.label"}
                labelKeyAll={"notifications.page.filters.all.team.label"}
                getCount={getTotalForTeam}
                classNamePrefix="daikoku-select"
                styles={menuStyle}
                onChange={data => handleSelectChange(data, 'team')}
                value={getSelectValue('team', myTeamsRequest.data ?? [], 'name', '_id')} />
              <Select
                isMulti //@ts-ignore
                components={{ ValueContainer: GenericValueContainer, Option: CustomOption }}
                options={(visibleApisRequest.data ?? []).map(api => ({ label: api.name, value: api._id }))}
                isLoading={visibleApisRequest.isLoading || visibleApisRequest.isPending}
                closeMenuOnSelect={true}
                labelKey={"notifications.page.filters.api.label"}
                labelKeyAll={"notifications.page.filters.all.api.label"}
                getCount={getTotalForApi}
                classNamePrefix="daikoku-select"
                styles={menuStyle}
                onChange={data => handleSelectChange(data, 'api')}
                value={getSelectValue('api', visibleApisRequest.data ?? [], 'name', '_id')} />
              <Select
                isMulti //@ts-ignore
                components={{ ValueContainer: GenericValueContainer, Option: CustomOption }}
                options={notificationTypes.map(v => ({ label: translate(`notifications.page.filters.type.${v.type}.label`), value: v.type }))}
                closeMenuOnSelect={true}
                labelKey={"notifications.page.filters.type.label"}
                labelKeyAll={"notifications.page.filters.all.type.label"}
                getCount={getTotalForNotifType}
                classNamePrefix="daikoku-select"
                styles={menuStyle}
                onChange={data => handleSelectChange(data, 'type')}
                value={getSelectValue('type', notificationTypes, 'label', 'type')} />
              <div className='btn-group' role='group' aria-label={translate('notifications.page.unread.button.group.aria.label')}>
                <button
                  className={classNames('btn btn-outline-secondary', { active: unreadOnly })}
                  aria-pressed={unreadOnly}
                  onClick={() => {
                    const filters = columnFilters.filter(f => f.id !== 'unreadOnly')
                    setColumnFilters([...filters, { id: 'unreadOnly', value: true }])
                  }}>{translate('notifications.page.filters.unread.notifications.label')}
                </button>
                <button
                  className={classNames('btn btn-outline-secondary', { active: !unreadOnly })}
                  aria-pressed={!unreadOnly}
                  onClick={() => {
                    const filters = columnFilters.filter(f => f.id !== 'unreadOnly')
                    setColumnFilters([...filters, { id: 'unreadOnly', value: false }])
                  }}>{translate('notifications.page.filters.all.notifications.label')}
                </button>
              </div>
              <button className='btn btn-outline-secondary' onClick={() => setColumnFilters(defaultColumnFilters)}>
                <i className='fas fa-rotate me-2' />
                {translate('notifications.page.filters.clear.label')}
              </button>
            </div>
            {notificationListQuery.data && <span className='' aria-labelledby="notif-label notif-count" id='notif-count'>
              {translate({
                key: "notifications.page.total.label",
                replacements: [notificationListQuery.data?.pages[0].myNotifications.totalFiltered.toString()],
                plural: notificationListQuery.data?.pages[0].myNotifications.totalFiltered > 1
              })}
            </span>}
          </div>

          {displayFilters()}
        </div>
        {notificationListQuery.isLoading && <Spinner />}
        {notificationListQuery.data && (
          <>
            <div className="notification-table table-rows">
              <div className='select-all-row table-row'>
                <label className='notification-table-header'>
                  <input
                    type="checkbox"
                    aria-label={translate('notifications.page.table.select.all.label')}
                    className='form-check-input'
                    checked={table.getIsAllPageRowsSelected()}
                    onChange={(e) => {
                      if (selectAll)
                        setSelectAll(!selectAll)
                      table.getToggleAllPageRowsSelectedHandler()(e)
                    }}
                  />

                </label>
                {(table.getIsSomeRowsSelected() || table.getIsAllRowsSelected()) ? translate({ key: "notifications.page.table.selected.count.label", plural: (selectAll ? totalSelectable : table.getSelectedRowModel().rows.length) > 1, replacements: [selectAll ? `${totalSelectable}` : `${table.getSelectedRowModel().rows.length}`] }) : null}
                {(!!totalSelectable && (table.getIsSomeRowsSelected() || table.getIsAllRowsSelected()) || selectAll) && (
                  <button className='ms-2 btn btn-sm btn-outline-secondary' onClick={handleBulkRead}>{translate('notifications.page.table.read.bulk.action.label')}</button>
                )}
                {!selectAll && table.getIsAllPageRowsSelected() && table.getSelectedRowModel().rows.length < totalSelectable && (
                  <button className='btn btn-sm btn-outline-secondary ms-3' onClick={() => setSelectAll(true)}>{translate({ key: 'notifications.page.table.select.really.all.label', replacements: [totalSelectable.toLocaleString()] })}</button>
                )}
                {(!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) && <span>{translate('notifications.page.table.header.label.api')}</span>}
                {(!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) && <span>{translate('notifications.page.table.header.label.type')}</span>}
                {(!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) && <span>{translate('notifications.page.table.header.label.description')}</span>}
                {(!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) && <span>{translate('notifications.page.table.header.label.team')}</span>}
                {(!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) && <span>{translate('notifications.page.table.header.label.sender')}</span>}
                {(!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) && <span>{translate('notifications.page.table.header.label.date')}</span>}
                {(!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) && <span>{translate('notifications.page.table.header.label.actions')}</span>}
              </div>
              <ul className='table-rows'>
                {table.getRowModel().rows.map(row => {
                  return (
                    <li key={row.id} tabIndex={-1}>
                      <article className='table-row' aria-label={notificationAriaLabelFormatter(row.original)}>
                        {row.getVisibleCells().map(cell => {
                          return (
                            <div key={cell.id} className={cell.column.columnDef.meta?.className}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </div>
                          )
                        })}
                      </article>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="mt-3 mb-5 d-flex justify-content-center">
              {notificationListQuery.hasNextPage && (
                <FeedbackButton
                  type="primary"
                  className="btn btn-outline-primary a-fake"
                  onPress={() => notificationListQuery.fetchNextPage()}
                  onSuccess={() => console.debug("success")}
                  feedbackTimeout={500}
                  disabled={notificationListQuery.isFetchingNextPage}
                >
                  {translate('notifications.page.table.more.button.label')}
                </FeedbackButton>
              )}
            </div>
          </>
        )}
      </>
      {/* )} */}
    </div>
  );
};
