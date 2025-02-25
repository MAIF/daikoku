import { getApolloContext } from "@apollo/client";
import { format, type } from "@maif/react-forms";
import { createColumnHelper } from "@tanstack/react-table";
import { useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { I18nContext, ModalContext } from "../../../contexts";
import { CustomSubscriptionData } from "../../../contexts/modals/SubscriptionMetadataModal";
import * as Services from "../../../services";
import {
  IApi,
  isError,
  ISubscriptionCustomization,
  ITeamSimple,
  IUsagePlan,
  ResponseError
} from "../../../types";
import { SwitchButton, Table, TableRef } from "../../inputs";
import {
  api as API,
  BeautifulTitle,
  Can,
  formatDate,
  manage,
  Option,
  Spinner,
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
type LimitedPlan = {
  _id: string;
  customName?: string;
  type: string;
};
interface IApiSubscriptionGql extends ISubscriptionCustomization {
  _id: string;
  apiKey: {
    clientName: string;
    clientId: string;
    clientSecret: string;
  };
  plan: LimitedPlan;
  team: {
    _id: string;
    name: string;
    type: string;
  };
  createdAt: string;
  validUntil: number;
  api: {
    _id: string;
  };
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
  const { client } = useContext(getApolloContext());
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<SubscriptionsFilter>();
  const tableRef = useRef<TableRef>();

  const { translate, language, Translation } = useContext(I18nContext);
  const { confirm, openFormModal, openSubMetadataModal } =
    useContext(ModalContext);

  const plansQuery = useQuery({
    queryKey: ["plans"],
    queryFn: () =>
      Services.getAllPlanOfApi(api.team, api._id, api.currentVersion),
  });
  const subscriptionsQuery = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () =>
      client!
        .query<{ apiApiSubscriptions: Array<IApiSubscriptionGql> }>({
          query: Services.graphql.getApiSubscriptions,
          fetchPolicy: "no-cache",
          variables: {
            apiId: api._id,
            teamId: currentTeam._id,
            version: api.currentVersion,
          },
        })
        .then(({ data: { apiApiSubscriptions } }) => {
          if (
            !filters ||
            (!filters.tags.length &&
              !Object.keys(filters.metadata).length &&
              !filters.clientIds.length)
          ) {
            return apiApiSubscriptions;
          } else {
            const filterByMetadata = (subscription: IApiSubscriptionGql) => {
              const meta = {
                ...(subscription.metadata || {}),
                ...(subscription.customMetadata || {}),
              };

              return (
                !Object.keys(meta) ||
                !filters.metadata.length ||
                filters.metadata.every((item) => {
                  const value = meta[item.key];
                  return value && value.includes(item.value);
                })
              );
            };

            const filterByTags = (subscription: IApiSubscriptionGql) => {
              return filters.tags.every((tag) =>
                subscription.tags.includes(tag)
              );
            };

            const filterByClientIds = (subscription: IApiSubscriptionGql) => {
              return filters.clientIds.includes(subscription.apiKey.clientId);
            };

            return apiApiSubscriptions
              .filter(filterByMetadata)
              .filter(filterByTags)
              .filter(filterByClientIds);
          }
        })
        .then((apiApiSubscriptions) =>
          Services.getSubscriptionsLastUsages(
            api.team,
            subscriptionsQuery.data?.map((s) => s._id) || []
          ).then((lastUsages) => {
            if (isError(lastUsages)) {
              return subscriptionsQuery.data as IApiSubscriptionGqlWithUsage[];
            } else {
              return (apiApiSubscriptions ?? []).map(
                (s) =>
                  ({
                    ...s,
                    lastUsage: lastUsages.find((u) => u.subscription === s._id)
                      ?.date,
                  }) as IApiSubscriptionGqlWithUsage
              );
            }
          })
        ),
  });

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translate("Subscriptions")}`;
  }, []);

  useEffect(() => {
    if (api && subscriptionsQuery.data) {
      tableRef.current?.update();
    }
  }, [api, subscriptionsQuery.data]);
  useEffect(() => {
    tableRef.current?.update();
  }, [filters]);

  const columnHelper = createColumnHelper<IApiSubscriptionGqlWithUsage>();
  const columns = (usagePlans) => [
    columnHelper.accessor(
      (row) => row.adminCustomName || row.apiKey.clientName,
      {
        id: "adminCustomName",
        header: translate("Name"),
        meta: { style: { textAlign: "left" } },
        filterFn: (row, _, value) => {
          const sub = row.original;

          const displayed: string = sub.adminCustomName || sub.apiKey.clientName;

          return displayed
            .toLocaleLowerCase()
            .includes(value.toLocaleLowerCase());
        },
        sortingFn: "basic",
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
    columnHelper.accessor("plan", {
      header: translate("Plan"),
      meta: { style: { textAlign: "left" } },
      cell: (info) =>
        Option(usagePlans.find((pp) => pp._id === info.getValue()._id))
          .map((p: IUsagePlan) => p.customName)
          .getOrNull(),
      filterFn: (row, columnId, value) => {
        const displayed: string = Option(
          usagePlans.find((pp) => pp._id === row.original.plan._id)
        )
          .map((p: IUsagePlan) => p.customName)
          .getOrElse("");

        return displayed
          .toLocaleLowerCase()
          .includes(value.toLocaleLowerCase());
      },
    }),
    columnHelper.accessor("team", {
      header: translate("Team"),
      meta: { style: { textAlign: "left" } },
      cell: (info) => info.getValue().name,
      filterFn: (row, columnId, value) => {
        const displayed: string = row.original.team.name;

        return displayed
          .toLocaleLowerCase()
          .includes(value.toLocaleLowerCase());
      },
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
            ariaLabel="enable subscription"
            onSwitch={() =>
              Services.archiveSubscriptionByOwner(
                currentTeam._id,
                sub._id,
                !sub.enabled
              ).then(() => {
                tableRef.current?.update();
                queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
              })
            }
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
          return formatDate(date, language);
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
          return formatDate(date, language);
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
      value: (plansQuery.data as Array<IUsagePlan>).find(
        (p) => sub.plan._id === p._id
      )!,
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
          plan.customName ? plan.customName : plan.type,
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
          sub.plan.customName ? sub.plan.customName : sub.plan.type,
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

  if (plansQuery.isLoading) {
    return <Spinner />;
  } else if (plansQuery.data && !isError(plansQuery.data)) {
    const usagePlans = plansQuery.data;

    const options = usagePlans.flatMap((plan) => {
      return [
        ...(plan.otoroshiTarget?.apikeyCustomization?.customMetadata.map(
          ({ key }) => key
        ) || []),
        ...Object.keys(plan.otoroshiTarget?.apikeyCustomization?.metadata || {}),
      ];
    });

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
                },
                schema: {
                  metadata: {
                    type: type.object,
                    format: format.form,
                    label: translate("Filter metadata"),
                    array: true,
                    schema: {
                      key: {
                        type: type.string,
                        createOption: true,
                      },
                      value: {
                        type: type.string,
                      },
                    },
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
          <Table
            defaultSort="adminCustomName"
            columns={columns(usagePlans)}
            fetchItems={() => {
              if (subscriptionsQuery.isLoading || subscriptionsQuery.error) {
                return [];
              } else {
                return subscriptionsQuery.data ?? [];
              }
            }}
            ref={tableRef}
          />
        </div>
      </Can>
    );
  } else {
    return <div>error while fetching usage plan</div>;
  }
};
