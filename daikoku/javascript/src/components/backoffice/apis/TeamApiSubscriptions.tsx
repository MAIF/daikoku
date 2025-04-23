import { format, type } from "@maif/react-forms";
import { ColumnFiltersState, createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, PaginationState, SortingState, useReactTable } from "@tanstack/react-table";
import classNames from "classnames";
import { GraphQLClient } from "graphql-request";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import Pagination from 'react-paginate';
import { toast } from "sonner";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { I18nContext, ModalContext } from "../../../contexts";
import { CustomSubscriptionData } from "../../../contexts/modals/SubscriptionMetadataModal";
import * as Services from "../../../services";
import {
  IApi,
  IApiGQL,
  isError,
  ISubscriptionCustomization,
  ITeamSimple,
  IUsagePlan,
  ResponseError
} from "../../../types";
import { Filter, SwitchButton, TableRef } from "../../inputs";
import {
  api as API,
  BeautifulTitle,
  Can,
  formatDate,
  manage
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
  apiKey: {
    clientName: string;
    clientId: string;
    clientSecret: string;
  };
  plan: IUsagePlan;
  team: {
    _id: string;
    name: string;
    type: string;
  };
  createdAt: string;
  validUntil: number;
  api: IApiGQL;
  customName: string;
  enabled: boolean;
  customMetadata?: JSON;
  adminCustomName?: string;
  customMaxPerSecond?: number;
  customMaxPerDay?: number;
  customMaxPerMonth?: number;
  customReadOnly?: boolean;
  tags: Array<string>;
  metadata?: JSON;
  parent?: {
    _id: string;
    adminCustomName: string;
    enabled: boolean;
    validUntil: number;
    api: {
      _id: string;
      name: string;
    };
    plan: {
      _id: string;
      customName: string;
      type: string;
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
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    []
  )
  const tableRef = useRef<TableRef>();

  const { translate, language, Translation } = useContext(I18nContext);
  const { confirm, openFormModal, openSubMetadataModal } =
    useContext(ModalContext);

  const graphqlEndpoint = `${window.location.origin}/api/search`;
  const customGraphQLClient = new GraphQLClient(graphqlEndpoint);
  const subscriptionsQuery = useQuery({
    queryKey: ["subscriptions", filters, columnFilters, sorting],
    queryFn: () => customGraphQLClient.request<{ apiApiSubscriptions: Array<IApiSubscriptionGql> }>(Services.graphql.getApiSubscriptions, {
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
      (row) => row.adminCustomName || row.apiKey.clientName,
      {
        id: "subscription",
        header: translate("Name"),
        meta: { style: { textAlign: "left" } },
        enableColumnFilter: true,
        cell: (info) => {
          const sub = info.row.original;
          if (sub.parent) {
            const title = `<div>
            <strong>${translate("aggregated.apikey.badge.title")}</strong>
            <ul>
              <li>${translate("Api")}: ${sub.parent.api.name}</li>
              <li>${translate("Plan")}: ${sub.parent.plan.customName}</li>
              <li>${translate("aggregated.apikey.badge.apikey.name")}: ${sub.parent.adminCustomName}</li>
            </ul>
          </div>`;
            return (
              <div className="d-flex flex-row justify-content-between">
                <span>{info.getValue()}</span>
                <BeautifulTitle title={title} html>
                  <div className="badge badge-custom">A</div>
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
      header: translate("Plan"),
      meta: { style: { textAlign: "left" } },
      cell: (info) => info.getValue(),
      enableColumnFilter: true,
    }),
    columnHelper.accessor(row => row.team.name, {
      header: translate("Team"),
      meta: { style: { textAlign: "left" } },
      cell: (info) => info.getValue(),
      enableColumnFilter: true,
    }),
    columnHelper.accessor("enabled", {
      header: translate("Enabled"),
      enableColumnFilter: false,
      enableSorting: false,
      meta: { style: { textAlign: "center" } },
      cell: (info) => {
        const sub = info.row.original;
        return (
          <SwitchButton
            disabled={sub.parent && !sub.parent?.enabled}
            ariaLabel={sub.enabled ? translate("subscription.disable.button.label") : translate("subscription.enable.button.label")}
            onSwitch={(value) => {
              return Services.archiveSubscriptionByOwner(
                currentTeam._id,
                sub._id,
                value
              )
                .then(() => queryClient.invalidateQueries({ queryKey: ["subscriptions"] }))
                .then(() => tableRef.current?.update())
            }}
            checked={sub.enabled}
          />
        );
      },
    }),
    columnHelper.accessor("createdAt", {
      enableColumnFilter: false,
      header: translate("Created at"),
      meta: { style: { textAlign: "left" } },
      cell: (info) => {
        const date = info.getValue();
        if (!!date) {
          return formatDate(date, translate('moment.locale'), translate('moment.date.format.without.hours'));
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
        if (!!date) {
          return formatDate(date, translate('moment.locale'), translate('moment.date.format'));
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
          <div className="btn-group">
            <BeautifulTitle title={translate("Update metadata")}>
              <button
                key={`edit-meta-${sub._id}`}
                type="button"
                className="btn btn-sm btn-outline-primary me-1"
                aria-label={translate("Update metadata")}
                onClick={() => updateMeta(sub)}
              >
                <i className="fas fa-pen" />
              </button>
            </BeautifulTitle>
            <BeautifulTitle title={translate("Refresh secret")}>
              <button
                key={`edit-meta-${sub._id}`}
                type="button"
                className="btn btn-sm btn-outline-primary btn-outline-danger me-1"
                aria-label={translate("Refresh secret")}
                onClick={() => regenerateSecret(sub)}
              >
                <i className="fas fa-sync" />
              </button>
            </BeautifulTitle>
            <BeautifulTitle title={translate("api.delete.subscription")}>
              <button
                key={`edit-meta-${sub._id}`}
                type="button"
                className="btn btn-sm btn-outline-primary btn-outline-danger"
                aria-label={translate("api.delete.subscription")}
                onClick={() => deleteSubscription(sub)}
              >
                <i className="fas fa-trash-alt"></i>
              </button>
            </BeautifulTitle>
          </div>
        );
      },
    }),
  ];

  const defaultData = useMemo(() => [], [])
  const table = useReactTable({
    data: subscriptionsQuery.data ?? defaultData,
    columns: columns,
    rowCount: subscriptionsQuery.data?.length,
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
  })

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translate("Subscriptions")}`;
  }, []);

  const updateMeta = (sub: IApiSubscriptionGql) => {
    return openSubMetadataModal({
      save: (updates: CustomSubscriptionData) => {
        Services.updateSubscription(currentTeam, { ...sub, ...updates }).then(
          () => {
            queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
          }
        );
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
      Services.regenerateApiKeySecret(currentTeam._id, sub._id),
    onSuccess: () => {
      toast.success(translate("secret.refresh.success"));
      tableRef.current?.update();
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: ResponseError) => {
      toast.error(translate(e.error));
    },
  });

  const regenerateSecret = (sub: IApiSubscriptionGql) => {
    const plan = sub.plan;

    confirm({
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
        regenerateApiKeySecret.mutate(sub);
      }
    });
  };

  const deleteApiSubscription = useMutation({
    mutationFn: (sub: IApiSubscriptionGql) =>
      Services.deleteApiSubscription(sub.team._id, sub._id, "promotion"),
    onSuccess: () => {
      toast.success(translate("api.delete.subscription.deleted"));
      tableRef.current?.update();
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: ResponseError) => {
      toast.error(translate(e.error));
    },
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
        deleteApiSubscription.mutate(sub);
      }
    });
  };

  return (
    <Can I={manage} a={API} dispatchError={true} team={currentTeam}>
      <div className="d-flex flex-row justify-content-start align-items-center mb-2">
        <button
          className="btn btn-sm btn-outline-info"
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
          {" "}
          {translate("Filter")}{" "}
        </button>
        {!!filters && (
          <div
            className="clear cursor-pointer ms-1"
            onClick={() => setFilters(undefined)}
          >
            <i className="far fa-times-circle me-1" />
            <Translation i18nkey="clear filter">clear filter</Translation>
          </div>
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
            {table.getRowModel().rows.map(row => {
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
          // forcePage={page => table.setPageIndex(page)}
          activeClassName={'active'} />
      </div>
    </Can>
  );
};
