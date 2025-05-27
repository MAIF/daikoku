import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnFiltersState, createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, PaginationState, SortingState, useReactTable } from '@tanstack/react-table';
import classNames from 'classnames';
import { formatDistanceToNow } from 'date-fns';
import { useContext, useMemo, useState } from 'react';
import Select, { components, MultiValue, OptionProps, ValueContainerProps } from 'react-select';

import { constraints, format, type } from '@maif/react-forms';
import { Link, useNavigate } from 'react-router-dom';
import { I18nContext, ModalContext, TranslateParams } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import { CustomSubscriptionData } from '../../../contexts/modals/SubscriptionMetadataModal';
import * as Services from '../../../services';
import { isError, ISubscriptionDemand, ITesting } from '../../../types';
import { getLanguageFns, Spinner } from '../../utils';
import { FeedbackButton } from '../../utils/FeedbackButton';
import { Option as opt } from '../../utils';

type NotificationColumnMeta = {
  className?: string;
};
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends unknown, TValue> extends NotificationColumnMeta { }
}

const notificationFormatter = (notification: NotificationGQL, translate: (params: string | TranslateParams) => string) => {
  switch (notification.action.__typename) {
    case 'CheckoutForSubscription':
      return translate("notif.CheckoutForSubscription");
    case 'ApiAccess':
      return translate({ key: 'notif.api.access', replacements: [notification.action.api!.name] })
    case 'TransferApiOwnership':
      return translate({ key: 'notif.api.transfer', replacements: [notification.action.api!.name] })
    case 'ApiSubscriptionDemand':
      return translate({
        key: 'notif.api.subscription',
        replacements: [notification.action.api!.name, notification.action.api!.currentVersion, notification.action.plan!.customName]
      })
    case 'ApiSubscriptionReject':
      return translate({
        key: 'notif.api.demand.reject',
        replacements: [notification.action.api!.name, notification.action.api!.currentVersion, notification.action.plan!.customName]
      })
    case 'ApiSubscriptionAccept':
      return translate({
        key: 'notif.api.demand.accept',
        replacements: [notification.action.api!.name, notification.action.api!.currentVersion, notification.action.plan!.customName]
      })
    case 'ApiKeyDeletionInformation':
      return translate({ key: 'notif.apikey.deletion', replacements: [notification.action.clientId!, notification.action.apiName!] })
    case 'OtoroshiSyncSubscriptionError':
    case 'OtoroshiSyncApiError':
      return notification.action.message!
    case 'ApiKeyRotationInProgress':
      return translate({
        key: 'notif.apikey.rotation.inprogress',
        replacements: [
          notification.action.clientId!,
          notification.action.api!.name,
          notification.action.plan!.customName,]
      })
    case 'ApiKeyRotationEnded':
      return translate({
        key: 'notif.apikey.rotation.ended',
        replacements: [
          notification.action.parentSubscriptionId!.apiKey.clientId,
          notification.action.api!.name,
          notification.action.plan!.customName,]
      })
    case 'ApiKeyRefresh':
      return translate({
        key: 'notif.apikey.refresh',
        replacements: [
          notification.action.subscriptionName!,
          notification.action.apiName!,
          notification.action.planName!]
      })
    case 'TeamInvitation':
      return translate({
        key: 'team.invitation',
        replacements: [
          notification.sender.name,
          notification.action.team!.name]
      })
    case 'NewPostPublished':
      return translate({
        key: 'new.published.post.notification',
        replacements: [
          notification.sender.name,
          notification.action.team!.name,
          notification.action.apiName ?? "no named api"]
      })
    case 'NewIssueOpen':
      return translate({
        key: 'issues.notification',
        replacements: [
          notification.action.apiName ?? "no named api"]
      })
    case 'NewCommentOnIssue':
      return translate({
        key: 'issues.comment.notification',
        replacements: [
          notification.action.apiName ?? "no named api"]
      })
    default:
      return '';

  }
}

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

type NotificationGQL = {
  _id: string
  action: {
    message?: string
    motivation?: string
    api?: {
      _id: string
      name: string
      currentVersion: string
      testing: ITesting
    }
    apiName?: string
    subscriptionName?: string
    planName?: string
    linkTo?: string
    clientId?: string
    __typename: string
    team?: LimitedTeam
    plan?: {
      _id: string
      customName: string
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
    demand?: ISubscriptionDemand
  }
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
  const { customGraphQLClient, connectedUser } = useContext(GlobalContext)
  const { openSubMetadataModal, openFormModal, alert } = useContext(ModalContext)

  const pageSize = 25;


  const [selectAll, setSelectAll] = useState(false);
  const [limit, setLimit] = useState(pageSize);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })
  // const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const defaultColumnFilters = [{ "id": "unreadOnly", "value": true }];
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(defaultColumnFilters)

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
    { type: "ApiAccess", variant: "success" },
    { type: "ApiSubscriptionDemand", variant: "success" },
    { type: "ApiSubscriptionReject", variant: "danger" },
    { type: "ApiSubscriptionAccept", variant: "info" },
    { type: "OtoroshiSyncSubscriptionError", variant: "danger" },
    { type: "OtoroshiSyncApiError", variant: "danger" },
    { type: "ApiKeyDeletionInformation", variant: "warning" },
    { type: "ApiKeyRotationInProgress", variant: "warning" },
    { type: "ApiKeyRotationEnded", variant: "success" },
    { type: "TeamInvitation", variant: "info" },
    { type: "ApiKeyRefresh", variant: "info" },
    { type: "NewPostPublished", variant: "info" },
    { type: "NewIssueOpen", variant: "warning" },
    { type: "NewCommentOnIssue", variant: "info" },
    { type: "TransferApiOwnership", variant: "warning" },
    { type: "ApiSubscriptionTransferSuccess", variant: "success" },
    { type: "CheckoutForSubscription", variant: "info" },
  ];

  const notificationActionTypes = [
    { value: "AcceptOnly" },
    { value: "AcceptOrReject" },
  ]

  const accept = (notification: string, sub?: CustomSubscriptionData) => {
    Services.acceptNotificationOfTeam(notification, sub)
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
  }
  const reject = (notification: string, message?: string) => {
    Services.rejectNotificationOfTeam(notification, message)
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
  }
  const handleBulkRead = (e) => {
    const notificationsIds = table.getSelectedRowModel().rows.map(r => r.original._id)
    Services.acceptNotificationOfTeamByBulk(notificationsIds, selectAll)
      .then(() => table.getToggleAllPageRowsSelectedHandler()(e))
      .then(() => setSelectAll(false))
      .then(() => setColumnFilters(defaultColumnFilters))
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
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

  const actionFormatter = (notification: NotificationGQL) => {
    const { status, date } = notification.status;
    if (
      status === 'Pending' &&
      (notification.action.__typename === 'NewIssueOpen' ||
        notification.action.__typename === 'NewCommentOnIssue')
    ) {
      return (
        <div className='d-flex flex-row flex-grow-1 gap-2 justify-content-end'>
          <button
            type="button"
            className="nav_item cursor-pointer me-1"
            title={translate('Accept')}
            aria-label={translate('Accept')}
            onClick={() => accept(notification._id)}
          >
            <i className="fas fa-check" />
          </button>
          <Link
            to={notification.action.linkTo!}
            className="nav_item cursor-pointer"
            target='_blank'
            title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
            aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
          >
            <i className="fas fa-eye" />
          </Link>
        </div>
      );
    } else {
      switch (notification.action.__typename) {
        case 'ApiSubscriptionDemand':
          return (
            <div className='d-flex flex-row flex-grow-1 gap-2 justify-content-end'>
              <button
                className="nav_item cursor-pointer"
                title={translate('Accept')}
                aria-label={translate('Accept')}
                onClick={() =>
                  Services.getSubscriptionDemand(notification.team!._id, notification.action.demand!._id) //todo: check si id ou _id pour la deman
                    .then(demand => {
                      if (!isError(demand)) {
                        openSubMetadataModal({
                          save: (sub) => accept(notification._id, sub),
                          api: notification.action.api?._id,
                          plan: notification.action.plan!._id,
                          team: notification.action.team,
                          notification: notification,
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
                className="nav_item cursor-pointer"
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
                <i className="fas fa-xmark" />
              </button>

            </div>
          );
        case 'ApiSubscriptionReject':
          return (
            <div className='d-flex flex-row flex-grow-1 gap-2 justify-content-end'>
              <button
                className="nav_item cursor-pointer"
                style={{ height: '30px' }}
                title={translate('Accept')}
                aria-label={translate('Accept')}
                onClick={() => accept(notification._id)}
              >
                <i className="fas fa-check" />
              </button>
            </div>
          )
        case 'CheckoutForSubscription':
          return (
            <div className='d-flex flex-row flex-grow-1 gap-2 justify-content-end'>
              <FeedbackButton //fixme: aria-label
                type="success"
                className="nav_item cursor-pointer ms-1" //@ts-ignore
                onPress={() => Services.rerunProcess(notification.action.team?._id!, notification.action.demand!.id)
                  .then(r => window.location.href = r.checkoutUrl)}
                onSuccess={() => console.debug("success")}
                feedbackTimeout={100}
                disabled={false}
              >{translate('Checkout')}</FeedbackButton>
            </div>
          )
        default:
          return (
            <div className='d-flex flex-row flex-grow-1 gap-2 justify-content-end'>
              <button
                className="nav_item cursor-pointer"
                title={translate('Accept')}
                aria-label={translate('Accept')}
                onClick={() => accept(notification._id)}
              >
                <i className="fas fa-check" />
              </button>
              {notification.notificationType.value === 'AcceptOrReject' && (
                <button
                  className="nav_item cursor-pointer"
                  title={translate('Reject')}
                  aria-label={translate('Reject')}
                  onClick={() => reject(notification._id)}
                >
                  <i className="fas fa-times" />
                </button>
              )}
            </div>
          );
      }
    }
  };

  const columnHelper = createColumnHelper<NotificationGQL>();
  const columns = [
    columnHelper.display({
      id: 'select',
      meta: { className: "select-cell" },
      cell: ({ row }) => {
        return <input //FIXME: aria-label
          type="checkbox"
          className='form-check-input'
          checked={row.getIsSelected() || row.getCanSelect() && selectAll}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
        />;
      }
    }),
    columnHelper.display({
      id: 'description',
      meta: { className: "description-cell" },
      cell: (info) => {
        const notification = info.row.original;
        const team = notification.team;
        const api = opt(notification.action.apiName ?? notification.action.api?.name)
          .flatMap(name => opt(visibleApisRequest.data?.find(d => d.name === name))).getOrNull()

        return <div className={classNames('notification d-flex align-items-center gap-3', { unread: notification.status.status === 'Pending' })}>
          <div>
            <div className='notification__identities'>
              {!!team && <a href='#' onClick={() => handleSelectChange([{ label: team.name, value: team._id }], 'team')}>{team.name}</a>}
              {!team && <span>{connectedUser.name}</span>}
              {opt(api).map(a => <span>/ <a href='#' onClick={() => handleSelectChange([{ label: a.name, value: a._id }], 'api')}>{a.name}</a></span>).getOrElse(<></>)}</div>
            <div className='notification__description'>{notificationFormatter(notification, translate)}</div>
          </div>
          {notification.action.__typename === 'ApiSubscriptionDemand' && (
            <button

              title={translate('notifications.page.subscription.demand.detail.button.label')}
              aria-label={translate('notifications.page.subscription.demand.detail.button.label')}
              className='nav_item cursor-pointer'
              onClick={() => alert({
                title: translate('notifications.page.subscription.demand.detail.modal.title'),
                message: <div>
                  <div>{translate('notifications.page.subscription.demand.detail.summary.label')} :</div>
                  <i>{notification.action.motivation}</i>
                  <div className="accordion" id="accordionExample">
                    <div className="accordion-item">
                      <h2 className="accordion-header">
                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="false" aria-controls="collapseOne">
                          {translate("notifications.page.subscription.demand.detail.modal.raw.button.label")}
                        </button>
                      </h2>
                      <div id="collapseOne" className="accordion-collapse collapse" data-bs-parent="#accordionExample">
                        <div className="accordion-body">
                          <pre>{JSON.stringify(notification.action.demand!.motivation, null, 4)}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              })}>
              <i className="far fa-eye cursor-pointer" />
            </button>
          )}
          {notification.action.__typename === 'ApiSubscriptionReject' && (
            <button
              className='nav_item cursor-pointer'
              aria-label={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              title={translate('notifications.page.subscription.demand.reject.detail.button.label')}
              onClick={() => alert({
                title: translate('notifications.page.subscription.demand.reject.detail.modal.title'),
                message: <div>
                  <i>{notification.action.message}</i>
                </div>
              })}>
              <i className="far fa-circle-question cursor-pointer" />
            </button>
          )}
        </div>;
      },
    }),
    columnHelper.accessor('action.__typename', {
      id: 'type',
      meta: { className: "type-cell" },
      enableColumnFilter: true,
      cell: (info) => {
        const _type = info.getValue();
        const type = notificationTypes.find(t => t.type === _type)
        const label = translate(`notifications.page.filters.type.${type?.type}.label`)
        return (
          <span onClick={() => handleSelectChange([{ label, value: type!.type }], 'type')}
            className={`badge badge-custom-${type?.variant ?? 'custom'}`}>
            {label}
          </span>
        );
      },
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
        const date = formatDistanceToNow(notification.date, { includeSeconds: true, addSuffix: true, locale: getLanguageFns(language) })
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
          <div className='notification__actions'>{notification.status.status === 'Pending' ? actionFormatter(notification) : null}</div>
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
  const totalByTypes = notificationListQuery.data?.pages[0].myNotifications.totalByTypes
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
  const getTotalForType = (type: string) => {
    const total = totalByTypes?.find(total => total.type === type)?.total;
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
                    const type = notificationTypes.find(t => t.type === value)
                    const label = translate(`notifications.page.filters.type.${type?.type}.label`)
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
      <div className='filters-container '>
        <div className='d-flex flex-row justify-content-between'>
          <div className='d-flex flex-row gap-3 justify-content-start align-items-center'>
            <span className='filters-label'>{translate('notifications.page.filters.label')}</span>
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
              styles={menuStyle}
              onChange={data => handleSelectChange(data, 'type')}
              value={getSelectValue('type', notificationTypes, 'label', 'type')} />
            <Select
              isMulti //@ts-ignore
              components={{ ValueContainer: GenericValueContainer, Option: CustomOption }}
              options={notificationActionTypes.map(({ value }) => ({ label: translate(`notifications.page.filters.action.${value}.label`), value }))}
              closeMenuOnSelect={true}
              labelKey={"notifications.page.filters.action.label"}
              labelKeyAll={"notifications.page.filters.all.action.label"}
              getCount={getTotalForType}
              styles={menuStyle}
              onChange={data => handleSelectChange(data, 'actionType')}
              value={getSelectValue('actionType', notificationActionTypes, 'label', 'value')} />
            <div className='btn-group' role='group' aria-label={translate('notifications.page.unread.button.group.aria.label')}>
              <button
                className={classNames('btn btn-outline-secondary', { active: !unreadOnly })}
                aria-pressed={!unreadOnly}
                onClick={() => {
                  const filters = columnFilters.filter(f => f.id !== 'unreadOnly')
                  setColumnFilters([...filters, { id: 'unreadOnly', value: false }])
                }}>{translate('notifications.page.filters.all.notifications.label')}
              </button>
              <button
                className={classNames('btn btn-outline-secondary', { active: unreadOnly })}
                aria-pressed={unreadOnly}
                onClick={() => {
                  const filters = columnFilters.filter(f => f.id !== 'unreadOnly')
                  setColumnFilters([...filters, { id: 'unreadOnly', value: true }])
                }}>{translate('notifications.page.filters.unread.notifications.label')}
              </button>
            </div>
          </div>
          <button className='btn btn-outline-secondary' onClick={() => setColumnFilters(defaultColumnFilters)}>
            <i className='fas fa-rotate me-2' />
            {translate('notifications.page.filters.clear.label')}
          </button>
        </div>

        {displayFilters()}
      </div>
      {notificationListQuery.isLoading && <Spinner />}
      {notificationListQuery.data && (
        <>
          <div className="notification-table">
            <div className='table-header'>
              <div className='d-flex align-items-center gap-3' aria-live="polite">
                <div className="table-title" id='notif-label'>
                  {translate("notifications.page.table.title")}
                </div>
                <span className='badge badge-custom-warning' aria-labelledby="notif-label notif-count" id='notif-count'>
                  {notificationListQuery.data?.pages[0].myNotifications.totalFiltered}
                </span>
              </div>
              <div className="table-description">{translate("notifications.page.table.description")}</div>
            </div>
            <div className='select-all-row'>
              <label>
                <input
                  type="checkbox"
                  className='form-check-input me-3'
                  checked={table.getIsAllPageRowsSelected()}
                  onChange={(e) => {
                    if (selectAll)
                      setSelectAll(!selectAll)
                    table.getToggleAllPageRowsSelectedHandler()(e)
                  }}
                />

                {(table.getIsSomeRowsSelected() || table.getIsAllRowsSelected()) ? translate({ key: "notifications.page.table.selected.count.label", plural: (selectAll ? totalSelectable : table.getSelectedRowModel().rows.length) > 1, replacements: [selectAll ? `${totalSelectable}` : `${table.getSelectedRowModel().rows.length}`] }) : translate("notifications.page.table.select.all.label")}
              </label>
              {(!!totalSelectable && (table.getIsSomeRowsSelected() || table.getIsAllRowsSelected()) || selectAll) && (
                <button className='ms-2 btn btn-sm btn-outline-secondary' onClick={handleBulkRead}>{translate('notifications.page.table.read.bulk.action.label')}</button>
              )}
              {!selectAll && table.getIsAllPageRowsSelected() && table.getSelectedRowModel().rows.length < totalSelectable && (
                <button className='btn btn-sm btn-outline-secondary ms-3' onClick={() => setSelectAll(true)}>{translate({ key: 'notifications.page.table.select.really.all.label', replacements: [totalSelectable.toLocaleString()] })}</button>
              )}
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
                className="btn btn-outline-primary"
                onPress={() => notificationListQuery.fetchNextPage()}
                onSuccess={() => console.debug("success")}
                feedbackTimeout={100}
                disabled={notificationListQuery.isFetchingNextPage}
              >{translate('notifications.page.table.more.button.label')}</FeedbackButton>
            )}
          </div></>
      )}
    </div>
  );
};
