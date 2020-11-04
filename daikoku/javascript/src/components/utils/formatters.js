import moment from 'moment';

import { currencies } from '../../services/currencies';
import { t } from '../../locales';

export const formatCurrency = (number) => {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(number);
};

export const getCurrencySymbol = (code) => {
  const currency = currencies.find((currency) => currency.code === code);
  return currency ? currency.symbol : undefined;
};

export const formatPlanType = (plan, language) => {
  switch (plan.type) {
    case 'FreeWithoutQuotas':
      return t('FreeWithoutQuotas', language);
    case 'FreeWithQuotas':
      return t('FreeWithQuotas', language);
    case 'QuotasWithLimits':
      return t('QuotasWithLimits', language);
    case 'QuotasWithoutLimits':
      return t('Quotas / pay per use', language);
    case 'PayPerUse':
      return t('Pay per use', language);
  }
};

export const teamPermissions = {
  administrator: 'Administrator',
  ApiEditor: 'ApiEditor',
  user: 'User',
};

export const formatDate = (date, currentLanguage, format = 'l LT') => {
  moment.locale(currentLanguage);
  return moment(date).format(format);
};

export const formatMessageDate = (date) => {
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
