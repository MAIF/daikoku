import { expect, test } from '@playwright/test';
import { isPlanSelectableForBatch } from '../../src/services/subscriptions';
import type { IUsagePlanGQL } from '../../src/types/api';
import { ThirdPartyPaymentType } from '../../src/types/tenant';

type BatchPlan = Parameters<typeof isPlanSelectableForBatch>[0];

const empty: BatchPlan = { subscriptionProcess: [] };

const withProcess = (checksum: string | null | undefined): BatchPlan => ({
  subscriptionProcess: [{ type: 'teamAdmin', id: 'admin', team: 'producer' }],
  subscriptionBatchProcessChecksum: checksum,
});

test('allows empty processes and matching batch signatures', () => {
  expect(isPlanSelectableForBatch(empty, [])).toBe(true);
  expect(isPlanSelectableForBatch(empty, [empty])).toBe(true);
  expect(isPlanSelectableForBatch(withProcess('same'), [])).toBe(true);
  expect(isPlanSelectableForBatch(withProcess('same'), [empty, withProcess('same')])).toBe(true);
  expect(isPlanSelectableForBatch(empty, [withProcess('same')])).toBe(true);
});

test('allows different approver teams when the backend signatures match', () => {
  const other: BatchPlan = {
    ...withProcess('same'),
    subscriptionProcess: [{ type: 'teamAdmin', id: 'other-admin', team: 'other-producer' }],
  };

  expect(isPlanSelectableForBatch(other, [withProcess('same')])).toBe(true);
});

test('rejects different processes even when an empty process is selected', () => {
  expect(isPlanSelectableForBatch(withProcess('different'), [empty, withProcess('same')])).toBe(
    false
  );
  expect(isPlanSelectableForBatch(withProcess('different'), [withProcess('same'), empty])).toBe(
    false
  );
  expect(isPlanSelectableForBatch(empty, [withProcess('same'), withProcess('different')])).toBe(
    false
  );
});

test('does not treat missing signatures as matching nonempty processes', () => {
  for (const checksum of [undefined, null, '']) {
    expect(isPlanSelectableForBatch(withProcess(checksum), [])).toBe(false);
    expect(isPlanSelectableForBatch(withProcess(checksum), [withProcess(checksum)])).toBe(false);
    expect(isPlanSelectableForBatch(empty, [withProcess(checksum)])).toBe(false);
  }
});

test('excludes payment steps even without payment settings', () => {
  const paid: BatchPlan = {
    subscriptionProcess: [
      {
        type: 'payment',
        id: 'payment',
        thirdPartyPaymentSettingsId: 'stripe',
      },
    ],
    subscriptionBatchProcessChecksum: 'payment',
  };

  expect(isPlanSelectableForBatch(paid, [])).toBe(false);
  expect(isPlanSelectableForBatch(empty, [paid])).toBe(false);
});

test('excludes plans with payment settings even without a payment step', () => {
  const paymentSettings: NonNullable<IUsagePlanGQL['paymentSettings']> = {
    type: ThirdPartyPaymentType.stripe,
    thirdPartyPaymentSettingsId: 'stripe',
  };
  const paid: BatchPlan = { ...empty, paymentSettings };

  expect(isPlanSelectableForBatch(paid, [])).toBe(false);
  expect(isPlanSelectableForBatch(empty, [paid])).toBe(false);
});
