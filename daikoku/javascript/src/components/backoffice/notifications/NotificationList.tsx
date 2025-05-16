import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnFiltersState, createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, PaginationState, SortingState, useReactTable } from '@tanstack/react-table';
import classNames from 'classnames';
import { formatDistanceToNow } from 'date-fns';
import { useContext, useMemo, useState } from 'react';
import Select, { components, MultiValue, OptionProps, ValueContainerProps } from 'react-select';
import Check from 'react-feather/dist/icons/check';
import X from 'react-feather/dist/icons/x';

import { constraints, format, type } from '@maif/react-forms';
import { useNavigate } from 'react-router-dom';
import { I18nContext, ModalContext, TranslateParams, useUserBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import { CustomSubscriptionData } from '../../../contexts/modals/SubscriptionMetadataModal';
import * as Services from '../../../services';
import { isError, ISubscriptionDemand, ITesting } from '../../../types';
import { getLanguageFns, Spinner } from '../../utils';
import { FeedbackButton } from '../../utils/FeedbackButton';

type NotificationColumnMeta = {
  className: string;
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
      return translate({ key: 'notif.apikey.deletion', replacements: [notification.action.clientId!, notification.action.api!.name] })
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
          notification.action.api!.name,
          notification.action.plan!.customName]
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

  }
}

type NotificationsGQL = {
  notifications: Array<NotificationGQL>
  total: number,
  totalFiltered: number,
  totalByTypes: Array<{ type: string, total: number }>,
  totalByNotificationTypes: Array<{ type: string, total: number }>,
  totalByTeams: Array<{ team: string, total: number }>,
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
  team: {
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
  labelSingular: string;
  labelAll: string;
  getCount: (data: string) => number
};
const GenericValueContainer = (
  props: ValueContainerProps<Option, true> & { selectProps: ExtraProps }
) => {
  const { getValue, hasValue, selectProps } = props;
  const selectedValues = getValue();
  const nbValues = selectedValues.length;

  return (
    <components.ValueContainer {...props}>
      {!hasValue || nbValues === 0 ? (
        selectProps.labelAll
      ) : (
        <>
          {`${selectProps.labelSingular}${nbValues > 1 ? 's' : ''}`}{" "}
          <span className="ms-2 badge badge-custom">{nbValues}</span>
        </>
      )}
    </components.ValueContainer>
  );
};

type TypedColumnFilter =
  | { id: 'team' | 'team' | 'notificationType'; value: Array<string> }
  | { id: 'notificationType'; value: 'AcceptOnly' | 'RejectOnly' };

export const NotificationList = () => {
  useUserBackOffice();
  const { translate, language } = useContext(I18nContext);
  const { customGraphQLClient } = useContext(GlobalContext)
  const { openSubMetadataModal, openFormModal, alert } = useContext(ModalContext)

  const navigate = useNavigate();

  const pageSize = 10;


  const [limit, setLimit] = useState(pageSize);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    [{ "id": "unreadOnly", "value": true }]
  )

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

  const myTeamsRequest = useQuery({
    queryKey: ['myTeams'],
    queryFn: () => Services.myTeams(),
    select: data => isError(data) ? [] : data
  })

  const notificationTypes = [
    { type: "ApiAccess", label: "Accès à une API", variant: "success" },
    { type: "ApiSubscription", label: "Nouvelle souscription", variant: "success" },
    { type: "ApiSubscriptionDemand", label: "Nouvelle souscription", variant: "success" },
    { type: "ApiSubscriptionReject", label: "Souscription refusée", variant: "danger" },
    { type: "ApiSubscriptionAccept", label: "Souscription acceptée", variant: "info" },
    { type: "OtoroshiSyncSubscriptionError", label: "Erreur de synchro (souscription)", variant: "danger" },
    { type: "OtoroshiSyncApiError", label: "Erreur de synchro (API)", variant: "danger" },
    { type: "ApiKeyDeletionInformation", label: "Suppression de clé API", variant: "warning" },
    { type: "ApiKeyRotationInProgress", label: "Rotation de clé en cours", variant: "warning" },
    { type: "ApiKeyRotationEnded", label: "Rotation de clé terminée", variant: "success" },
    { type: "TeamInvitation", label: "Invitation dans une équipe", variant: "info" },
    { type: "ApiKeyRefresh", label: "Clé API rafraîchie", variant: "info" },
    { type: "NewPostPublished", label: "Nouveau post publié", variant: "info" },
    { type: "NewIssueOpen", label: "Nouvelle issue", variant: "warning" },
    { type: "NewCommentOnIssue", label: "Nouveau commentaire", variant: "info" },
    { type: "TransferApiOwnership", label: "Transfert de propriété d'API", variant: "warning" },
    { type: "ApiSubscriptionTransferSuccess", label: "Transfert de souscription réussi", variant: "success" },
    { type: "CheckoutForSubscription", label: "Paiement pour souscription", variant: "info" },
  ];

  const notificationActionTypes = [
    { value: "AcceptOnly", label: "Information note" },
    { value: "AcceptOrReject", label: "Action needed" },
  ]

  const accept = (notification: string, sub?: CustomSubscriptionData) => {
    Services.acceptNotificationOfTeam(notification, sub)
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
  }
  const reject = (notification: string, message?: string) => {
    Services.rejectNotificationOfTeam(notification, message)
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
  }
  const handleBulkRead = () => {
    const notificationsIds = table.getSelectedRowModel().rows.map(r => r.original._id)
    Services.acceptNotificationOfTeamByBulk(notificationsIds)
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
  }

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
            onClick={() => accept(notification._id)}
          >
            <i className="fas fa-check" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-success"
            onClick={() => {
              accept(notification._id);
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
          switch (notification.action.__typename) {
            case 'ApiSubscriptionDemand':
              return (
                <div className='d-flex flex-row flex-grow-1 gap-2 justify-content-end'>
                  <button
                    className="nav_item cursor-pointer"
                    title={translate('Accept')}
                    aria-label={translate('Accept')}
                    onClick={() => //@ts-ignore
                      Services.getSubscriptionDemand(notification.team._id, notification.action.demand!.id)
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
                <div className='d-flex flex-row flex-grow-1'>
                  <div className='d-flex flex-wrap flex-grow-1'>
                    {notification.action.message}
                  </div>
                  <div className='d-flex flex-row flex-nowrap'>
                    <a
                      className="btn btn-outline-success btn-sm me-1"
                      style={{ height: '30px' }}
                      title={translate('Accept')}
                      aria-label={translate('Accept')}
                      onClick={() => accept(notification._id)}
                    >
                      <i className="fas fa-check" />
                    </a>
                  </div>

                </div>
              )
            case 'CheckoutForSubscription':
              return (
                <div className='d-flex flex-row flex-grow-1 justify-content-between'>
                  <div>{notification.action.apiName}/{notification.action.planName}</div>
                  <div className='d-flex flex-row flex-nowrap'>
                    <FeedbackButton
                      type="success"
                      className="ms-1" //@ts-ignore
                      onPress={() => Services.rerunProcess(notification.action.team?._id!, notification.action.demand!.id)
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
                    onClick={() => accept(notification._id)}
                  >
                    <i className="fas fa-check" />
                  </a>
                  {notification.notificationType.value === 'AcceptOrReject' && (
                    <a
                      className="btn btn-outline-danger btn-sm"
                      href="#"
                      title={translate('Reject')}
                      aria-label={translate('Reject')}
                      onClick={() => reject(notification._id)}
                    >
                      <i className="fas fa-times" />
                    </a>
                  )}
                </div>
              );
          }
        case 'Accepted':
          return (
            <div className='d-flex gap-2 justify-content-end align-items-center'>
              <i className="fas fa-check" />
              {formatDistanceToNow(notification.date, { includeSeconds: true, addSuffix: true, locale: getLanguageFns(language) })}
            </div>
          );
        case 'Rejected':
          return (
            <div className='d-flex gap-2 justify-content-end align-items-center'>
              <i className="fas fa-xmark" />
              {formatDistanceToNow(notification.date, { includeSeconds: true, addSuffix: true, locale: getLanguageFns(language) })}
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
        return <input
          type="checkbox"
          className='form-check-input'
          checked={row.getIsSelected()}
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
        return <div className={classNames('notification d-flex align-items-center gap-3', { unread: notification.status.status === 'Pending' })}>
          <div>
            <div className='notification__identities'>
              <a href='#' onClick={() => handleSelectChange([{ label: team.name, value: team._id }], 'team')}>{team.name}</a> / {notification.action.apiName ?? notification.action.api?.name ?? 'unknown Api'}</div>
            <div className='notification__description'>{notificationFormatter(notification, translate)}</div>
          </div>
          {notification.action.__typename === 'ApiSubscriptionDemand' && (
            <i
              className="ms-4 far fa-eye cursor-pointer"
              onClick={() => alert({
                title: 'About Subscription demand',
                message: <div>
                  <i>{notification.action.motivation}</i>
                  <pre>{JSON.stringify(notification.action.demand!.motivation, null, 4)}</pre>
                </div>
              })} />
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
        return <span onClick={() => handleSelectChange([{ label: type!.label, value: type!.type }], 'type')} className={`badge badge-custom-${type?.variant ?? 'custom'}`}>{type?.label ?? _type}</span>;
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
      id: 'dateOrAction',
      enableColumnFilter: false,
      meta: { className: "date-cell" },
      cell: (info) => {
        const notification = info.row.original;
        const date = formatDistanceToNow(notification.date, { includeSeconds: true, addSuffix: true, locale: getLanguageFns(language) })
        return (
          <>
            <div className="notification__date">{date}</div>
            <div className='notification__actions'>{actionFormatter(notification)}</div>
          </>
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
  const totalByTypes = notificationListQuery.data?.pages[0].myNotifications.totalByTypes
  const totalByNotificationTypes = notificationListQuery.data?.pages[0].myNotifications.totalByNotificationTypes
  const getTotalForTeam = (team: string) => {
    const total = totalByTeams?.find(total => total.team === team)?.total;
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
      <div ref={innerRef} {...innerProps} className="d-flex justify-content-between align-items-center px-3 py-2 cursor-pointer select-menu-item">
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
      const filterOrder = ['team', 'type', 'actionType']
      return (
        <div className='mt-2 d-flex flex-wrap flex-row gap-2' role="list">
          {columnFilters
            .sort((a, b) => filterOrder.indexOf(a.id) - filterOrder.indexOf(b.id))
            .flatMap(f => {
              switch (true) {
                case f.id === 'team':
                  return ((f.value as Array<string>).map(value => {
                    const teamName = myTeamsRequest.data?.find(t => t._id === value)?.name;
                    return (
                      <div className='selected-filter d-flex gap-2 align-items-center' role="listitem" onClick={() => clearFilter(f.id, value)}>
                        {teamName}
                        <i className='fas fa-xmark' />
                      </div>
                    )
                  }))
                case f.id === 'type':
                  return ((f.value as Array<string>).map(value => {
                    const type = notificationTypes.find(t => t.type === value)
                    return (
                      <div className='selected-filter d-flex gap-2 align-items-center' role="listitem" onClick={() => clearFilter(f.id, value)}>
                        {type?.label}
                        <i className='fas fa-xmark' />
                      </div>
                    )
                  }))
                case f.id === 'actionType':
                  return ((f.value as Array<string>).map(value => {
                    const type = notificationActionTypes.find(t => t.value === value)
                    return (
                      <div className='selected-filter d-flex gap-2 align-items-center' role="listitem" onClick={() => clearFilter(f.id, value)}>
                        {type?.label}
                        <i className='fas fa-xmark' />
                      </div>
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
            <span className='filters-label'>filtres</span>
            <Select
              isMulti //@ts-ignore
              components={{ ValueContainer: GenericValueContainer, Option: CustomOption }}
              options={(myTeamsRequest.data ?? []).map(t => ({ label: t.name, value: t._id }))}
              isLoading={myTeamsRequest.isLoading || myTeamsRequest.isPending}
              closeMenuOnSelect={true}
              labelSingular="Team"
              labelAll="All teams"
              getCount={getTotalForTeam}
              classNamePrefix="daikoku-select"
              styles={menuStyle}
              onChange={data => handleSelectChange(data, 'team')}
              value={getSelectValue('team', myTeamsRequest.data ?? [], 'name', '_id')} />
            <Select
              isMulti //@ts-ignore
              components={{ ValueContainer: GenericValueContainer, Option: CustomOption }}
              options={notificationTypes.map(v => ({ label: v.label, value: v.type }))}
              closeMenuOnSelect={true}
              labelSingular="Type"
              labelAll="All types"
              getCount={getTotalForNotifType}
              styles={menuStyle}
              onChange={data => handleSelectChange(data, 'type')}
              value={getSelectValue('type', notificationTypes, 'label', 'type')} />
            <Select
              isMulti //@ts-ignore
              components={{ ValueContainer: GenericValueContainer, Option: CustomOption }}
              options={notificationActionTypes.map(({ value, label }) => ({ label, value }))}
              closeMenuOnSelect={true}
              labelSingular="Action type"
              labelAll="All action types"
              getCount={getTotalForType}
              styles={menuStyle}
              onChange={data => handleSelectChange(data, 'actionType')}
              value={getSelectValue('actionType', notificationActionTypes, 'label', 'value')} />
            <div className='btn-group' role='group' aria-label='unread notif ?'>
              <button
                className={classNames('btn btn-outline-secondary', { active: !unreadOnly })}
                onClick={() => {
                  const filters = columnFilters.filter(f => f.id !== 'unreadOnly')
                  setColumnFilters([...filters, { id: 'unreadOnly', value: false }])
                }}>all</button>
              <button
                className={classNames('btn btn-outline-secondary', { active: unreadOnly })}
                onClick={() => {
                  const filters = columnFilters.filter(f => f.id !== 'unreadOnly')
                  setColumnFilters([...filters, { id: 'unreadOnly', value: true }])
                }}>unread only</button>
            </div>
          </div>
          <button className='btn btn-outline-secondary' onClick={() => setColumnFilters([])}>
            <i className='fas fa-rotate me-2' />
            reset filters
          </button>
        </div>

        {displayFilters()}
      </div>
      {notificationListQuery.isLoading && <Spinner />}
      {notificationListQuery.data && (
        <>
          <div className="notification-table">
            <div className='table-header'>
              <div className='table-title d-flex align-items-center gap-3'>Notifications <span className='badge badge-custom-warning'>{notificationListQuery.data?.pages[0].myNotifications.totalFiltered}</span></div>
              <div className="table-description">Overview of your latest notifications ans system update</div>
            </div>
            <div className='select-all-row'>
              <label>
                <input
                  type="checkbox"
                  className='form-check-input me-3'
                  checked={table.getIsAllPageRowsSelected()}
                  onChange={table.getToggleAllPageRowsSelectedHandler()}
                />
                {table.getIsSomeRowsSelected() ? `${table.getSelectedRowModel().rows.length} row(s) selected` : 'select all'}
              </label>
              {table.getIsSomeRowsSelected() && (
                <button className='ms-2 btn btn-sm btn-outline-secondary' onClick={handleBulkRead}>mark as read</button>
              )}
            </div>
            <div className='table-rows'>
              {table.getRowModel().rows.map(row => {
                return (
                  <div key={row.id} className='table-row'>
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
                  </div>
                )
              })}
            </div>
          </div>
          <div className="mt-3 mb-5 d-flex justify-content-center">
            {notificationListQuery.hasNextPage && (
              <button
                className='btn btn-outline-primary'
                onClick={() => notificationListQuery.fetchNextPage()}
                disabled={notificationListQuery.isFetchingNextPage}
              >
                {notificationListQuery.isFetchingNextPage ? 'Chargement…' : 'Charger plus'}
              </button>
            )}
          </div></>
      )}
    </div>
  );
};
