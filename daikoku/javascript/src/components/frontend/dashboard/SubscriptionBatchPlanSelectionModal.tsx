import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GraphQLClient } from 'graphql-request';
import { nanoid } from 'nanoid';
import { useContext, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import {
  buildBatchKeyringSelection,
  findCompatibleKeyringsForGroup,
  groupBatchPlansByKeyring,
  isBatchPlanAvailable,
  isPlanSelectableForBatch,
} from '../../../services/subscriptions';
import {
  IApiGQL,
  IApiWithAuthorization,
  ITeamSimple,
  IUsagePlanGQL,
  isError,
} from '../../../types';

type PlanSet = {
  api: IApiWithAuthorization;
  plans: IUsagePlanGQL[];
};

type SelectedPlan = {
  api: IApiWithAuthorization;
  plan: IUsagePlanGQL;
};

type Props = {
  apis: IApiWithAuthorization[];
  team: ITeamSimple;
  onSubmitted: () => void;
};

const planKey = (apiId: string, planId: string) => `${apiId}:${planId}`;

async function fetchPlansForApi(
  customGraphQLClient: GraphQLClient,
  api: IApiWithAuthorization
): Promise<PlanSet> {
  const pageSize = 100;
  const plans: IUsagePlanGQL[] = [];
  let offset = 0;
  let total = Number.MAX_SAFE_INTEGER;

  while (offset < total) {
    const result = await customGraphQLClient.request<{
      plansByApi: { plans: IUsagePlanGQL[]; totalFiltered: number };
    }>(Services.graphql.plansByApi, {
      filterTable: JSON.stringify([]),
      sortingTable: JSON.stringify([]),
      limit: pageSize,
      offset,
      apiId: api.api._id,
    });
    plans.push(...result.plansByApi.plans);
    total = result.plansByApi.totalFiltered;
    if (result.plansByApi.plans.length === 0) break;
    offset += result.plansByApi.plans.length;
  }

  return { api, plans };
}

export const SubscriptionBatchPlanSelectionModal = ({ apis, team, onSubmitted }: Props) => {
  const { translate } = useContext(I18nContext);
  const { customGraphQLClient, tenant } = useContext(GlobalContext);
  const { close, openFormModal } = useContext(ModalContext);
  const queryClient = useQueryClient();
  const teamId = team._id;
  const [selectedPlanKeys, setSelectedPlanKeys] = useState<string[]>([]);
  const [keyringChoices, setKeyringChoices] = useState<Record<string, string>>({});
  const [keyringNames, setKeyringNames] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const plansQuery = useQuery({
    queryKey: ['subscription-batch-plans', apis.map(({ api }) => api._id).sort()],
    queryFn: () => Promise.all(apis.map((api) => fetchPlansForApi(customGraphQLClient, api))),
  });

  const subscriptionsQuery = useQuery({
    queryKey: ['subscription-batch-keyrings', teamId],
    queryFn: async () => {
      const subscriptions = await Services.getAllTeamSubscriptions(teamId);
      if (subscriptions.length === 0) return { subscriptions, apis: [] };
      const apiIds = [...new Set(subscriptions.map((subscription) => subscription.api))];
      const { apis: subscriptionApis } = await customGraphQLClient.request<{
        apis: IApiGQL[];
      }>(Services.graphql.apisByIdsWithPlans, { ids: apiIds });
      return { subscriptions, apis: subscriptionApis };
    },
    enabled: !!teamId,
  });

  const pendingPlansQuery = useQuery({
    queryKey: ['subscription-batch-pending-plans', teamId],
    queryFn: async () => {
      const result = await Services.getPendingSubscriptionPlans(teamId);
      if (isError(result)) throw new Error(result.error);
      return result;
    },
  });

  const availablePlanSets = useMemo(() => {
    if (!subscriptionsQuery.data || !pendingPlansQuery.data) return [];
    return (plansQuery.data ?? []).map(({ api, plans }) => ({
      api,
      plans: plans.filter((plan) =>
        isBatchPlanAvailable({
          apiId: api.api._id,
          ownerTeamId: api.api.team._id,
          plan,
          teamId,
          subscriptions: subscriptionsQuery.data.subscriptions,
          pendingPlans: pendingPlansQuery.data,
        })
      ),
    }));
  }, [plansQuery.data, subscriptionsQuery.data, pendingPlansQuery.data, teamId]);

  const selectedPlans = useMemo<SelectedPlan[]>(() => {
    return availablePlanSets.flatMap(({ api, plans }) =>
      plans
        .filter((plan) => selectedPlanKeys.includes(planKey(api.api._id, plan._id)))
        .map((plan) => ({ api, plan }))
    );
  }, [availablePlanSets, selectedPlanKeys]);

  const keyringGroups = useMemo(() => {
    return groupBatchPlansByKeyring(
      selectedPlans.map(({ api, plan }) => ({ api: api.api, plan }))
    ).map((group) => ({
      ...group,
      keyrings: subscriptionsQuery.data
        ? findCompatibleKeyringsForGroup(group, tenant, subscriptionsQuery.data)
        : [],
    }));
  }, [selectedPlans, subscriptionsQuery.data, tenant]);

  const commonPlanNames = useMemo(() => {
    if (availablePlanSets.length < 2) return [];
    const names = [
      ...new Set(availablePlanSets.flatMap(({ plans }) => plans.map((plan) => plan.customName))),
    ];
    return names.flatMap((name) => {
      const matches = availablePlanSets.flatMap(({ api, plans }) =>
        plans.filter((plan) => plan.customName === name).map((plan) => ({ api, plan }))
      );
      return matches.length > 1 ? [{ name, plans: matches }] : [];
    });
  }, [availablePlanSets]);

  const canAddPlan = (plan: IUsagePlanGQL) =>
    isPlanSelectableForBatch(
      plan,
      selectedPlans.map(({ plan: selected }) => selected)
    );

  const togglePlan = (apiId: string, plan: IUsagePlanGQL) => {
    const key = planKey(apiId, plan._id);
    setSelectedPlanKeys((current) => {
      if (current.includes(key)) return current.filter((candidate) => candidate !== key);
      if (!canAddPlan(plan)) return current;
      return [...current, key];
    });
  };

  const toggleCommonPlans = (plans: SelectedPlan[]) => {
    const keys = plans.map(({ api, plan }) => planKey(api.api._id, plan._id));
    const allSelected = keys.every((key) => selectedPlanKeys.includes(key));
    if (allSelected) {
      setSelectedPlanKeys((current) => current.filter((key) => !keys.includes(key)));
      return;
    }
    const remaining = selectedPlans
      .filter(({ api, plan }) => !keys.includes(planKey(api.api._id, plan._id)))
      .map(({ plan }) => plan);
    const compatible = plans.reduce<IUsagePlanGQL[] | undefined>(
      (accumulated, { plan }) =>
        accumulated && isPlanSelectableForBatch(plan, accumulated)
          ? [...accumulated, plan]
          : undefined,
      remaining
    );
    if (compatible) setSelectedPlanKeys((current) => [...new Set([...current, ...keys])]);
  };

  const submit = async (motivation?: object) => {
    if (!subscriptionsQuery.data || selectedPlans.length === 0) return;
    setSubmitting(true);
    try {
      if (
        keyringGroups.some(
          (group) =>
            keyringChoices[group.key] &&
            !group.keyrings.some((keyring) => keyring._id === keyringChoices[group.key])
        )
      ) {
        toast.error(translate('subscription.batch.keyring.invalid'));
        return;
      }
      const { items, newKeyrings } = buildBatchKeyringSelection(
        keyringGroups,
        keyringChoices,
        keyringNames,
        team.name
      );
      const response = await Services.submitSubscriptionBatch(teamId, {
        team: teamId,
        idempotencyKey: nanoid(),
        items,
        newKeyrings,
        motivation,
      });
      if (isError(response)) {
        toast.error(response.error);
        return;
      }
      toast.info(
        translate({
          key: 'subscription.batch.submitted',
          replacements: [String(items.length), team.name],
        })
      );
      queryClient.invalidateQueries({ queryKey: ['mySubscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-batch-keyrings', teamId] });
      queryClient.invalidateQueries({ queryKey: ['subscription-batch-pending-plans', teamId] });
      onSubmitted();
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : translate('subscription.batch.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitWithMotivation = () => {
    const formStep = selectedPlans
      .flatMap(({ plan }) => plan.subscriptionProcess.filter((step) => step.type === 'form'))
      .at(0);
    if (!formStep || formStep.type !== 'form') {
      void submit();
      return;
    }
    openFormModal({
      title: translate('motivations.modal.title'),
      noClose: true,
      schema: formStep.schema,
      actionLabel: translate('Send'),
      description: formStep.info ? (
        <div className="alert alert-info" dangerouslySetInnerHTML={{ __html: formStep.info }} />
      ) : undefined,
      onSubmit: (motivation) => submit(motivation),
    });
  };

  if (plansQuery.isLoading || subscriptionsQuery.isLoading || pendingPlansQuery.isLoading)
    return <p>{translate('Loading...')}</p>;
  if (plansQuery.isError || pendingPlansQuery.isError || subscriptionsQuery.isError) {
    return <p className="text-danger">{translate('subscription.batch.plans.failed')}</p>;
  }

  return (
    <>
      <div className="modal-body">
        <p>
          {translate('Team')}: <strong>{team.name}</strong>
        </p>
        {commonPlanNames.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-3">
            {commonPlanNames.map(({ name, plans }) => {
              const keys = plans.map(({ api, plan }) => planKey(api.api._id, plan._id));
              const allSelected = keys.every((key) => selectedPlanKeys.includes(key));
              const remaining = selectedPlans
                .filter(({ api, plan }) => !keys.includes(planKey(api.api._id, plan._id)))
                .map(({ plan }) => plan);
              const canSelect =
                plans.reduce<IUsagePlanGQL[] | undefined>(
                  (accumulated, { plan }) =>
                    accumulated && isPlanSelectableForBatch(plan, accumulated)
                      ? [...accumulated, plan]
                      : undefined,
                  remaining
                ) !== undefined;
              return (
                <button
                  key={name}
                  type="button"
                  className="btn --secondary --small"
                  onClick={() => toggleCommonPlans(plans)}
                  aria-pressed={allSelected}
                  disabled={!allSelected && !canSelect}
                >
                  {translate({
                    key: 'subscription.batch.select.same.plan',
                    replacements: [name],
                  })}
                </button>
              );
            })}
          </div>
        )}
        <div className="d-flex flex-column gap-3">
          {availablePlanSets.map(({ api, plans }) => (
            <section key={api.api._id}>
              <h6>{api.api.name}</h6>
              {plans.length === 0 && (
                <p className="text-muted">{translate('subscription.batch.no.plans')}</p>
              )}
              {plans.map((plan) => {
                const key = planKey(api.api._id, plan._id);
                const selected = selectedPlanKeys.includes(key);
                const selectable = selected || canAddPlan(plan);
                return (
                  <div key={key} className="border rounded p-2 mb-2">
                    <label className="d-flex align-items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!selectable}
                        onChange={() => togglePlan(api.api._id, plan)}
                      />
                      <span>{plan.customName}</span>
                    </label>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        {keyringGroups.length > 0 && (
          <section className="mt-3">
            <h6>{translate('subscription.batch.keyring.groups.title')}</h6>
            <p className="text-muted">
              {translate('subscription.batch.keyring.groups.description')}
            </p>
            {keyringGroups.map((group, index) => {
              const inputId = `batch-keyring-group-${index}`;
              return (
                <div key={group.key} className="border rounded p-3 mb-2">
                  <h6>{group.name}</h6>
                  <p className="text-muted">{group.items.map(({ api }) => api.name).join(', ')}</p>
                  {!group.items[0].plan.aggregationApiKeysSecurity && (
                    <p className="text-muted">
                      {translate('subscription.batch.keyring.no.aggregation')}
                    </p>
                  )}
                  <label className="form-label" htmlFor={inputId}>
                    {translate({
                      key: 'subscription.batch.keyring.group.choice',
                      replacements: [group.name],
                    })}
                  </label>
                  <select
                    id={inputId}
                    className="form-select"
                    disabled={
                      submitting || subscriptionsQuery.isLoading || subscriptionsQuery.isError
                    }
                    value={keyringChoices[group.key] ?? ''}
                    onChange={(event) =>
                      setKeyringChoices((current) => ({
                        ...current,
                        [group.key]: event.target.value,
                      }))
                    }
                  >
                    <option value="">{translate('subscription.batch.keyring.create')}</option>
                    {group.keyrings.map((keyring) => (
                      <option key={keyring._id} value={keyring._id}>
                        {keyring.customName || keyring._id}
                      </option>
                    ))}
                  </select>
                  {!keyringChoices[group.key] && (
                    <input
                      className="form-control mt-2"
                      aria-label={translate({
                        key: 'subscription.batch.keyring.group.name',
                        replacements: [group.name],
                      })}
                      disabled={submitting}
                      value={keyringNames[group.key] ?? `${team.name} - ${group.name}`}
                      onChange={(event) =>
                        setKeyringNames((current) => ({
                          ...current,
                          [group.key]: event.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              );
            })}
          </section>
        )}
        {selectedPlans.length > 0 && subscriptionsQuery.isLoading && (
          <p>{translate('subscription.batch.keyrings.loading')}</p>
        )}
        {subscriptionsQuery.isError && (
          <p className="text-danger">{translate('subscription.batch.keyrings.failed')}</p>
        )}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn --secondary" onClick={close}>
          {translate('Cancel')}
        </button>
        <button
          type="button"
          className="btn --primary"
          disabled={
            selectedPlans.length === 0 ||
            submitting ||
            subscriptionsQuery.isLoading ||
            subscriptionsQuery.isError
          }
          onClick={submitWithMotivation}
        >
          {translate('subscription.batch.submit')}
        </button>
      </div>
    </>
  );
};
