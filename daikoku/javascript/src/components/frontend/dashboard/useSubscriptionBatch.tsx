import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GraphQLClient } from 'graphql-request';
import { nanoid } from 'nanoid';
import { useContext, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { isBatchPlanAvailable } from '../../../services/subscriptions';
import {
  IApiGQL,
  IApiWithAuthorization,
  ISubscriptionBatchSubmission,
  ITeamSimple,
  IUsagePlanGQL,
  isError,
} from '../../../types';

export type BatchPlanSet = { api: IApiWithAuthorization; plans: IUsagePlanGQL[] };

async function fetchPlansForApi(
  client: GraphQLClient,
  api: IApiWithAuthorization
): Promise<BatchPlanSet> {
  const plans: IUsagePlanGQL[] = [];
  let offset = 0;
  let total = Number.MAX_SAFE_INTEGER;
  while (offset < total) {
    const result = await client.request<{
      plansByApi: { plans: IUsagePlanGQL[]; totalFiltered: number };
    }>(Services.graphql.plansByApi, {
      filterTable: JSON.stringify([]),
      sortingTable: JSON.stringify([]),
      limit: 100,
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

export function useSubscriptionBatch(
  apis: IApiWithAuthorization[],
  team: ITeamSimple,
  onSubmitted: () => void
) {
  const { customGraphQLClient } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext);
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const submission = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  const plansQuery = useQuery({
    queryKey: ['subscription-batch-plans', apis.map(({ api }) => api._id).sort()],
    queryFn: () => Promise.all(apis.map((api) => fetchPlansForApi(customGraphQLClient, api))),
  });
  const subscriptionsQuery = useQuery({
    queryKey: ['subscription-batch-keyrings', team._id],
    queryFn: async () => {
      const subscriptions = await Services.getAllTeamSubscriptions(team._id);
      if (subscriptions.length === 0) return { subscriptions, apis: [] };
      const { apis: subscriptionApis } = await customGraphQLClient.request<{ apis: IApiGQL[] }>(
        Services.graphql.apisByIdsWithPlans,
        { ids: [...new Set(subscriptions.map((subscription) => subscription.api))] }
      );
      return { subscriptions, apis: subscriptionApis };
    },
  });
  const pendingPlansQuery = useQuery({
    queryKey: ['subscription-batch-pending-plans', team._id],
    queryFn: async () => {
      const result = await Services.getPendingSubscriptionPlans(team._id);
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
          teamId: team._id,
          subscriptions: subscriptionsQuery.data.subscriptions,
          pendingPlans: pendingPlansQuery.data,
        })
      ),
    }));
  }, [plansQuery.data, subscriptionsQuery.data, pendingPlansQuery.data, team._id]);

  const submit = async (
    selection: Pick<ISubscriptionBatchSubmission, 'items' | 'newKeyrings'>,
    motivation?: object
  ) => {
    if (inFlight.current || selection.items.length === 0) return;
    inFlight.current = true;
    setSubmitting(true);
    const fingerprint = JSON.stringify({ ...selection, motivation });
    if (submission.current?.fingerprint !== fingerprint) {
      submission.current = { fingerprint, key: nanoid() };
    }
    try {
      const response = await Services.submitSubscriptionBatch(team._id, {
        ...selection,
        team: team._id,
        idempotencyKey: submission.current.key,
        motivation,
      });
      if (isError(response)) {
        toast.error(response.error);
        return;
      }
      toast.info(
        translate({
          key: 'subscription.batch.submitted',
          replacements: [String(selection.items.length), team.name],
        })
      );
      void queryClient.invalidateQueries({ queryKey: ['mySubscription'] });
      void queryClient.invalidateQueries({ queryKey: ['subscription-batch-keyrings', team._id] });
      void queryClient.invalidateQueries({
        queryKey: ['subscription-batch-pending-plans', team._id],
      });
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : translate('subscription.batch.failed'));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const submitWithMotivation = (
    selection: Pick<ISubscriptionBatchSubmission, 'items' | 'newKeyrings'>,
    selectedPlans: IUsagePlanGQL[]
  ) => {
    const formStep = selectedPlans
      .flatMap((plan) => plan.subscriptionProcess.filter((step) => step.type === 'form'))
      .at(0);
    if (!formStep || formStep.type !== 'form') {
      void submit(selection);
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
      onSubmit: (motivation) => submit(selection, motivation),
    });
  };

  return {
    plansQuery,
    subscriptionsQuery,
    pendingPlansQuery,
    availablePlanSets,
    submitting,
    submitWithMotivation,
    loading: plansQuery.isLoading || subscriptionsQuery.isLoading || pendingPlansQuery.isLoading,
    failed: plansQuery.isError || subscriptionsQuery.isError || pendingPlansQuery.isError,
  };
}
