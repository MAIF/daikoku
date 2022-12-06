import moment from 'moment';
import { TranslateParams } from '../../contexts/i18n-context';

import { currencies } from '../../services/currencies';
import { IUsagePlan } from '../../types';

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

export const formatPlanType = (plan: IUsagePlan, translate: (x: string | TranslateParams) => string) => {
    switch (plan.type) {
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

export const formatDate = (date: any, language: any, format = 'l LT') => {
  moment.locale(language);
  return moment(date).format(format);
};

export const formatMessageDate = (date: any) => {
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
