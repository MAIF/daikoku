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
      return t('FreeWithoutQuotas', language, false, 'Free without quotas');
    case 'FreeWithQuotas':
      return t('FreeWithQuotas', language, false, 'Free with quotas');
    case 'QuotasWithLimits':
      return t('QuotasWithLimits', language, false, 'Quotas only');
    case 'QuotasWithoutLimits':
      return t('Quotas / pay per use', language, false, 'Quotas / pay per use');
    case 'PayPerUse':
      return t('Pay per use', language, false, 'Pay per use');
  }
};

export const teamPermissions = {
  administrator: 'Administrator',
  ApiEditor: 'ApiEditor',
  user: 'User',
};
