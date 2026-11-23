import { eachDayOfInterval, endOfMonth, isAfter, startOfDay, startOfMonth } from 'date-fns';
import groupBy from 'lodash/groupBy';
import maxBy from 'lodash/maxBy';
import orderBy from 'lodash/orderBy';
import sum from 'lodash/sum';
import sumBy from 'lodash/sumBy';

export type BillingConsumption = {
  api: string;
  apiName: string;
  plan: string;
  planId: string;
  clientId: string;
  hits: number;
  billing: { hits: number; total: number };
  from: number;
  to: number;
};

export type BillingDay = {
  day: number;
  calls: number | null;
  bill: number | null;
};

export type PlanBilling = {
  api: string;
  apiName: string;
  planId: string;
  planName: string;
  calls: number;
  total: number;
};

const seriesKey = (consumption: BillingConsumption) =>
  `${consumption.clientId}|${consumption.planId}`;

/** A key's bill is month-to-date, so a day without a record for it carries
 * its last known total forward. Days to come stay empty: the bars and the
 * curve stop today. */
export const dailyBilling = (
  consumptions: Array<BillingConsumption>,
  month: Date,
  now: Date = new Date()
): Array<BillingDay> => {
  const byDay = groupBy(consumptions, (c) => startOfDay(c.from).getTime());
  const lastTotals = new Map<string, number>();

  return eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
    .map((day) => {
      if (isAfter(day, now)) {
        return { day: day.getTime(), calls: null, bill: null };
      }

      const records = byDay[day.getTime()] ?? [];
      records.forEach((c) => lastTotals.set(seriesKey(c), c.billing.total));

      return {
        day: day.getTime(),
        calls: sumBy(records, 'hits'),
        bill: sum([...lastTotals.values()]),
      };
    });
};

export const billingByPlan = (
  consumptions: Array<BillingConsumption>
): Array<PlanBilling> => {
  const latestOfEachKey = Object.values(groupBy(consumptions, seriesKey))
    .map((records) => maxBy(records, 'from')!);

  const plans = Object.values(groupBy(consumptions, (c) => `${c.api}|${c.planId}`))
    .map((records) => {
      const { api, apiName, planId, plan } = records[0];

      return {
        api,
        apiName,
        planId,
        planName: plan,
        calls: sumBy(records, 'hits'),
        total: sumBy(
          latestOfEachKey.filter((c) => c.api === api && c.planId === planId),
          (c) => c.billing.total
        ),
      };
    });

  return orderBy(plans, 'total', 'desc');
};
