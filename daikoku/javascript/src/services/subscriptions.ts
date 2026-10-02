import type { IUsagePlanGQL } from '../types/api';

type BatchPlan = Pick<
  IUsagePlanGQL,
  'paymentSettings' | 'subscriptionProcess' | 'subscriptionBatchProcessChecksum'
>;

export function isPlanSelectableForBatch(plan: BatchPlan, selectedPlans: BatchPlan[]): boolean {
  const plans = [...selectedPlans, plan];
  if (
    plans.some(
      (candidate) =>
        candidate.paymentSettings ||
        candidate.subscriptionProcess.some((step) => step.type === 'payment')
    )
  ) {
    return false;
  }

  const processes = plans.filter((candidate) => candidate.subscriptionProcess.length > 0);
  if (processes.length === 0) return true;

  const checksum = processes[0].subscriptionBatchProcessChecksum;
  return (
    typeof checksum === 'string' &&
    checksum.length > 0 &&
    processes.every((candidate) => candidate.subscriptionBatchProcessChecksum === checksum)
  );
}
