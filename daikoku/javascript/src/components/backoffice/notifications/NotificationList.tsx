import React, { PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Select, { components, ValueContainerProps } from 'react-select';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ColumnFiltersState, createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, PaginationState, SortingState, useReactTable } from '@tanstack/react-table';

import * as Services from '../../../services';
import { getLanguageFns, Spinner } from '../../utils';
import { SimpleNotification } from './SimpleNotification';
import { I18nContext, TranslateParams } from '../../../contexts';
import { ModalContext, useUserBackOffice } from '../../../contexts';
import { ITesting, isError } from '../../../types';
import { GlobalContext } from '../../../contexts/globalContext';
import classNames from 'classnames';

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
          notification.action.api?.name ?? 'unknown api (2)']
      })
    case 'NewIssueOpen':
      return translate({
        key: 'issues.notification',
        replacements: [
          notification.action.api?.name ?? 'on connais pas cette api (1)']
      })
    case 'NewCommentOnIssue':
      return translate({
        key: 'issues.comment.notification',
        replacements: [
          notification.action.api!.name]
      })

  }
}

type NotificationsGQL = {
  notifications: Array<NotificationGQL>
  total: number,
  totalFiltered: number,
  totalByTypes: Array<{ type: string, total: number }>,
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

type CustomValueContainerProps = {
  getValue: () => []
}

type Option = {
  label: string;
  value: string;
};
type ExtraProps = {
  labelSingular: string;
  labelAll: string;
};
const GenericValueContainer = (
  props: ValueContainerProps<Option, true> & { selectProps: ExtraProps }
) => {
  const { getValue, hasValue, selectProps } = props;
  const selectedValues = getValue();
  const nbValues = selectedValues.length;

  if (!hasValue || nbValues === 0) {
    return (
      <components.ValueContainer {...props}>
        {selectProps.labelAll}
      </components.ValueContainer>
    );
  }

  return (
    <components.ValueContainer {...props}>
      {`${selectProps.labelSingular}${nbValues > 1 ? 's' : ''}`}{" "}
      <span className="ms-2 badge badge-custom">{nbValues}</span>
    </components.ValueContainer>
  );
};

export const NotificationList = () => {
  useUserBackOffice();
  const { translate, Translation, language } = useContext(I18nContext);
  const { customGraphQLClient } = useContext(GlobalContext)

  const pageSize = 10;


  const [limit, setLimit] = useState(pageSize);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    []
  )

  const notificationListQuery = useInfiniteQuery({
    queryKey: ['notifications', limit],
    queryFn: ({ pageParam = 0 }) => customGraphQLClient.request<{ myNotifications: NotificationsGQL }>(Services.graphql.getMyNotifications, {
      limit,
      offset: pageParam
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const notifications = lastPage.myNotifications.notifications;
      const totalCount = lastPage.myNotifications.total;
      const nextOffset = pages.length * pageSize;
      console.debug({ nextOffset, pages, pageSize, totalCount })
      return nextOffset < totalCount ? nextOffset : undefined;
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
    { value: "AcceptOrreject", label: "Action needed" },
  ]

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
        return <div className={classNames('notification', { unread: notification.status.status === 'Pending' })}>
          <div>
            <div className='notification__identities'>{notification.team.name} / {notification.action.api?.name ?? 'rien'}</div>
            <div className='notification__description'>{notificationFormatter(notification, translate)}</div>
          </div>
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
        return <span className={`badge badge-custom-${type?.variant ?? 'custom'}`}>{type?.label ?? _type}</span>;
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
    columnHelper.accessor('date', {
      id: 'date',
      enableColumnFilter: false,
      meta: { className: "date-cell" },
      cell: (info) => {
        const date = info.getValue();
        return formatDistanceToNow(date, { includeSeconds: true, addSuffix: true, locale: getLanguageFns(language) })
      },
    })
  ]

  const defaultData = useMemo(() => [], [])
  const table = useReactTable({
    data: notificationListQuery.data?.pages.flatMap(
      (page) => page.myNotifications.notifications
    ) ?? defaultData,
    columns: columns,
    rowCount: notificationListQuery.data?.pages[0].myNotifications.total,
    state: {
      pagination,
      columnFilters,
      sorting
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSubRowSelection: true,
    enableRowSelection: row => {
      const notification = row.original;
      return notification.status.status === 'Pending' && notification.notificationType.value === 'AcceptOnly';
    },
  })

  if (notificationListQuery.isLoading) {
    return (
      <Spinner />
    )
  } else if (notificationListQuery.data) {

    return (
      <div className='flex-grow-1'>
        <div className='filters-container d-flex flex-row justify-content-between'>
          <div className='d-flex flex-row gap-3 justify-content-start align-items-center'>
            <span className='filters-label'>filtres</span>
            {myTeamsRequest.data && <Select
              isMulti //@ts-ignore
              components={{ ValueContainer: GenericValueContainer }}
              options={myTeamsRequest.data.map(t => ({ label: t.name, value: t._id }))}
              isLoading={myTeamsRequest.isLoading || myTeamsRequest.isPending}
              closeMenuOnSelect={false}
              labelSingular="Team"
              labelAll="All teams" />}
            <Select
              isMulti //@ts-ignore
              components={{ ValueContainer: GenericValueContainer }}
              options={notificationTypes.map(v => ({ label: v.label, value: v.type }))}
              closeMenuOnSelect={false}
              labelSingular="Type"
              labelAll="All types" />
            <Select
              isMulti //@ts-ignore
              components={{ ValueContainer: GenericValueContainer }}
              options={notificationActionTypes.map(({ value, label }) => ({ label, value }))}
              closeMenuOnSelect={false}
              labelSingular="Action type"
              labelAll="All action types" />
            <button className='btn btn-outline-success'>unread only</button>
          </div>
          <button className='btn btn-outline-secondary'>
            <i className='fas fa-rotate me-2' />
            reset filters
          </button>

        </div>
        <div className="notification-table">
          <div className='table-header'>
            <div className='table-title'>Notifications</div>
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
              select all
            </label>
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
        </div>
      </div>
    );
  }

};
