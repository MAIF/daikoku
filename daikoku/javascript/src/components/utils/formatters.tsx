import moment from 'moment';
import { TranslateParams } from '../../contexts/i18n-context';

import { currencies } from '../../services/currencies';
import {
  IBaseUsagePlan,
  IFastPlan,
  isPayPerUse,
  isQuotasWitoutLimit,
  IUsagePlan,
  IUsagePlanFreeWithQuotas, IUsagePlanPayPerUse, IUsagePlanQuotasWithLimits, IUsagePlanQuotasWitoutLimit
} from '../../types';

import {I18nContext} from "../../core";
import React, {useContext} from "react";
import {currency} from "../frontend";
import find from "lodash/find";



export const Currency = ({plan}: {plan: IUsagePlan | IFastPlan}) => {
  const cur = find(currencies, (c) => c.code === plan.currency.code);
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
export const renderPricing = (plan: IFastPlan | IUsagePlan, translate: (params: string | TranslateParams) => string ) => {
  let pricing = translate('Free');
  const req = translate('req.');

  const month = translate('month');
  if (isQuotasWitoutLimit(plan)) {
    pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(plan.currency.code)}/${month} + 
      ${formatCurrency(plan.costPerAdditionalRequest)} ${getCurrencySymbol(plan.currency.code)}/${req}`
  } else if (isPayPerUse(plan)) {
    pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(plan.currency.code)}/${month} + 
    ${formatCurrency(plan.costPerRequest)} ${getCurrencySymbol(plan.currency.code)}/${req}`;
  } else if (plan.costPerMonth) {
    pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(plan.currency.code)}/${month}`;
  }
  return pricing;
}

export const renderPlanInfo = (planInfo: IFastPlan | IUsagePlan) => {
  const { translate } = useContext(I18nContext);
  const type = planInfo.type
  if(type === 'FreeWithoutQuotas') {
    return (
      <span>
          {translate('free.without.quotas.desc')}
        </span>
    )
  } else if (type ==='FreeWithQuotas') {
    let plan = planInfo as IUsagePlanFreeWithQuotas
    return (
      <span>
        {translate({ key: 'free.with.quotas.desc', replacements: [plan.maxPerMonth!.toString()] })}
      </span>
    )
  } else if (type ==='QuotasWithLimits') {
    let plan = planInfo as IUsagePlanQuotasWithLimits
    return (
      <span>
        <>
          {translate({
            key: 'quotas.with.limits.desc',
            replacements:
              [ plan.costPerMonth!.toString(),
                currency(plan),
                plan.maxPerMonth!.toString()
              ]
          })}
          You'll pay {plan.costPerMonth}
          <Currency plan={planInfo} /> and you'll have {plan.maxPerMonth} authorized requests per month
        </>
      </span>
    )
  } else if (type ==='QuotasWithoutLimits') {
    let plan = planInfo as IUsagePlanQuotasWitoutLimit
    return (
      <span>
        <>
          {translate({
            key: 'quotas.without.limits.desc',
            replacements:
              [
                plan.costPerMonth!.toString(),
                currency(plan),
                plan.maxPerMonth!.toString(),
                plan.costPerAdditionalRequest!.toString(),
                currency(plan)
              ]
          })}
          You'll pay {plan.costPerMonth}
          <Currency plan={planInfo}/> for {plan.maxPerMonth} authorized requests per month and
          you'll be charged {plan.costPerAdditionalRequest}
          <Currency plan={planInfo}/> per additional request
        </>
      </span>
    )
  } else if (type === 'PayPerUse') {
    let plan = planInfo as IUsagePlanPayPerUse
    return (
      <span>
        {translate({
          key: 'pay.per.use.desc.default', replacements:
            [plan.costPerMonth!.toString(),
              currency(plan),
              plan.costPerRequest!.toString(),
              currency(plan)
            ]
        })}
        {plan.costPerMonth === 0.0 &&
            <>
              You'll pay {plan.costPerMonth}
              <Currency plan={planInfo} /> per month and you'll be charged{' '}
              {plan.costPerRequest}<Currency plan={planInfo} />
              per request
            </>
        }
        {plan.costPerMonth !== 0.0 &&
            <>
              You'll be charged {plan.costPerRequest}
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

export const formatDate = (date: number|string, language: string, format = 'l LT') => {
  moment.locale(language);
  return moment(date).format(format);
};

export const formatMessageDate = (date: any, language:any) => {
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
