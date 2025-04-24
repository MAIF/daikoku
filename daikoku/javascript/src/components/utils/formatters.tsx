import { differenceInDays, differenceInMinutes, format, formatDistance } from "date-fns";
import { enUS, fr } from "date-fns/locale";

import frFRAntd from 'antd/es/date-picker/locale/fr_FR';
import enUSAntd from 'antd/es/date-picker/locale/en_US';

import find from "lodash/find";
import { useContext } from "react";

import { I18nContext } from "../../contexts";
import { TranslateParams } from '../../contexts/i18n-context';
import { currencies } from '../../services/currencies';
import {
  IBaseUsagePlan,
  IFastPlan,
  isPayPerUse,
  isQuotasWitoutLimit,
  IUsagePlan,
} from '../../types';

export const currency = (plan?: IBaseUsagePlan) => {
  if (!plan) {
    return ''; //todo: return undefined
  }
  const cur = find(currencies, (c) => c.code === plan.currency?.code);
  return `${cur?.name}(${cur?.symbol})`;
};


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

export const teamPermissions = {
  administrator: 'Administrator',
  ApiEditor: 'ApiEditor',
  user: 'User',
};

export const getLanguageFns = (language: string) => {
  switch (true) {
    case language.toLowerCase() === 'fr':
      return fr;
    case language.toLocaleLowerCase() === 'en':
      return enUS
    default:
      return enUS;
  }
}
export const getLanguageAntd = (language: string) => {
  switch (true) {
    case language.toLowerCase() === 'fr':
      return frFRAntd;
    case language.toLowerCase() === 'en':
      return enUSAntd
    default:
      return enUSAntd;
  }
}
export function formatDate(date: number | string, language: string, formatAsString): string;

export function formatDate(date: Date, language: string, formatAsString: string): string;

export function formatDate(date: any, language: string, formatAsString: string) {
  let realDate: Date;
  switch (typeof date) {
    case "object":
      realDate = date
    default:
      realDate = new Date(date);
      break;
  }

  console.debug({date, realDate, formatAsString})
  return format(realDate, formatAsString, { locale: getLanguageFns(language) });
}



export const formatMessageDate = (date: number, language: string): string => {
  const messageDate = new Date(date)
  const now = new Date();
  const diffToNow = differenceInDays(messageDate, now);
  if (diffToNow === 0) {
    const minDiff = differenceInMinutes(messageDate, now);
    return formatDistance(messageDate, now, { includeSeconds: true, addSuffix: true, locale: getLanguageFns(language) })
  } else if (diffToNow <= 7) {
    return format(messageDate, 'ddd kk:mm');
  } else if (messageDate.getFullYear() === now.getFullYear()) {
    return format(messageDate, 'DD MMMM kk:mm');
  } else {
    return format(messageDate, 'DD MMMM y kk:mm');
  }
};
