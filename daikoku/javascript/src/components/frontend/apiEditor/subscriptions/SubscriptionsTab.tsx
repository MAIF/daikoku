import { format, type } from '@maif/react-forms';
import { useQueryClient } from '@tanstack/react-query';
import { ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { Pencil, RefreshCcw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useContext, useState } from 'react';
import { toast } from 'sonner';

import { QUERY_KEYS } from '../../../../constants/queryKeys';
import { I18nContext, ModalContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import { CustomSubscriptionData } from '../../../../contexts/modals/SubscriptionMetadataModal';
import * as Services from '../../../../services';
import { IApi, isError, ITeamSimple, IUsagePlan, ResponseError } from '../../../../types';
import { IApiSubscriptionGql } from '../../../backoffice/apis/TeamApiSubscriptions';
import { DynamicTable, DynamicTableFeatures, FetchData, SwitchButton } from '../../../inputs';
import { api as API, Can, formatDate, manage } from '../../../utils';

type SubscriptionsTabProps = {
  api: IApi;
  ownerTeam: ITeamSimple;
  plans: Array<IUsagePlan>;
};

type AdvancedFilters = {
  metadata: { [key: string]: string };
  tags: Array<string>;
  clientIds: Array<string>;
};

type ApiSubscriptionRow = IApiSubscriptionGql & { lastUsage?: number };

const NO_ADVANCED_FILTERS: AdvancedFilters = { metadata: {}, tags: [], clientIds: [] };

const columnHelper = createColumnHelper<DynamicTableFeatures, ApiSubscriptionRow>();

export const SubscriptionsTab = ({ api, ownerTeam, plans }: SubscriptionsTabProps) => {
  const { translate } = useContext(I18nContext);
  const { customGraphQLClient, tenant } = useContext(GlobalContext);
  const { confirm, openFormModal, openSubMetadataModal } = useContext(ModalContext);
  const queryClient = useQueryClient();

  const byEnvironment = tenant.display === 'environment';

  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(NO_ADVANCED_FILTERS);

  const baseQueryKey = QUERY_KEYS.apiSubscriptions(api._id, ownerTeam._id);
  const refresh = () => queryClient.invalidateQueries({ queryKey: baseQueryKey });

  const hasAdvancedFilters =
    advancedFilters.clientIds.length > 0 ||
    advancedFilters.tags.length > 0 ||
    Object.keys(advancedFilters.metadata).length > 0;

  const fetchSubscriptions: FetchData<ApiSubscriptionRow> = ({ limit, offset, filters, sorting }) =>
    customGraphQLClient
      .request<{ apiApiSubscriptions: { subscriptions: Array<ApiSubscriptionRow>; total: number } }>(
        Services.graphql.getApiSubscriptions,
        {
          apiId: api._id,
          teamId: ownerTeam._id,
          version: api.currentVersion,
          filterTable: JSON.stringify([
            ...filters,
            ...(advancedFilters.clientIds.length ? [{ id: 'clientIds', value: advancedFilters.clientIds }] : []),
            ...(advancedFilters.tags.length ? [{ id: 'tags', value: advancedFilters.tags }] : []),
            ...(Object.keys(advancedFilters.metadata).length ? [{ id: 'metadata', value: advancedFilters.metadata }] : []),
          ]),
          sortingTable: JSON.stringify(sorting),
          limit,
          offset,
        }
      )
      .then(({ apiApiSubscriptions }) => ({
        items: apiApiSubscriptions.subscriptions,
        total: apiApiSubscriptions.total,
      }));

  const openAdvancedFilters = () =>
    openFormModal<AdvancedFilters>({
      title: translate('Filter data'),
      actionLabel: translate('Filter'),
      value: advancedFilters,
      schema: {
        metadata: { type: type.object, label: translate('Filter metadata') },
        tags: { type: type.string, array: true, label: translate('Filter tags') },
        clientIds: { type: type.string, array: true, label: translate('Filter Client Ids') },
      },
      onSubmit: (filters) => setAdvancedFilters({ ...NO_ADVANCED_FILTERS, ...filters }),
    });

  const toggle = (sub: ApiSubscriptionRow, reason?: string) =>
    Services.archiveSubscriptionByOwner(ownerTeam._id, sub._id, sub.state !== 'active', reason).then((result) => {
      if (result?.error) {
        toast.error(translate(result.error));
      }
      return refresh();
    });

  const switchSubscription = (sub: ApiSubscriptionRow) => {
    if (sub.state !== 'active') {
      return toggle(sub);
    }

    openFormModal<{ reason: string }>({
      title: translate('subscription.block.modal.title'),
      description: translate('subscription.block.modal.description'),
      value: { reason: '' },
      schema: {
        reason: { type: type.string, format: format.text, label: translate('subscription.block.reason.label') },
      },
      onSubmit: ({ reason }) => toggle(sub, reason).then(() => undefined),
      actionLabel: translate('subscription.block.action.label'),
    });
  };

  const withToast = (call: () => Promise<unknown>, success: string) => {
    const toastId = toast.loading(translate('loading'));
    return call()
      .then((response) => {
        if (isError(response)) {
          throw response;
        }
        toast.success(translate(success), { id: toastId });
        return refresh();
      })
      .catch((e: ResponseError) => toast.error(translate(e.error), { id: toastId }));
  };

  const updateMetadata = (sub: ApiSubscriptionRow) =>
    openSubMetadataModal({
      save: (updates: CustomSubscriptionData) =>
        withToast(() => Services.updateSubscription(ownerTeam, { ...sub, ...updates }), 'api.subscription.update.success'),
      api: sub.api._id,
      plan: sub.plan._id,
      team: sub.team,
      subscription: sub,
      creationMode: false,
    });

  const regenerateSecret = (sub: ApiSubscriptionRow) =>
    confirm({
      message: translate({ key: 'secret.refresh.confirm', replacements: [sub.team.name, sub.plan.customName] }),
      okLabel: translate('Yes'),
      cancelLabel: translate('No'),
    }).then((ok) => {
      if (ok) {
        withToast(() => Services.regenerateApiKeySecret(ownerTeam._id, sub.keyring!._id), 'secret.refresh.success');
      }
    });

  const deleteSubscription = (sub: ApiSubscriptionRow) =>
    confirm({
      title: translate('api.delete.subscription.form.title'),
      message: translate({ key: 'api.delete.subscription.message', replacements: [sub.team.name, sub.plan.customName] }),
      okLabel: translate('Yes'),
      cancelLabel: translate('No'),
    }).then((ok) => {
      if (ok) {
        withToast(() => Services.deleteApiSubscription(sub.team._id, sub._id), 'api.delete.subscription.deleted');
      }
    });

  const subscriptionName = (sub: ApiSubscriptionRow) => sub.adminCustomName || sub.keyring?.apiKey.clientName || '';

  const columns = [
    columnHelper.accessor(subscriptionName, {
      id: 'subscription',
      meta: { title: translate('Name'), size: 8 },
      cell: (info) => <span className="text-break">{info.getValue()}</span>,
    }),
    columnHelper.accessor((row) => row.plan.customName, {
      id: 'plan',
      meta: { title: translate(byEnvironment ? 'api.pricings.name.table.env' : 'Plan'), size: 4 },
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor((row) => row.team.name, {
      id: 'team',
      meta: { title: translate('Team'), size: 4 },
      cell: (info) => info.getValue(),
    }),
    columnHelper.display({
      id: 'state',
      enableSorting: false,
      meta: { title: translate('State'), size: 4 },
      cell: ({ row }) => {
        const sub = row.original;
        const ended = sub.blockedBy.includes('ended');
        const lockedByLifecycle = api.state === 'blocked' || sub.blockedBy.includes('lifecycle');

        if (ended || lockedByLifecycle) {
          return (
            <span className="badge --danger" title={ended ? translate('subscription.ended.help') : undefined}>
              {translate(ended ? 'subscription.ended.label' : 'subscription.blocked.label')}
            </span>
          );
        }

        const active = sub.state === 'active';
        return (
          <div className="d-flex align-items-center gap-2">
            <SwitchButton
              checked={active}
              ariaLabel={translate(active ? 'subscription.disable.button.label' : 'subscription.enable.button.label')}
              onSwitch={() => switchSubscription(sub)}
            />
            <span className="small">{translate(active ? 'subscription.enable.label' : 'subscription.disable.label')}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor('createdAt', {
      meta: { title: translate('Created at'), size: 4 },
      cell: (info) =>
        info.getValue()
          ? formatDate(info.getValue(), translate('date.locale'), translate('date.format.without.hours'))
          : translate('N/A'),
    }),
    columnHelper.accessor('lastUsage', {
      enableSorting: false,
      meta: { title: translate('apisubscription.lastUsage.label'), size: 4 },
      cell: (info) =>
        info.getValue() ? formatDate(info.getValue()!, translate('date.locale'), translate('date.format')) : translate('N/A'),
    }),
    columnHelper.display({
      id: 'actions',
      enableSorting: false,
      meta: { title: translate('Actions'), size: 4, className: 'text-end' },
      cell: ({ row }) => (
        <div className="d-flex justify-content-end gap-1">
          <button
            type="button"
            className="btn --tertiary --small --icon-only"
            aria-label={translate('Update metadata')}
            title={translate('Update metadata')}
            onClick={() => updateMetadata(row.original)}
          >
            <Pencil size={16} />
          </button>
          {api.state !== 'blocked' && (
            <button
              type="button"
              className="btn --tertiary --small --icon-only"
              aria-label={translate('refresh.secret.label')}
              title={translate('refresh.secret.label')}
              onClick={() => regenerateSecret(row.original)}
            >
              <RefreshCcw size={16} />
            </button>
          )}
          <button
            type="button"
            className="btn --tertiary --small --icon-only"
            aria-label={translate('api.delete.subscription')}
            title={translate('api.delete.subscription')}
            onClick={() => deleteSubscription(row.original)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    }),
  ] as Array<ColumnDef<DynamicTableFeatures, ApiSubscriptionRow, any>>;

  return (
    <Can I={manage} a={API} team={ownerTeam} dispatchError>
      <DynamicTable<ApiSubscriptionRow>
        queryKey={[...baseQueryKey, JSON.stringify(advancedFilters)]}
        columns={columns}
        fetchData={fetchSubscriptions}
        pageSize={20}
        getRowId={(row) => row._id}
        getRowAriaLabel={subscriptionName}
        countLabelKey="API subscription"
        filters={[
          { id: 'subscription', type: 'text', placeholder: translate('Search') },
          {
            id: 'plans',
            type: 'multiselect',
            labelKey: byEnvironment ? 'api.editor.environment.noun' : 'Plan',
            labelKeyAll: byEnvironment
              ? 'api.editor.subscriptions.filter.environments.all'
              : 'api.editor.subscriptions.filter.plans.all',
            options: plans.map((plan) => ({ label: plan.customName, value: plan._id })),
          },
          {
            id: 'teams',
            type: 'multiselect',
            labelKey: 'Team',
            labelKeyAll: 'api.editor.subscriptions.filter.teams.all',
            loadOptions: (input, callback) =>
              Services.teams(ownerTeam).then((teams) =>
                callback(
                  (isError(teams) ? [] : teams)
                    .filter((team) => team.name.toLowerCase().includes(input.toLowerCase()))
                    .map((team) => ({ label: team.name, value: team._id }))
                )
              ),
          },
        ]}
        toolbar={
          <div className="d-flex gap-2">
            <button type="button" className="btn --tertiary" onClick={openAdvancedFilters}>
              <SlidersHorizontal size={16} />
              {translate('api.editor.subscriptions.more.filters')}
            </button>
            {hasAdvancedFilters && (
              <button type="button" className="btn --secondary" onClick={() => setAdvancedFilters(NO_ADVANCED_FILTERS)}>
                <RefreshCcw size={16} />
                {translate('table.filters.clear.label')}
              </button>
            )}
          </div>
        }
      />
    </Can>
  );
};
