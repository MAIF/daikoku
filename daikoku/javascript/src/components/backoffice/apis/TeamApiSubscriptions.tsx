import { type } from "@maif/react-forms";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnFiltersState, createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, PaginationState, SortingState, useReactTable } from "@tanstack/react-table";
import classNames from "classnames";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Pagination from '../../utils/Pagination';

import { Link, Menu, RefreshCcw } from "lucide-react";
import { I18nContext, ModalContext } from "../../../contexts";
import { GlobalContext } from "../../../contexts/globalContext";
import { CustomSubscriptionData } from "../../../contexts/modals/SubscriptionMetadataModal";
import * as Services from "../../../services";
import {
  IApi,
  IApiGQL,
  ISubscriptionCustomization,
  ITeamSimple,
  IUsagePlan,
  ResponseError
} from "../../../types";
import { Filter, TableRef } from "../../inputs";
import {
  api as API,
  BeautifulTitle,
  Can,
  formatDate,
  manage,
  Spinner
} from "../../utils";

type TeamApiSubscriptionsProps = {
  api: IApi;
  currentTeam: ITeamSimple;
};
type SubscriptionsFilter = {
  metadata: Array<{ key: string; value: string }>;
  tags: Array<string>;
  clientIds: Array<string>;
};
export interface IApiSubscriptionGql extends ISubscriptionCustomization {
  _id: string;
  plan: IUsagePlan;
  team: {
    _id: string;
    name: string;
    type: string;
  };
  createdAt: string;
  validUntil?: number;
  api: IApiGQL;
  customName: string;
  enabled: boolean;
  state: 'active' | 'blocked';
  customMetadata?: JSON;
  adminCustomName?: string;
  customMaxPerSecond?: number;
  customMaxPerDay?: number;
  customMaxPerMonth?: number;
  customReadOnly?: boolean;
  tags: Array<string>;
  metadata?: JSON;
  keyring?: {
    _id: string;
    customName: string | null;
    subscriptionsCount: number;
    apiKey: {
      clientName: string;
    };
  };
}

interface IApiSubscriptionGqlWithUsage extends IApiSubscriptionGql {
  lastUsage?: number;
}

export const TeamApiSubscriptions = ({
  api,
  currentTeam,
}: TeamApiSubscriptionsProps) => {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<SubscriptionsFilter>();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    []
  )
  const tableRef = useRef<TableRef>(undefined);

  const { translate, Translation } = useContext(I18nContext);
  const { customGraphQLClient } = useContext(GlobalContext);
  const { confirm, openFormModal, openSubMetadataModal } =
    useContext(ModalContext);

  const subscriptionsQuery = useQuery({
    queryKey: ["subscriptions", filters, columnFilters, sorting, pagination],
    queryFn: () => customGraphQLClient.request<{ apiApiSubscriptions: { subscriptions: Array<IApiSubscriptionGql>, total: number } }>(Services.graphql.getApiSubscriptions, {
      apiId: api._id,
      teamId: currentTeam._id,
      version: api.currentVersion,
      filterTable: JSON.stringify([...(columnFilters ?? []), ...Object.entries(filters ?? {}).map(([id, value]) => ({ id, value }))]),
      sortingTable: JSON.stringify(sorting ?? []),
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    }),
    select: d => d.apiApiSubscriptions
  });

  const columnHelper = createColumnHelper<IApiSubscriptionGqlWithUsage>();
  const columns = [
    columnHelper.accessor(
      (row) => row.adminCustomName || row.keyring?.apiKey.clientName || '',
      {
        id: "subscription",
        header: translate("Name"),
        meta: { style: { textAlign: "left" } },
        enableColumnFilter: true,
        cell: (info) => {
          const sub = info.row.original;
          if ((sub.keyring?.subscriptionsCount ?? 0) > 1) {
            const title = `<div>
            <strong>${translate("aggregated.apikey.badge.title")}</strong>
            <ul>
              <li>${translate("aggregated.apikey.badge.keyring.name")}: ${sub.keyring?.customName ?? sub.keyring?.apiKey.clientName ?? ''}</li>
            </ul>
          </div>`;
            return (
              <div className="d-flex flex-row justify-content-between align-items-center">
                <span>{info.getValue()}</span>
                <BeautifulTitle title={title} html>
                  <div className="badge --primary">
                    <Link />
                  </div>
                </BeautifulTitle>
              </div>
            );
          }

          return (
            <span>{info.getValue()}</span>
          );
        },
      }
    ),
    columnHelper.accessor(row => row.plan.customName, {
      id: "plan",
      header: translate("Plan"),
      meta: { style: { textAlign: "left" } },
      cell: (info) => info.getValue(),
      enableColumnFilter: true,
    }),
    columnHelper.accessor(row => row.team.name, {
      id: "team",
      header: translate("Team"),
      meta: { style: { textAlign: "left" } },
      cell: (info) => info.getValue(),
      enableColumnFilter: true,
    }),
    columnHelper.display({
      header: translate("Enabled"),
      enableColumnFilter: false,
      enableSorting: false,
      meta: { style: { textAlign: "center" } },
      cell: (info) => {
        const sub = info.row.original;
        return <span className={classNames("badge --state d-flex align-items-center gap-2", {
          "--success": sub.enabled && sub.state === 'active',
          "--danger": !sub.enabled || sub.state === 'blocked',
        })}>
          {(sub.enabled && sub.state === "active") && translate('subscription.enable.label')}
          {(sub.state === "blocked") && translate('subscription.blocked.label')}
          {(!sub.enabled && sub.state === "active") && translate('subscription.disable.label')}

        </span>
      },
    }),
    columnHelper.accessor("createdAt", {
      enableColumnFilter: false,
      header: translate("Created at"),
      meta: { style: { textAlign: "left" } },
      cell: (info) => {
        const date = info.getValue();
        if (date) {
          return formatDate(date, translate('date.locale'), translate('date.format.without.hours'));
        }
        return translate("N/A");
      },
    }),
    columnHelper.accessor("lastUsage", {
      enableColumnFilter: false,
      header: translate("apisubscription.lastUsage.label"),
      meta: { style: { textAlign: "left" } },
      cell: (info) => {
        const date = info.getValue();
        if (date) {
          return formatDate(date, translate('date.locale'), translate('date.format'));
        }
        return translate("N/A");
      },
    }),
    columnHelper.display({
      header: translate("Actions"),
      meta: { style: { textAlign: "center", width: "120px" } },
      cell: (info) => {
        const sub = info.row.original;

        return (
          <Can I={manage} a={API} team={currentTeam}>
            <button className="btn --ghost --small --icon-only dropdown" aria-label={translate('subscription.actions.aria.label')}>
              <Menu
                className="cursor-pointer dropdown-menu-button"
                style={{ fontSize: '18px' }}
                data-bs-toggle="dropdown"
                aria-expanded="false"
                id={`dropdown-${sub._id}`}
              />
              <div
                className="dropdown-menu dropdown-menu-end"
                aria-labelledby={`dropdown-${sub._id}`}
                style={{ zIndex: 1 }}
              >
                <button
                  className="dropdown-item cursor-pointer"
                  onClick={() => updateMeta(sub)
                  }
                >
                  {translate("Update metadata")}
                </button>
                <div className="dropdown-divider" />
                {api.state !== 'blocked' && <span
                  className="dropdown-item cursor-pointer danger"
                  onClick={() => toggleApiSubscriptionState(sub)}
                >
                  {sub.state === 'active' ? translate("subscription.disable.button.label") : translate("subscription.enable.button.label")}
                </span>}
                {api.state !== 'blocked' && <span
                  className="dropdown-item cursor-pointer danger"
                  onClick={() => regenerateSecret(sub)}
                >
                  {translate("Refresh secret")}
                </span>}
                <button
                  className="dropdown-item cursor-pointer danger"
                  onClick={() => deleteSubscription(sub)}
                >
                  {translate("api.delete.subscription")}
                </button>
              </div>
            </button>
          </Can>
        )
      },
    }),
  ];


  const defaultData = useMemo(() => [], [])
  const table = useReactTable({
    data: subscriptionsQuery.data?.subscriptions ?? defaultData,
    columns: columns,
    rowCount: subscriptionsQuery.data?.total,
    state: {
      pagination,
      columnFilters,
      sorting
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    onColumnFiltersChange: (updater) => {
      const newFilters = typeof updater === 'function' ? updater(columnFilters) : updater
      setColumnFilters(newFilters)
      setPagination(prev => ({ ...prev, pageIndex: 0 })) // 👈 reset
    },
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translate("Subscriptions")}`;
  }, [currentTeam.name, translate]);

  const updateMeta = (sub: IApiSubscriptionGql) => {
    return openSubMetadataModal({
      save: (updates: CustomSubscriptionData) => {
        const toastId = toast.loading(translate("loading"));
        Services.updateSubscription(currentTeam, { ...sub, ...updates })
          .then(
            () => {
              queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
            }
          ).
          then(() => toast.success(translate("api.subscription.update.success"), { id: toastId }));
      },
      api: sub.api._id,
      plan: sub.plan._id,
      team: sub.team,
      subscription: sub,
      creationMode: false,
    });
  };

  const regenerateApiKeySecret = useMutation({
    mutationFn: (sub: IApiSubscriptionGql) =>
      Services.regenerateApiKeySecret(currentTeam._id, sub.keyring!._id),
    onSuccess: () => {
      tableRef.current?.update();
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    // onError: (e: ResponseError) => {
    //   toast.error(translate(e.error));
    // },
  });

  const toggleApiSubscriptionState = (sub: IApiSubscriptionGql) => {
    if (api.state !== 'blocked')
      return Services.archiveSubscriptionByOwner(
        currentTeam._id,
        sub._id,
        sub.state !== 'active'
      )
        .then(() => queryClient.invalidateQueries({ queryKey: ["subscriptions"] }))
        .then(() => tableRef.current?.update())
  }

  const regenerateSecret = (sub: IApiSubscriptionGql) => {
    const plan = sub.plan;
    if (api.state === 'blocked')
      return

    return confirm({
      message: translate({
        key: "secret.refresh.confirm",
        replacements: [
          sub.team.name,
          plan.customName,
        ],
      }),
      okLabel: translate("Yes"),
      cancelLabel: translate("No"),
    }).then((ok) => {
      if (ok) {
        const toastId = toast.loading(translate("loading"));
        regenerateApiKeySecret.mutateAsync(sub)
          .then(() => toast.success(translate("secret.refresh.success"), { id: toastId }))
          .catch((e: ResponseError) => toast.error(translate(e.error), { id: toastId }));

      }
    });
  };

  const deleteApiSubscription = useMutation({
    mutationFn: (sub: IApiSubscriptionGql) =>
      Services.deleteApiSubscription(sub.team._id, sub._id),
    onSuccess: () => {
      tableRef.current?.update();
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    // onError: (e: ResponseError) => {
    //   toast.error(translate(e.error));
    // },
  });
  const deleteSubscription = (sub: IApiSubscriptionGql) => {
    confirm({
      title: translate("api.delete.subscription.form.title"),
      message: translate({
        key: "api.delete.subscription.message",
        replacements: [
          sub.team.name,
          sub.plan.customName,
        ],
      }),
      okLabel: translate("Yes"),
      cancelLabel: translate("No"),
    }).then((ok) => {
      if (ok) {
        const toastId = toast.loading(translate("loading"));
        deleteApiSubscription.mutateAsync(sub)
          .then(() => toast.success(translate("api.delete.subscription.deleted"), { id: toastId }))
          .catch((e: ResponseError) => toast.error(translate(e.error), { id: toastId }));
      }
    });
  };

  return (
    <Can I={manage} a={API} dispatchError={true} team={currentTeam}>
      <div className="d-flex flex-row justify-content-start align-items-center gap-2 mb-2">
        <button
          className="btn --tertiary"
          onClick={() =>
            openFormModal({
              actionLabel: translate("Filter"),
              onSubmit: (data) => {
                setFilters(data);
                queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
              },
              schema: {
                metadata: {
                  type: type.object,
                  label: translate("Filter metadata"),
                },
                tags: {
                  type: type.string,
                  label: translate("Filter tags"),
                  array: true,
                },
                clientIds: {
                  type: type.string,
                  array: true,
                  label: translate("Filter Client Ids"),
                },
              },
              title: translate("Filter data"),
              value: filters,
            })
          }
        >
          {translate("Filter")}
        </button>
        {!!filters && (
          <button
            className="btn --secondary"
            onClick={() => setFilters(undefined)}
          >
            <RefreshCcw size={16} />
            <Translation i18nkey="clear filter">clear filter</Translation>
          </button>
        )}
      </div>
      <div className="col-12">
        <table className="reactTableV7">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  return (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      className={classNames({
                        '--sort-asc': header.column.getIsSorted() === 'asc',
                        '--sort-desc': header.column.getIsSorted() === 'desc',
                      })}>
                      {header.isPlaceholder ? null : (
                        <div onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </div>
                      )}
                      {header.column.getCanFilter() && <div className='my-2'>
                        <Filter column={header.column} table={table} />
                      </div>}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {subscriptionsQuery.isLoading && (
              <tr>
                <td colSpan={1000}>
                  <Spinner />
                </td>
              </tr>
            )
            }
            {!subscriptionsQuery.isLoading && table.getRowModel().rows.map(row => {
              return (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => {
                    return (
                      <td key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
        <Pagination
          previousLabel={translate('Previous')}
          nextLabel={translate('Next')}
          breakLabel={'...'}
          breakClassName={'break'}
          pageCount={table.getPageCount()}
          marginPagesDisplayed={1}
          pageRangeDisplayed={5}
          onPageChange={(page) => table.setPageIndex(page.selected)}
          containerClassName={'pagination'}
          pageClassName={'page-selector'}
          forcePage={table.getState().pagination.pageIndex}
          // forcePage={page => table.setPageIndex(page)}
          activeClassName={'active'} />
      </div>
    </Can>
  );
};
