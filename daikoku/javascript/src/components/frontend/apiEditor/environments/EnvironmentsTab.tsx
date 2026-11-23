import { constraints, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef, createColumnHelper, RowSelectionState } from '@tanstack/react-table';
import cloneDeep from 'lodash/cloneDeep';
import { CopyPlus, Download, EllipsisVertical, KeyRound, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useContext, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { QUERY_KEYS } from '../../../../constants/queryKeys';
import { I18nContext, ModalContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import {
  IApi,
  IPlansWithCount,
  ISubscription,
  ISubscriptionDemand,
  ITeamSimple,
  IUsagePlan,
  IUsagePlanGQL,
} from '../../../../types';
import { DynamicTable, DynamicTableFeatures, FetchData } from '../../../inputs';
import {
  access,
  api as API,
  apikey,
  CanIDoAction,
  CanIDoActionForOneOfTeams,
  humanReadableBigNumber,
  manage,
  renderPricing,
} from '../../../utils';
import { useExportEntity } from '../../../utils/useExportEntity';
import { ApiKeyRequestSideSheet, AskForApikeys } from '../keyRequest/ApiKeyRequestSideSheet';
import { EnvironmentSheetTab, EnvironmentSideSheet } from './EnvironmentSideSheet';
import { fromRestPlan, isPlanSelectable, keyAccess, teamsAllowedFor, toUsagePlan } from './planUtils';

type EnvironmentsTabProps = {
  api: IApi;
  ownerTeam: ITeamSimple;
  myTeams: Array<ITeamSimple>;
  subscriptions: Array<ISubscription>;
  pendingDemands: Array<ISubscriptionDemand>;
  askForApikeys: AskForApikeys;
};

type TabSheet =
  | { kind: 'environment'; plan: IUsagePlan; creation: boolean; tab?: EnvironmentSheetTab }
  | { kind: 'request'; plans: Array<IUsagePlanGQL> };

const columnHelper = createColumnHelper<DynamicTableFeatures, IUsagePlanGQL>();

export const EnvironmentsTab = (props: EnvironmentsTabProps) => {
  const { api, ownerTeam } = props;

  const { translate } = useContext(I18nContext);
  const { connectedUser, tenant, customGraphQLClient, flags } = useContext(GlobalContext);
  const { openLoginOrRegisterModal, openFormModal, openCustomModal, openApiSelectModal, close } =
    useContext(ModalContext);
  const { canExport, exportEntity } = useExportEntity();
  const { hash } = useLocation();
  const queryClient = useQueryClient();

  const [sheet, setSheet] = useState<TabSheet>();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const byEnvironment = tenant.display === 'environment';
  const isOwner = CanIDoAction(connectedUser, manage, API, ownerTeam);
  const accessContext = { api, ownerTeam, tenant, myTeams: props.myTeams, subscriptions: props.subscriptions };

  const availableEnvsQuery = useQuery({
    queryKey: QUERY_KEYS.availableEnvsByApi(api._id),
    queryFn: () => Services.getAllAvailableEnvs(ownerTeam._id, api._id, api.currentVersion),
    enabled: isOwner,
  });
  const canDuplicate = !byEnvironment || (availableEnvsQuery.data?.length ?? 0) > 0;

  const fetchPlans: FetchData<IUsagePlanGQL> = ({ limit, offset, filters, sorting }) =>
    customGraphQLClient
      .request<{ plansByApi: IPlansWithCount }>(Services.graphql.plansByApi, {
        filterTable: JSON.stringify(filters),
        sortingTable: JSON.stringify(sorting),
        limit,
        offset,
        apiId: api._id,
      })
      .then(({ plansByApi }) => ({
        items: plansByApi.plans,
        total: plansByApi.total,
        totalFiltered: plansByApi.totalFiltered,
      }));

  const withOnlyAvailableEnvironment = (plan: IUsagePlan): IUsagePlan => {
    const available = availableEnvsQuery.data ?? [];

    return byEnvironment && available.length === 1 ? { ...plan, customName: available[0] } : plan;
  };

  const editEnvironment = (plan: IUsagePlan, creation: boolean, tab?: EnvironmentSheetTab) =>
    setSheet({ kind: 'environment', plan: creation ? withOnlyAvailableEnvironment(plan) : plan, creation, tab });

  const createEnvironment = () => {
    const createEmpty = () =>
      Services.fetchNewPlan().then((plan) => {
        close();
        editEnvironment(fromRestPlan(plan), true);
      });

    if (!api.parent) {
      createEmpty();
      return;
    }

    openCustomModal({
      title: translate('api.home.create.plan.modal.title'),
      content: (
        <div className="d-flex flex-column gap-3">
          <span>{translate('api.home.create.plan.modal.description')}</span>
          <div className="d-flex justify-content-around">
            <button type="button" className="btn --primary" onClick={createEmpty}>
              {translate('api.home.create.plan.modal.create.btn.label')}
            </button>
            <button
              type="button"
              className="btn --primary"
              onClick={() => {
                close();
                openApiSelectModal({
                  api,
                  teamId: ownerTeam._id,
                  onClose: (plan) =>
                    editEnvironment(
                      { ...cloneDeep(fromRestPlan(plan)), _id: nanoid(32), customName: `${plan.customName} (import)` },
                      true
                    ),
                });
              }}
            >
              {translate('api.home.create.plan.modal.import.btn.label')}
            </button>
          </div>
        </div>
      ),
    });
  };

  const deleteEnvironment = (plan: IUsagePlanGQL) => {
    const displayType = byEnvironment ? 'environment' : 'plan';

    openFormModal({
      title: translate('Confirm'),
      description: (
        <div className="alert alert-danger" role="alert">
          <h4 className="alert-heading">{translate('Warning')}</h4>
          <p>{translate(`delete.${displayType}.confirm.modal.description.1`)}</p>
          <ul>
            <li>{translate(`delete.${displayType}.confirm.modal.description.2`)}</li>
          </ul>
        </div>
      ),
      schema: {
        confirm: {
          type: type.string,
          label: translate({ key: 'delete.item.confirm.modal.confirm.label', replacements: [plan.customName] }),
          constraints: [
            constraints.oneOf(
              [plan.customName],
              translate({ key: 'constraints.type.api.name', replacements: [plan.customName] })
            ),
          ],
        },
      },
      onSubmit: () =>
        Services.deletePlan(ownerTeam._id, api._id, api.currentVersion, toUsagePlan(plan))
          .then(() =>
            Promise.all([
              queryClient.invalidateQueries({ queryKey: QUERY_KEYS.availableEnvsByApi(api._id) }),
              queryClient.invalidateQueries({ queryKey: ['plans'] }),
              queryClient.invalidateQueries({ queryKey: ['api'] }),
            ])
          )
          .then(() => {
            toast.success(translate({ key: `delete.${displayType}.successful.toast.label`, replacements: [plan.customName] }));
          }),
      actionLabel: translate('Confirm'),
    });
  };

  const quotasSummary = (plan: IUsagePlanGQL) => {
    if (!plan.maxPerSecond && !plan.maxPerDay && !plan.maxPerMonth) {
      return translate('api.editor.quotas.unlimited');
    }

    const unlimited = translate('plan.limits.unlimited');
    return [
      translate({
        key: 'api.pricings.quotas.sec.value',
        replacements: [plan.maxPerSecond ? humanReadableBigNumber(plan.maxPerSecond, translate) : unlimited],
      }),
      translate({
        key: 'api.pricings.quotas.day.value',
        replacements: [plan.maxPerDay ? humanReadableBigNumber(plan.maxPerDay, translate) : unlimited],
      }),
      translate({
        key: 'api.pricings.quotas.month.value',
        replacements: [plan.maxPerMonth ? humanReadableBigNumber(plan.maxPerMonth, translate) : unlimited],
      }),
    ].join(' · ');
  };

  const renderKeyButton = (plan: IUsagePlanGQL) => {
    const label = translate('Get API key');

    if (connectedUser.isGuest) {
      return (
        <button
          type="button"
          className="btn --tertiary --small --icon-only"
          aria-label={label}
          onClick={() => openLoginOrRegisterModal({ tenant })}
        >
          <KeyRound size={16} />
        </button>
      );
    }

    const state = keyAccess(plan, accessContext);
    const canAccessKeys =
      api.visibility === 'AdminOnly' ||
      CanIDoActionForOneOfTeams(connectedUser, access, apikey, teamsAllowedFor(plan, accessContext));

    if (state === 'disabled') {
      return (
        <button
          type="button"
          className="btn --tertiary --small --icon-only"
          aria-label={label}
          title={translate('api.editor.key.request.unavailable')}
          disabled
        >
          <KeyRound size={16} />
        </button>
      );
    }

    if (state === 'hidden' || !canAccessKeys) {
      return null;
    }

    return (
      <button
        type="button"
        className="btn --tertiary --small --icon-only"
        aria-label={label}
        onClick={() => setSheet({ kind: 'request', plans: [plan] })}
      >
        <KeyRound size={16} />
      </button>
    );
  };

  const renderActionsMenu = (plan: IUsagePlanGQL) => {
    const buttonId = `plan-actions-${plan._id}`;
    const usagePlan = toUsagePlan(plan);

    return (
      <>
        <button
          id={buttonId}
          type="button"
          className="btn --tertiary --small --icon-only"
          data-bs-toggle="dropdown"
          aria-expanded="false"
          aria-haspopup="menu"
          aria-label={translate(byEnvironment ? 'environment.actions.aria.label' : 'plan.actions.aria.label')}
        >
          <EllipsisVertical size={16} />
        </button>
        <ul className="dropdown-menu" role="menu" aria-labelledby={buttonId}>
          <li role="none">
            <button role="menuitem" className="dropdown-item d-flex gap-2 align-items-center" onClick={() => editEnvironment(usagePlan, false)}>
              <Pencil size={16} />
              {translate('Edit')}
            </button>
          </li>
          <li role="none">
            <button
              role="menuitem"
              className="dropdown-item d-flex gap-2 align-items-center"
              onClick={() => editEnvironment(usagePlan, false, 'process')}
            >
              <Workflow size={16} />
              {translate('pricing.edit.process.btn.label')}
            </button>
          </li>
          {api.visibility !== 'AdminOnly' && (
            <>
              {canDuplicate && (
                <li role="none">
                  <button
                    role="menuitem"
                    className="dropdown-item d-flex gap-2 align-items-center"
                    onClick={() =>
                      editEnvironment(
                        { ...cloneDeep(usagePlan), _id: nanoid(32), customName: '', paymentSettings: undefined },
                        true
                      )
                    }
                  >
                    <CopyPlus size={16} />
                    {translate(byEnvironment ? 'pricing.clone.env.btn.label' : 'Duplicate plan')}
                  </button>
                </li>
              )}
              {canExport && (
                <li role="none">
                  <button
                    role="menuitem"
                    className="dropdown-item d-flex gap-2 align-items-center"
                    onClick={() => exportEntity('usage-plan', plan._id)}
                  >
                    <Download size={16} />
                    {translate('remote-catalog.exportEntity.button')}
                  </button>
                </li>
              )}
              <li role="none">
                <button
                  role="menuitem"
                  className="dropdown-item d-flex gap-2 align-items-center danger"
                  onClick={() => deleteEnvironment(plan)}
                >
                  <Trash2 size={16} />
                  {translate(byEnvironment ? 'pricing.delete.env.btn.label' : 'Delete plan')}
                </button>
              </li>
            </>
          )}
        </ul>
      </>
    );
  };

  const columns = [
    ...(connectedUser.isGuest
      ? []
      : [
          columnHelper.display({
            id: 'select',
            meta: { hidden: !flags.multiPlanSubscriptionEnabled, size: 1 },
            header: ({ table }) => (
              <input
                type="checkbox"
                aria-label={translate('SelectAll')}
                checked={table.getIsAllRowsSelected()}
                onChange={table.getToggleAllRowsSelectedHandler()}
              />
            ),
            cell: ({ row }) => (
              <input
                type="checkbox"
                aria-label={row.original.customName}
                checked={row.getIsSelected()}
                disabled={!row.getCanSelect()}
                onChange={row.getToggleSelectedHandler()}
              />
            ),
          }),
        ]),
    columnHelper.display({
      id: 'plan',
      meta: {
        title: translate(byEnvironment ? 'api.pricings.name.table.env' : 'api.pricings.name.table.title'),
        size: 5,
      },
      cell: ({ row }) => <span>{row.original.customName}</span>,
    }),
    columnHelper.display({
      id: 'description',
      meta: { title: translate('api.pricings.description.table.title'), size: 6 },
      cell: ({ row }) => <span>{row.original.customDescription}</span>,
    }),
    columnHelper.display({
      id: 'quotas',
      meta: { title: translate('api.pricings.quotas.table.title'), size: 5 },
      cell: ({ row }) => <span>{quotasSummary(row.original)}</span>,
    }),
    columnHelper.display({
      id: 'pricing',
      meta: { title: translate('api.pricings.pricing.table.title'), size: 4 },
      cell: ({ row }) => <span>{renderPricing(row.original, translate)}</span>,
    }),
    columnHelper.display({
      id: 'otoroshi-target',
      meta: { title: translate('api.pricings.otoroshi.target.table.title'), size: 5, hidden: !isOwner },
      cell: ({ row }) => {
        const settingsId = row.original.otoroshiTarget?.otoroshiSettings;
        return (
          <span>
            {settingsId
              ? tenant.otoroshiSettings.find((o) => o._id === settingsId)?.url
              : translate('api.pricings.otoroshi.target.value.none')}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'process',
      meta: { title: translate('api.pricings.subscription.process.table.title'), size: 4, hidden: !isOwner },
      cell: ({ row }) => (
        <span>
          {row.original.subscriptionProcess.length
            ? translate({
                key: 'api.pricings.process.value',
                replacements: [String(row.original.subscriptionProcess.length)],
              })
            : translate('api.pricings.process.value.none')}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      meta: { title: isOwner ? translate('api.pricings.name.table.actions') : '', size: 3, className: 'text-end' },
      cell: ({ row }) => (
        <div className="d-flex justify-content-end align-items-center gap-2">
          {renderKeyButton(row.original)}
          {isOwner && renderActionsMenu(row.original)}
        </div>
      ),
    }),
  ] as Array<ColumnDef<DynamicTableFeatures, IUsagePlanGQL, any>>;

  return (
    <>
      <DynamicTable<IUsagePlanGQL>
        queryKey={['plans', api._id]}
        columns={columns}
        fetchData={fetchPlans}
        getRowId={(plan) => plan._id}
        getRowAriaLabel={(plan) => plan.customName}
        highlightedRowId={hash.slice(1)}
        dataClassName="table-rows"
        countLabelKey="Plan"
        isRowSelectable={isPlanSelectable}
        enableRowSelection={Object.values(rowSelection).includes(true)}
        rowSelection={rowSelection}
        setRowSelection={setRowSelection}
        bulkActions={[
          {
            label: translate('api.editor.key.request.bulk'),
            onClick: async (plans) => setSheet({ kind: 'request', plans }),
          },
        ]}
        toolbar={
          isOwner && (
            <button type="button" className="btn --primary" onClick={createEnvironment}>
              <Plus size={16} />
              {translate(
                byEnvironment
                  ? 'api.pricings.creation.environment.button.label'
                  : 'api.pricings.creation.plan.button.label'
              )}
            </button>
          )
        }
      />

      {sheet?.kind === 'environment' && (
        <EnvironmentSideSheet
          api={api}
          ownerTeam={ownerTeam}
          plan={sheet.plan}
          creation={sheet.creation}
          initialTab={sheet.tab}
          onClose={() => setSheet(undefined)}
        />
      )}

      {sheet?.kind === 'request' && (
        <ApiKeyRequestSideSheet
          api={api}
          ownerTeam={ownerTeam}
          plans={sheet.plans}
          myTeams={props.myTeams}
          subscriptions={props.subscriptions}
          pendingDemands={props.pendingDemands}
          askForApikeys={props.askForApikeys}
          onClose={() => setSheet(undefined)}
        />
      )}
    </>
  );
};
