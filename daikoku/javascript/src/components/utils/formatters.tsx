import moment from 'moment';
import { TranslateParams } from '../../contexts/i18n-context';

import { currencies } from '../../services/currencies';
import {
  IBaseUsagePlan,
  IFastPlan,
  isPayPerUse,
  isQuotasWitoutLimit,
  IUsagePlan,
} from '../../types';

import find from "lodash/find";
import { useContext } from "react";
import { I18nContext } from "../../contexts";
import { currency } from "../frontend";



export const Currency = ({ plan }: { plan: IUsagePlan | IFastPlan }) => {
  const cur = find(currencies, (c) => c.code === plan.currency?.code);
  return (
    <span>
      {' '}
      {cur?.name}({cur?.symbol})
    </span>
  );
};

export const formatCurrency = (number: any) => {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(number);
};

export const getCurrencySymbol = (code: any) => {
  const currency = currencies.find((currency) => currency.code === code);
  return currency ? currency.symbol : undefined;
};
export const renderPricing = (plan: IFastPlan | IUsagePlan, translate: (params: string | TranslateParams) => string) => {
  let pricing = translate('Free');
  const req = translate('req.');
  const month = translate('month');

  //FIXME: do not use old usage plan type
  if (isQuotasWitoutLimit(plan)) {
    pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(plan.currency!.code)}/${month} + 
      ${formatCurrency(plan.costPerRequest)} ${getCurrencySymbol(plan.currency!.code)}/${req}`
  } else if (isPayPerUse(plan)) {
    pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(plan.currency!.code)}/${month} + 
    ${formatCurrency(plan.costPerRequest)} ${getCurrencySymbol(plan.currency!.code)}/${req}`;
  } else if (plan.costPerMonth) {
    pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(plan.currency!.code)}/${month}`;
  }
  return pricing;
}

export const renderPlanInfo = (planInfo: IFastPlan | IUsagePlan) => {
  const { translate } = useContext(I18nContext);
  if (!planInfo.costPerMonth && !planInfo.maxPerMonth) {
    return (
      <span>
        {translate('free.without.quotas.desc')}
      </span>
    )
  } else if (!planInfo.costPerMonth && planInfo.maxPerMonth) {
    return (
      <span>
        {translate({ key: 'free.with.quotas.desc', replacements: [planInfo.maxPerMonth.toString()] })}
      </span>
    )
  } else if (planInfo.maxPerMonth && planInfo.costPerMonth) {
    return (
      <span>
        <>
          {translate({
            key: 'quotas.with.limits.desc',
            replacements:
              [planInfo.costPerMonth.toString(),
              currency(planInfo)!,
              planInfo.maxPerMonth.toString()
              ]
          })}
          You'll pay {planInfo.costPerMonth}
          <Currency plan={planInfo} /> and you'll have {planInfo.maxPerMonth} authorized requests per month
        </>
      </span>
    )
  } else if (planInfo.maxPerMonth && planInfo.costPerRequest) {
    return (
      <span>
        <>
          {translate({
            key: 'quotas.without.limits.desc',
            replacements:
              [
                planInfo.costPerMonth!.toString(),
                currency(planInfo)!,
                planInfo.maxPerMonth!.toString(),
                planInfo.costPerRequest!.toString(),
                currency(planInfo)!
              ]
          })}
          You'll pay {planInfo.costPerMonth}
          <Currency plan={planInfo} /> for {planInfo.maxPerMonth} authorized requests per month and
          you'll be charged {planInfo.costPerRequest}
          <Currency plan={planInfo} /> per additional request
        </>
      </span>
    )
  } else if (!planInfo.maxPerMonth && planInfo.costPerRequest) {
    return (
      <span>
        {translate({
          key: 'pay.per.use.desc.default', replacements:
            [planInfo.costPerMonth!.toString(),
            currency(planInfo) || "",
            planInfo.costPerRequest!.toString(),
            currency(planInfo) || ""
            ]
        })}
        {planInfo.costPerMonth === 0.0 &&
          <>
            You'll pay {planInfo.costPerMonth}
            <Currency plan={planInfo} /> per month and you'll be charged{' '}
            {planInfo.costPerRequest}<Currency plan={planInfo} />
            per request
          </>
        }
        {planInfo.costPerMonth !== 0.0 &&
          <>
            You'll be charged {planInfo.costPerRequest}
            <Currency plan={planInfo} /> per request
          </>
        }
      </span>
    )
  } else {
    return;
  }
}

export function formatPlanType(
  plan: IBaseUsagePlan,
  translate: (x: string | TranslateParams) => string
): string

export function formatPlanType(
  plan: string,
  translate: (x: string | TranslateParams) => string
): string

export function formatPlanType(
  plan: any,
  translate: (x: string | TranslateParams) => string
): string {
  switch (plan?.type || plan) {
    case 'FreeWithoutQuotas':
      return translate('FreeWithoutQuotas');
    case 'FreeWithQuotas':
      return translate('FreeWithQuotas');
    case 'QuotasWithLimits':
      return translate('QuotasWithLimits');
    case 'QuotasWithoutLimits':
      return translate('Quotas / pay per use');
    case 'PayPerUse':
      return translate('Pay per use');
    default:
      return '';
  }
};

export const teamPermissions = {
  administrator: 'Administrator',
  ApiEditor: 'ApiEditor',
  user: 'User',
};

export const formatDate = (date: number | string, language: string, format = 'l LT') => {
  moment.locale(language);
  return moment(date).format(format);
};

export const formatMessageDate = (date: any, language: any) => {
  moment.locale(language);
  const messageDate = moment.isMoment(date) ? date : moment(date);
  const now = moment();
  const diffToNow = now.diff(messageDate, 'day');
  if (diffToNow === 0) {
    const minDiff = now.diff(messageDate, 'm');
    return moment.duration(minDiff, 'm').humanize();
  } else if (diffToNow <= 7) {
    return messageDate.format('ddd kk:mm');
  } else if (messageDate.get('year') === now.get('year')) {
    return messageDate.format('DD MMMM kk:mm');
  } else {
    return messageDate.format('DD MMMM y kk:mm');
  }
};
