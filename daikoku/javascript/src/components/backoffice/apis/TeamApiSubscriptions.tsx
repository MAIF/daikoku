import { type } from "@maif/react-forms";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import classNames from "classnames";
import { useContext, useEffect, useState } from "react";
import { toast } from "sonner";

import { createColumnHelper } from "@tanstack/react-table";
import { Link, Menu, RefreshCcw } from "lucide-react";
import { I18nContext, ModalContext } from "../../../contexts";
import { GlobalContext } from "../../../contexts/globalContext";
import { CustomSubscriptionData } from "../../../contexts/modals/SubscriptionMetadataModal";
import { QUERY_KEYS } from "../../../constants/queryKeys";
import * as Services from "../../../services";
import {
  IApi,
  IApiGQL,
  ISubscriptionCustomization,
  ITeamSimple,
  IUsagePlan,
  ResponseError
} from "../../../types";
import { DynamicTable, DynamicTableFeatures, FetchData, FetchResult } from "../../inputs";
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
  const pageSize = 20;

  const { translate, Translation } = useContext(I18nContext);
  const { customGraphQLClient } = useContext(GlobalContext);
  const { confirm, openFormModal, openSubMetadataModal } =
    useContext(ModalContext);

  const queryKey = QUERY_KEYS.apiSubscriptions(api._id, currentTeam._id);
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  type IApiSubscriptionListGQL = { subscriptions: Array<IApiSubscriptionGql>, total: number }
  const fetchData: FetchData<IApiSubscriptionGql> = ({ limit, offset, filters, sorting }) =>
    customGraphQLClient.request<{ apiApiSubscriptions: IApiSubscriptionListGQL }>(Services.graphql.getApiSubscriptions, {
      apiId: api._id,
      teamId: currentTeam._id,
      version: api.currentVersion,
      filterTable: JSON.stringify(filters),
      sortingTable: JSON.stringify(sorting),
      limit: limit,
      offset: offset,
    })
      .then(({ apiApiSubscriptions }): FetchResult<IApiSubscriptionGql> => {
        return {
          items: apiApiSubscriptions.subscriptions,
          total: apiApiSubscriptions.total,
        }
      })

  const columnHelper = createColumnHelper<DynamicTableFeatures, IApiSubscriptionGqlWithUsage>();
  const columns = [
    columnHelper.accessor(
      (row) => row.adminCustomName || row.keyring?.apiKey.clientName || '',
      {
        id: "subscription",
        meta: { title: translate("Name"), size: 25 },
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
      meta: { title: translate("Plan"), size: 15 },
      cell: (info) => info.getValue(),
      enableColumnFilter: true,
    }),
    columnHelper.accessor(row => row.team.name, {
      id: "team",
      meta: { title: translate("Team"), size: 15 },
      cell: (info) => info.getValue(),
      enableColumnFilter: true,
    }),
    columnHelper.display({
      id: "state",
      enableColumnFilter: false,
      enableSorting: false,
      meta: { title: translate("State"), size: 10 },
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
      meta: { title: translate("Created at"), size: 12, className: 'date-cell' },
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
      meta: { title: translate("apisubscription.lastUsage.label"), size: 12, className: 'date-cell' },
      cell: (info) => {
        const date = info.getValue();
        if (date) {
          return formatDate(date, translate('date.locale'), translate('date.format'));
        }
        return translate("N/A");
      },
    }),
    columnHelper.display({
      id: "actions",
      meta: { title: translate("Actions"), size: 8, className: 'action-cell' },
      cell: (info) => {
        const sub = info.row.original;

        return (
          <Can I={manage} a={API} team={currentTeam}>
            <div className="dropdown">
              <button
                className="btn --ghost --small --icon-only"
                aria-label={translate('subscription.actions.aria.label')}
                type="button" data-bs-toggle="dropdown" aria-expanded="false"
                id={`dropdown-${sub._id}`}>
                <Menu
                  className="cursor-pointer dropdown-menu-button"
                  style={{ fontSize: '18px' }}
                />
              </button>
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
                {api.state !== 'blocked' && <button
                  className="dropdown-item cursor-pointer danger"
                  onClick={() => toggleApiSubscriptionState(sub)}
                >
                  {sub.state === 'active' ? translate("subscription.disable.button.label") : translate("subscription.enable.button.label")}
                </button>}
                {api.state !== 'blocked' && <button
                  className="dropdown-item cursor-pointer danger"
                  onClick={() => regenerateSecret(sub)}
                >
                  {translate("Refresh secret")}
                </button>}
                <button
                  className="dropdown-item cursor-pointer danger"
                  onClick={() => deleteSubscription(sub)}
                >
                  {translate("api.delete.subscription")}
                </button>
              </div>
            </div>
          </Can>
        )
      },
    }),
  ];

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translate("Subscriptions")}`;
  }, [currentTeam.name, translate]);

  const updateSubscription = useMutation({
    mutationFn: ({ sub, updates }: { sub: IApiSubscriptionGql; updates: CustomSubscriptionData }) =>
      Services.updateSubscription(currentTeam, { ...sub, ...updates }),
    onSuccess: () => {
      invalidate();
    },
  });

  const updateMeta = (sub: IApiSubscriptionGql) => {
    return openSubMetadataModal({
      save: (updates: CustomSubscriptionData) => {
        const toastId = toast.loading(translate("loading"));
        updateSubscription.mutateAsync({ sub, updates })
          .then(() => toast.success(translate("api.subscription.update.success"), { id: toastId }))
          .catch((e: ResponseError) => toast.error(translate(e.error), { id: toastId }));
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
      invalidate();
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
        .then(() => invalidate())
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
      invalidate();
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
                invalidate()
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
        <DynamicTable<IApiSubscriptionGql>
          queryKey={queryKey}
          columns={columns}
          fetchData={fetchData}
          pageSize={pageSize}
          getRowId={row => row._id}
          getRowAriaLabel={row => row.adminCustomName || row.keyring?.apiKey.clientName || ''}
          countLabelKey="API subscription"
        />
      </div>
    </Can>
  );
};

