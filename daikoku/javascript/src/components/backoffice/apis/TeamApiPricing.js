import React, { Component } from 'react';
import _ from 'lodash';
import { currencies } from '../../../services/currencies';
import faker from 'faker';
import Select from 'react-select';
import classNames from 'classnames';

import { Spinner, newPossibleUsagePlan } from '../../utils';
import { t, Translation } from '../../../locales';


const LazyForm = React.lazy(() => import('../../inputs/Form'));

const SUBSCRIPTION_PLAN_TYPES = {
  FreeWithoutQuotas: {
    defaultName: 'Free plan',
    defaultDescription: 'Free plan with unlimited number of calls per day and per month',
  },
  FreeWithQuotas: {
    defaultName: 'Free plan with quotas',
    defaultDescription: 'Free plan with limited number of calls per day and per month',
  },
  QuotasWithLimits: {
    defaultName: 'Quotas with limits',
    defaultDescription: 'Priced plan with limited number of calls per day and per month',
  },
  QuotasWithoutLimits: {
    defaultName: 'Quotas with Pay per use',
    defaultDescription: 'Priced plan with unlimited number of calls per day and per month',
  },
  PayPerUse: { defaultName: 'Pay per use', defaultDescription: 'Plan priced on usage' },
};

const PUBLIC = 'Public';
const PRIVATE = 'Private';
const APIKEY = 'ApiKey';
const AUTOMATIC = 'Automatic';

export class TeamApiPricing extends Component {
  state = {
    selected: this.props.value.possibleUsagePlans[0]
  };

  otoroshiFlow = _found => {
    if (
      !(
        !!_found.otoroshiTarget &&
        !!_found.otoroshiTarget.otoroshiSettings &&
        !!_found.otoroshiTarget.serviceGroup
      )
    ) {
      return [
        `>>> ${t('Otoroshi', this.props.currentLanguage)}`,
        'otoroshiTarget.otoroshiSettings',
        'otoroshiTarget.serviceGroup',
      ];
    }
    return [
      `>>> ${t('Otoroshi', this.props.currentLanguage)}`,
      'otoroshiTarget.otoroshiSettings',
      'otoroshiTarget.serviceGroup',
      'otoroshiTarget.apikeyCustomization.clientIdOnly',
      'otoroshiTarget.apikeyCustomization.readOnly',
      'otoroshiTarget.apikeyCustomization.constrainedServicesOnly',
      'otoroshiTarget.apikeyCustomization.dynamicPrefix',
      'otoroshiTarget.apikeyCustomization.tags',
      'otoroshiTarget.apikeyCustomization.metadata',
      'otoroshiTarget.apikeyCustomization.restrictions.enabled',
      'otoroshiTarget.apikeyCustomization.restrictions.allowLast',
      'otoroshiTarget.apikeyCustomization.restrictions.allowed',
      'otoroshiTarget.apikeyCustomization.restrictions.forbidden',
      'otoroshiTarget.apikeyCustomization.restrictions.notFound',
    ];
  };

  otoroshiForm = _found => {
    if (
      !(
        !!_found.otoroshiTarget &&
        !!_found.otoroshiTarget.otoroshiSettings &&
        !!_found.otoroshiTarget.serviceGroup
      )
    ) {
      return {
        'otoroshiTarget.otoroshiSettings': {
          type: 'select',
          props: {
            label: t('Otoroshi instance', this.props.currentLanguage),
            possibleValues: this.props.otoroshiSettings.map(s => ({
                  label: s.url,
                  value: s._id,
                })),
          },
        },
        'otoroshiTarget.serviceGroup': {
          type: 'select',
          props: {
            label: t('Service group', this.props.currentLanguage),
            valuesFrom: `/api/teams/${this.props.teamId}/tenant/otoroshis/${_found.otoroshiTarget.otoroshiSettings}/groups`,
            transformer: s => ({ label: s.name, value: s.id }),
            fetchCondition: () => !!_found.otoroshiTarget.otoroshiSettings,
          },
        },
      };
    }
    const found = _found;
    return {
      'otoroshiTarget.otoroshiSettings': {
        type: 'select',
        props: {
          label: t('Otoroshi instance', this.props.currentLanguage),
          possibleValues: this.props.otoroshiSettings.map(s => ({
                label: s.url,
                value: s._id,
              })),
        },
      },
      'otoroshiTarget.serviceGroup': {
        type: 'select',
        props: {
          label: t('Service group', this.props.currentLanguage),
          valuesFrom: `/api/teams/${this.props.teamId}/tenant/otoroshis/${found.otoroshiTarget.otoroshiSettings}/groups`,
          transformer: s => ({ label: s.name, value: s.id }),
          fetchCondition: () => !!found.otoroshiTarget.otoroshiSettings,
        },
      },
      'otoroshiTarget.apikeyCustomization.clientIdOnly': {
        type: 'bool',
        props: {
          label: t('Apikey with clientId only', this.props.currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.readOnly': {
        type: 'bool',
        props: {
          label: t('Read only apikey', this.props.currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.constrainedServicesOnly': {
        type: 'bool',
        props: {
          label: t('Constrained services only', this.props.currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.dynamicPrefix': {
        type: 'string',
        props: {
          label: t('Dynamic prefix', this.props.currentLanguage),
          help: t(
            'dynamic.prefix.help',
            this.props.currentLanguage,
            'the prefix used in tags and metadata used to target dynamic values that will be updated if the value change in the original plan'
          ),
        },
      },
      'otoroshiTarget.apikeyCustomization.metadata': {
        type: 'object',
        props: {
          label: t('Apikey metadata', this.props.currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.tags': {
        type: 'array',
        props: {
          label: t('Apikey tags', this.props.currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.restrictions.enabled': {
        type: 'bool',
        props: {
          label: t('Enable restrictions', this.props.currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.restrictions.allowLast': {
        type: 'bool',
        props: {
          label: t('Allow at last', this.props.currentLanguage),
          help: t(
            'allow.least.help',
            this.props.currentLanguage,
            'Allowed path will be evaluated at last'
          ),
        },
      },
      'otoroshiTarget.apikeyCustomization.restrictions.allowed': {
        type: 'array',
        props: {
          label: t('Allowed pathes', this.props.currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.restrictions.forbidden': {
        type: 'array',
        props: {
          label: t('Forbidden pathes', this.props.currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.restrictions.notFound': {
        type: 'array',
        props: {
          label: t('Not found pathes', this.props.currentLanguage),
        },
      },
    };
  };

  securityFlow = _found => {
    return [
      `>>> ${t('Security', this.props.currentLanguage)}`,
      'autoRotation',
      'subscriptionProcess',
      'integrationProcess'
    ]
  }

  securityForm = _found => {
    return {
      'autoRotation': {
        type: 'bool',
        props: {
          label: t('Force apikey auto-rotation', this.props.currentLanguage)
        }
      },
      'subscriptionProcess': {
        type: 'select',
        props: {
          label: t('Subscription', this.props.currentLanguage),
          possibleValues: [
            {
              label: t('Automatic', this.props.currentLanguage),
              value: 'Automatic',
            },
            { label: t('Manual', this.props.currentLanguage), 
              value: 'Manual' 
            }
          ],
        },
      },
      'integrationProcess': {
        type: 'select',
        props: {
          label: t('Integration', this.props.currentLanguage),
          possibleValues: [
            {
              label: t('Automatic', this.props.currentLanguage),
              value: 'Automatic',
            },
            { label: t('ApiKey', this.props.currentLanguage), 
              value: 'ApiKey' },
          ],
        },
      }
    }
  }

  select = selected => {
    this.setState({ selected });
  };

  smartNameAndDescription = newType => {
    let response = {};
    if (newType !== this.state.selected.type) {
      const { customName, customDescription, type } = this.state.selected;
      const { defaultName, defaultDescription } = SUBSCRIPTION_PLAN_TYPES[type];
      if (!customName || customName === defaultName) {
        response = { ...response, customName: SUBSCRIPTION_PLAN_TYPES[newType].defaultName };
      }
      if (!customDescription || customDescription === defaultDescription) {
        response = {
          ...response,
          customDescription: SUBSCRIPTION_PLAN_TYPES[newType].defaultDescription,
        };
      }
    }
    return response;
  };

  onChange = v => {
    if (!v.currency) {
      v.currency = { code: 'EUR' };
    }
    v = { ...v, ...this.smartNameAndDescription(v.type) };
    const selected = this.props.value.possibleUsagePlans.filter(p => p._id === v._id)[0];
    const idx = this.props.value.possibleUsagePlans.indexOf(selected);
    let plans = _.cloneDeep(this.props.value.possibleUsagePlans);
    plans.splice(idx, 1, v);
    const value = _.cloneDeep(this.props.value);
    value.possibleUsagePlans = plans;
    this.props.onChange(value);
    this.setState({ selected: v });
  };

  renderAdmin = plan => {
    const found = _.find(this.props.value.possibleUsagePlans, p => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        serviceGroup: null,
      };
    }
    const flow = [
      '_id',
      'type',
      'customName',
      'customDescription',
      ...this.otoroshiFlow(found)
    ];
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Id', this.props.currentLanguage),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        disabled: true,
        props: {
          label: t('Type', this.props.currentLanguage),
          possibleValues: [
            { label: t('FreeWithoutQuotas', this.props.currentLanguage, false, 'Free without quotas'), value: 'FreeWithoutQuotas' },
            { label: t('FreeWithQuotas', this.props.currentLanguage, false, 'Free with quotas'), value: 'FreeWithQuotas' },
            { label: t('QuotasWithLimits', this.props.currentLanguage, false, 'Quotas with limits'), value: 'QuotasWithLimits' },
            { label: t('QuotasWithoutLimits', this.props.currentLanguage, false, 'Quotas without limits'), value: 'QuotasWithoutLimits' },
            { label: t('PayPerUse', this.props.currentLanguage, false, 'Pay per use'), value: 'PayPerUse' },
          ],
        },
      },
      customName: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Name', this.props.currentLanguage),
          placeholder: t('Plan name', this.props.currentLanguage),
        },
      },
      customDescription: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Description', this.props.currentLanguage),
          placeholder: t('Plan description', this.props.currentLanguage),
        },
      },
      ...this.otoroshiForm(found)
    };
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm flow={flow} schema={schema} value={found} onChange={this.onChange} />
      </React.Suspense>
    );
  };

  renderFreeWithoutQuotas = plan => {
    const found = _.find(this.props.value.possibleUsagePlans, p => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        serviceGroup: null,
      };
    }
    const flow = [
      '_id',
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      `>>> ${t('Billing', this.props.currentLanguage)}`,
      'billingDuration.value',
      'billingDuration.unit',
      ...this.otoroshiFlow(found),
      ...this.securityFlow(found)
    ];
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Id', this.props.currentLanguage),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        props: {
          label: t('Type', this.props.currentLanguage),
          possibleValues: [
            { label: t('FreeWithoutQuotas', this.props.currentLanguage, false, 'Free without quotas'), value: 'FreeWithoutQuotas' },
            { label: t('FreeWithQuotas', this.props.currentLanguage, false, 'Free with quotas'), value: 'FreeWithQuotas' },
            { label: t('QuotasWithLimits', this.props.currentLanguage, false, 'Quotas with limits'), value: 'QuotasWithLimits' },
            { label: t('QuotasWithoutLimits', this.props.currentLanguage, false, 'Quotas without limits'), value: 'QuotasWithoutLimits' },
            { label: t('PayPerUse', this.props.currentLanguage, false, 'Pay per use'), value: 'PayPerUse' },
          ],
        },
      },
      'billingDuration.value': {
        type: 'number',
        props: {
          label: t('Billing every', this.props.currentLanguage),
        },
      },
      'billingDuration.unit': {
        type: 'select',
        props: {
          label: t('Billing every', this.props.currentLanguage),
          possibleValues: [
            { label: 'Hours', value: 'hours' },
            { label: 'Days', value: 'days' },
            { label: 'Months', value: 'months' },
            { label: 'Years', value: 'years' },
          ],
        },
      },
      customName: {
        type: 'string',
        props: {
          label: t('Name', this.props.currentLanguage),
          placeholder: t('Plan name', this.props.currentLanguage),
        },
      },
      customDescription: {
        type: 'string',
        props: {
          label: t('Description', this.props.currentLanguage),
          placeholder: t('Plan description', this.props.currentLanguage),
        },
      },
      allowMultipleKeys: {
        type: 'bool',
        props: {
          label: t('Allow multiple apiKey demands', this.props.currentLanguage),
        },
      },
      ...this.otoroshiForm(found),
      ...this.securityForm(found)
    };
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm flow={flow} schema={schema} value={found} onChange={this.onChange} />
      </React.Suspense>
    );
  };

  renderFreeWithQuotas = plan => {
    const found = _.find(this.props.value.possibleUsagePlans, p => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        serviceGroup: null,
      };
    }
    const flow = [
      '_id',
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      `>>> ${t('Quotas', this.props.currentLanguage)}`,
      'maxPerSecond',
      'maxPerDay',
      'maxPerMonth',
      `>>> ${t('Billing', this.props.currentLanguage)}`,
      'billingDuration.value',
      'billingDuration.unit',
      ...this.otoroshiFlow(found),
      ...this.securityFlow(found)
    ];
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Id', this.props.currentLanguage),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        props: {
          label: t('Type', this.props.currentLanguage),
          possibleValues: [
            { label: t('FreeWithoutQuotas', this.props.currentLanguage, false, 'Free without quotas'), value: 'FreeWithoutQuotas' },
            { label: t('FreeWithQuotas', this.props.currentLanguage, false, 'Free with quotas'), value: 'FreeWithQuotas' },
            { label: t('QuotasWithLimits', this.props.currentLanguage, false, 'Quotas with limits'), value: 'QuotasWithLimits' },
            { label: t('QuotasWithoutLimits', this.props.currentLanguage, false, 'Quotas without limits'), value: 'QuotasWithoutLimits' },
            { label: t('PayPerUse', this.props.currentLanguage, false, 'Pay per use'), value: 'PayPerUse' },
          ],
        },
      },
      'billingDuration.value': {
        type: 'number',
        props: {
          label: t('Billing every', this.props.currentLanguage),
        },
      },
      'billingDuration.unit': {
        type: 'select',
        props: {
          label: t('Billing every', this.props.currentLanguage),
          possibleValues: [
            { label: 'Hours', value: 'hours' },
            { label: 'Days', value: 'days' },
            { label: 'Months', value: 'months' },
            { label: 'Years', value: 'years' },
          ],
        },
      },
      allowMultipleKeys: {
        type: 'bool',
        props: {
          label: t('Allow multiple apiKey demands', this.props.currentLanguage),
        },
      },
      maxPerSecond: {
        type: 'number',
        props: {
          label: t('Max. per second', this.props.currentLanguage),
          placeholder: t('Max. requests per second', this.props.currentLanguage),
        },
      },
      maxPerDay: {
        type: 'number',
        props: {
          label: t('Max. per day', this.props.currentLanguage),
          placeholder: t('Max. requests per day', this.props.currentLanguage),
        },
      },
      maxPerMonth: {
        type: 'number',
        props: {
          label: t('Max. per month', this.props.currentLanguage),
          placeholder: t('Max. requests per month', this.props.currentLanguage),
        },
      },
      customName: {
        type: 'string',
        props: {
          label: t('Name', this.props.currentLanguage),
          placeholder: t('Plan name', this.props.currentLanguage),
        },
      },
      customDescription: {
        type: 'string',
        props: {
          label: t('Description', this.props.currentLanguage),
          placeholder: t('Plan description', this.props.currentLanguage),
        },
      },
      ...this.otoroshiForm(found),
      ...this.securityForm(found)
    };
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm flow={flow} schema={schema} value={found} onChange={this.onChange} />
      </React.Suspense>
    );
  };

  renderQuotasWithLimits = plan => {
    const found = _.find(this.props.value.possibleUsagePlans, p => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        serviceGroup: null,
      };
    }
    const flow = [
      '_id',
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      `>>> ${t('Quotas', this.props.currentLanguage)}`,
      'maxPerSecond',
      'maxPerDay',
      'maxPerMonth',
      `>>> ${t('Trial', this.props.currentLanguage)}`,
      'trialPeriod.value',
      'trialPeriod.unit',
      `>>> ${t('Billing', this.props.currentLanguage)}`,
      'costPerMonth',
      'currency.code',
      'billingDuration.value',
      'billingDuration.unit',
      ...this.otoroshiFlow(found),
      ...this.securityFlow(found)
    ];
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Id', this.props.currentLanguage),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        props: {
          label: t('Type', this.props.currentLanguage),
          possibleValues: [
            { label: t('FreeWithoutQuotas', this.props.currentLanguage, false, 'Free without quotas'), value: 'FreeWithoutQuotas' },
            { label: t('FreeWithQuotas', this.props.currentLanguage, false, 'Free with quotas'), value: 'FreeWithQuotas' },
            { label: t('QuotasWithLimits', this.props.currentLanguage, false, 'Quotas with limits'), value: 'QuotasWithLimits' },
            { label: t('QuotasWithoutLimits', this.props.currentLanguage, false, 'Quotas without limits'), value: 'QuotasWithoutLimits' },
            { label: t('PayPerUse', this.props.currentLanguage, false, 'Pay per use'), value: 'PayPerUse' },
          ],
        },
      },
      'billingDuration.value': {
        type: 'number',
        props: {
          label: t('Billing every', this.props.currentLanguage),
        },
      },
      'billingDuration.unit': {
        type: 'select',
        props: {
          label: t('Billing every', this.props.currentLanguage),
          possibleValues: [
            { label: 'Hours', value: 'hours' },
            { label: 'Days', value: 'days' },
            { label: 'Months', value: 'months' },
            { label: 'Years', value: 'years' },
          ],
        },
      },
      allowMultipleKeys: {
        type: 'bool',
        props: {
          label: t('Allow multiple apiKey demands', this.props.currentLanguage),
        },
      },
      'trialPeriod.value': {
        type: 'number',
        props: {
          label: t('Trial period', this.props.currentLanguage),
          placeholder: t('The trial period', this.props.currentLanguage),
        },
      },
      'trialPeriod.unit': {
        type: 'number',
        props: {
          label: t('Trial period unit', this.props.currentLanguage),
          possibleValues: [
            { label: 'Hours', value: 'hours' }, //todo: maybe translate label ???
            { label: 'Days', value: 'days' },
            { label: 'Months', value: 'months' },
            { label: 'Years', value: 'years' },
          ],
        },
      },
      maxPerSecond: {
        type: 'number',
        props: {
          label: t('Max. per second', this.props.currentLanguage),
          placeholder: t('Max. requests per second', this.props.currentLanguage),
        },
      },
      maxPerDay: {
        type: 'number',
        props: {
          label: t('Max. per day', this.props.currentLanguage),
          placeholder: t('Max. requests per day', this.props.currentLanguage),
        },
      },
      maxPerMonth: {
        type: 'number',
        props: {
          label: t('Max. per month', this.props.currentLanguage),
          placeholder: t('Max. requests per month', this.props.currentLanguage),
        },
      },
      costPerMonth: {
        type: 'number',
        props: {
          label: t('Cost per month', this.props.currentLanguage),
          placeholder: t('Cost per month', this.props.currentLanguage),
        },
      },
      'currency.code': {
        type: 'select',
        props: {
          label: t('Currency', this.props.currentLanguage),
          possibleValues: currencies.map(c => ({
            label: `${c.name} (${c.symbol})`,
            value: c.code,
          })),
        },
      },
      customName: {
        type: 'string',
        props: {
          label: t('Name', this.props.currentLanguage),
          placeholder: t('Plan name', this.props.currentLanguage),
        },
      },
      customDescription: {
        type: 'string',
        props: {
          label: t('Description', this.props.currentLanguage),
          placeholder: t('Plan description', this.props.currentLanguage),
        },
      },
      ...this.otoroshiForm(found),
      ...this.securityForm(found)
    };
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm flow={flow} schema={schema} value={found} onChange={this.onChange} />
      </React.Suspense>
    );
  };

  renderQuotasWithoutLimits = plan => {
    const found = _.find(this.props.value.possibleUsagePlans, p => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        serviceGroup: null,
      };
    }
    const flow = [
      '_id',
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      `>>> ${t('Quotas', this.props.currentLanguage)}`,
      'maxPerSecond',
      'maxPerDay',
      'maxPerMonth',
      `>>> ${t('Trial', this.props.currentLanguage)}`,
      'trialPeriod.value',
      'trialPeriod.unit',
      `>>> ${t('Billing', this.props.currentLanguage)}`,
      'costPerMonth',
      'costPerAdditionalRequest',
      'currency.code',
      'billingDuration.value',
      'billingDuration.unit',
      ...this.otoroshiFlow(found),
      ...this.securityFlow(found)
    ];
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Id', this.props.currentLanguage),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        props: {
          label: t('Type', this.props.currentLanguage),
          possibleValues: [
            { label: t('FreeWithoutQuotas', this.props.currentLanguage, false, 'Free without quotas'), value: 'FreeWithoutQuotas' },
            { label: t('FreeWithQuotas', this.props.currentLanguage, false, 'Free with quotas'), value: 'FreeWithQuotas' },
            { label: t('QuotasWithLimits', this.props.currentLanguage, false, 'Quotas with limits'), value: 'QuotasWithLimits' },
            { label: t('QuotasWithoutLimits', this.props.currentLanguage, false, 'Quotas without limits'), value: 'QuotasWithoutLimits' },
            { label: t('PayPerUse', this.props.currentLanguage, false, 'Pay per use'), value: 'PayPerUse' },
          ],
        },
      },
      'billingDuration.value': {
        type: 'number',
        props: {
          label: t('Billing every', this.props.currentLanguage),
        },
      },
      'billingDuration.unit': {
        type: 'select',
        props: {
          label: t('Billing every', this.props.currentLanguage),
          possibleValues: [
            { label: 'Hours', value: 'hours' },
            { label: 'Days', value: 'days' },
            { label: 'Months', value: 'months' },
            { label: 'Years', value: 'years' },
          ],
        },
      },
      allowMultipleKeys: {
        type: 'bool',
        props: {
          label: t('Allow multiple apiKey demands', this.props.currentLanguage),
        },
      },
      'trialPeriod.value': {
        type: 'number',
        props: {
          label: t('Trial period', this.props.currentLanguage),
          placeholder: t('The trial period', this.props.currentLanguage),
        },
      },
      'trialPeriod.unit': {
        type: 'number',
        props: {
          label: t('Trial period unit', this.props.currentLanguage),
          possibleValues: [
            { label: 'Hours', value: 'hours' },
            { label: 'Days', value: 'days' },
            { label: 'Months', value: 'months' },
            { label: 'Years', value: 'years' },
          ],
        },
      },
      maxPerSecond: {
        type: 'number',
        props: {
          label: t('Max. per second', this.props.currentLanguage),
          placeholder: t('Max. requests per second', this.props.currentLanguage),
        },
      },
      maxPerDay: {
        type: 'number',
        props: {
          label: t('Max. per day', this.props.currentLanguage),
          placeholder: t('Max. requests per day', this.props.currentLanguage),
        },
      },
      maxPerMonth: {
        type: 'number',
        props: {
          label: t('Max. per month', this.props.currentLanguage),
          placeholder: t('Max. requests per month', this.props.currentLanguage),
        },
      },
      costPerMonth: {
        type: 'number',
        props: {
          label: t('Cost per month', this.props.currentLanguage),
          placeholder: t('Cost per month', this.props.currentLanguage),
        },
      },
      costPerAdditionalRequest: {
        type: 'number',
        props: {
          label: t('Cost per add. req.', this.props.currentLanguage),
          placeholder: t('Cost per additionnal request', this.props.currentLanguage),
        },
      },
      'currency.code': {
        type: 'select',
        props: {
          label: t('Currency', this.props.currentLanguage),
          possibleValues: currencies.map(c => ({
            label: `${c.name} (${c.symbol})`,
            value: c.code,
          })),
        },
      },
      customName: {
        type: 'string',
        props: {
          label: t('Name', this.props.currentLanguage),
          placeholder: t('Plan name', this.props.currentLanguage),
        },
      },
      customDescription: {
        type: 'string',
        props: {
          label: t('Description', this.props.currentLanguage),
          placeholder: t('Plan description', this.props.currentLanguage),
        },
      },
      ...this.otoroshiForm(found),
      ...this.securityForm(found)
    };
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm flow={flow} schema={schema} value={found} onChange={this.onChange} />
      </React.Suspense>
    );
  };

  renderPayPerUse = plan => {
    const found = _.find(this.props.value.possibleUsagePlans, p => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        serviceGroup: null,
      };
    }
    const flow = [
      '_id',
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      `>>> ${t('Billing', this.props.currentLanguage)}`,
      'costPerMonth',
      'costPerRequest',
      'currency.code',
      'billingDuration.value',
      'billingDuration.unit',
      `>>> ${t('Trial', this.props.currentLanguage)}`,
      'trialPeriod.value',
      'trialPeriod.unit',
      ...this.otoroshiFlow(found),
      ...this.securityFlow(found)
    ];
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Id', this.props.currentLanguage),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        props: {
          label: t('Type', this.props.currentLanguage),
          possibleValues: [
            { label: t('FreeWithoutQuotas', this.props.currentLanguage, false, 'Free without quotas'), value: 'FreeWithoutQuotas' },
            { label: t('FreeWithQuotas', this.props.currentLanguage, false, 'Free with quotas'), value: 'FreeWithQuotas' },
            { label: t('QuotasWithLimits', this.props.currentLanguage, false, 'Quotas with limits'), value: 'QuotasWithLimits' },
            { label: t('QuotasWithoutLimits', this.props.currentLanguage, false, 'Quotas without limits'), value: 'QuotasWithoutLimits' },
            { label: t('PayPerUse', this.props.currentLanguage, false, 'Pay per use'), value: 'PayPerUse' },
          ],
        },
      },
      costPerMonth: {
        type: 'number',
        props: {
          label: t('Cost per month', this.props.currentLanguage),
          placeholder: t('Cost per month', this.props.currentLanguage),
        },
      },
      costPerRequest: {
        type: 'number',
        props: {
          label: t('Cost per req.', this.props.currentLanguage),
          placeholder: t('Cost per request', this.props.currentLanguage),
        },
      },
      'currency.code': {
        type: 'select',
        props: {
          label: t('Currency', this.props.currentLanguage),
          possibleValues: currencies.map(c => ({
            label: `${c.name} (${c.symbol})`,
            value: c.code,
          })),
        },
      },
      'billingDuration.value': {
        type: 'number',
        props: {
          label: t('Billing every', this.props.currentLanguage),
        },
      },
      'billingDuration.unit': {
        type: 'select',
        props: {
          label: t('Billing every', this.props.currentLanguage),
          possibleValues: [
            { label: 'Hours', value: 'hours' },
            { label: 'Days', value: 'days' },
            { label: 'Months', value: 'months' },
            { label: 'Years', value: 'years' },
          ],
        },
      },
      allowMultipleKeys: {
        type: 'bool',
        props: {
          label: t('Allow multiple apiKey demands', this.props.currentLanguage),
        },
      },
      'trialPeriod.value': {
        type: 'number',
        props: {
          label: t('Trial period', this.props.currentLanguage),
          placeholder: t('The trial period', this.props.currentLanguage),
        },
      },
      'trialPeriod.unit': {
        type: 'select',
        props: {
          label: t('Trial period unit', this.props.currentLanguage),
          possibleValues: [
            { label: 'Hours', value: 'hours' },
            { label: 'Days', value: 'days' },
            { label: 'Months', value: 'months' },
            { label: 'Years', value: 'years' },
          ],
        },
      },
      customName: {
        type: 'string',
        props: {
          label: t('Name', this.props.currentLanguage),
          placeholder: t('Plan name', this.props.currentLanguage),
        },
      },
      customDescription: {
        type: 'string',
        props: {
          label: t('Description', this.props.currentLanguage),
          placeholder: t('Plan description', this.props.currentLanguage),
        },
      },
      ...this.otoroshiForm(found),
      ...this.securityForm(found)
    };
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm flow={flow} schema={schema} value={found} onChange={this.onChange} />
      </React.Suspense>
    );
  };

  isSelected = plan => {
    return this.state.selected && plan._id === this.state.selected._id;
  };

  addNewPlan = () => {
    let plans = _.cloneDeep(this.props.value.possibleUsagePlans);
    const newPlan = newPossibleUsagePlan(faker.commerce.productName() + ' plan');
    plans.push(newPlan);
    const value = _.cloneDeep(this.props.value);
    value.possibleUsagePlans = plans;
    this.props.onChange(value);
    this.select(newPlan);
  };

  deletePlan = () => {
    window
      .confirm(
        t(
          'delete.plan.confirm',
          this.props.currentLanguage,
          'Are you sure you want to delete this plan ?'
        )
      )
      .then(ok => {
        if (ok) {
          let plans = _.cloneDeep(this.props.value.possibleUsagePlans).filter(
            p => p._id !== this.state.selected._id
          );
          const value = _.cloneDeep(this.props.value);
          value.possibleUsagePlans = plans;
          this.setState({ selected: plans.length ? plans[0] : null }, () => {
            this.props.onChange(value);
          });
        }
      });
  };

  makesDefault = () => {
    if (this.state.selected.visibility === PUBLIC) {
      const value = _.cloneDeep(this.props.value);
      value.defaultUsagePlan = this.state.selected._id;
      this.props.onChange(value);
    }
  };

  makePrivate = () => {
    if (this.props.value.defaultUsagePlan !== this.state.selected._id) {
      const originalVisibility = this.state.selected.visibility;
      const visibility = originalVisibility === PUBLIC ? PRIVATE : PUBLIC;
      const updatedPlan = { ...this.state.selected, visibility };
      this.select(updatedPlan);

      const updatedValue = {
        ...this.props.value,
        possibleUsagePlans: [
          ...this.props.value.possibleUsagePlans.filter(pp => pp._id !== this.state.selected._id),
          updatedPlan,
        ],
      };

      this.props.onChange(updatedValue);
    }
  };

  planToOption = plan => {
    return {
      label:
        this.props.value.defaultUsagePlan === plan._id ? (
          <span>
            <i className="fas fa-star" /> {plan.customName || plan.type}
          </span>
        ) : plan.visibility === PRIVATE ? (
          <span>
            <i className="fas fa-mask" /> {plan.customName || plan.type}
          </span>
        ) : (
          <span>{plan.customName || plan.type}</span>
        ),
      default: this.props.value.defaultUsagePlan === plan._id,
      value: plan._id,
      plan,
    };
  };

  render() {
    if (this.props.value === null) return null;

    if (!this.props.value.possibleUsagePlans.length) {
      return (
        <button onClick={this.addNewPlan} type="button" className="btn btn-sm btn-outline-primary">
          <i className="fas fa-plus mr-1" />
          <Translation i18nkey="add a new plan" language={this.props.currentLanguage}>
            add a new plan
          </Translation>
        </button>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 100 }}>
        <div
          style={{
            padding: 10,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            paddingBottom: 20,
            borderBottom: '1px solid #DFDFDF',
          }}>
          {this.props.value.visibility !== 'AdminOnly' && <button
            onClick={this.addNewPlan}
            type="button"
            className="btn btn-sm btn-outline-primary float-right">
            <i className="fas fa-plus mr-1" />
            <Translation i18nkey="add a new plan" language={this.props.currentLanguage}>
              add a new plan
            </Translation>
          </button>}
          <div style={{ width: '100%', marginLeft: 10 }}>
            <Select
              clearable={false}
              style={{ width: '100%' }}
              value={this.planToOption(
                this.state.selected ? this.state.selected : this.props.value.possibleUsagePlans[0]
              )}
              placeholder="Select a plan to edit it"
              options={this.props.value.possibleUsagePlans.map(this.planToOption)}
              onChange={e => this.select(e.plan)}
              classNamePrefix="reactSelect"
              className="reactSelect"
            />
          </div>
        </div>
        <div className="col-12">
          {!!this.state.selected && (
            <div>
              <div className="d-flex justify-content-end">
                {this.props.value.defaultUsagePlan !== this.state.selected._id &&
                  this.state.selected.visibility !== PRIVATE && (
                    <button
                      onClick={this.makesDefault}
                      type="button"
                      className="btn btn-sm btn-outline-primary mr-1 mb-2">
                      <i className="fas fa-star mr-1" title="Default plan" />
                      <Translation
                        i18nkey="Make default plan"
                        language={this.props.currentLanguage}>
                        Make default plan
                      </Translation>
                    </button>
                  )}
                {this.props.value.defaultUsagePlan !== this.state.selected._id && (
                  <button
                    onClick={this.makePrivate}
                    type="button"
                    className="btn btn-sm btn-outline-primary mb-2 mr-1">
                    <i
                      className={classNames('fas mr-1', {
                        'fa-lock': this.state.selected.visibility === 'Public',
                        'fa-unlock': this.state.selected.visibility === 'Private',
                      })}
                    />
                    {this.state.selected.visibility === 'Public' && (
                      <Translation i18nkey="Make it private" language={this.props.currentLanguage}>
                        Make it private
                      </Translation>
                    )}
                    {this.state.selected.visibility === 'Private' && (
                      <Translation i18nkey="Make it public" language={this.props.currentLanguage}>
                        Make it public
                      </Translation>
                    )}
                  </button>
                )}
                {this.props.value.visibility !== 'AdminOnly' && <button
                  onClick={this.deletePlan}
                  type="button"
                  className="btn btn-sm btn-outline-danger mb-2">
                  <i className="fas fa-trash mr-1" />
                  <Translation i18nkey="Delete plan" language={this.props.currentLanguage}>
                    Delete plan
                  </Translation>
                </button>}
              </div>
              {this.state.selected.type === 'Admin' &&
                this.renderAdmin(this.state.selected)}
              {this.state.selected.type === 'FreeWithoutQuotas' &&
                this.renderFreeWithoutQuotas(this.state.selected)}
              {this.state.selected.type === 'FreeWithQuotas' &&
                this.renderFreeWithQuotas(this.state.selected)}
              {this.state.selected.type === 'QuotasWithLimits' &&
                this.renderQuotasWithLimits(this.state.selected)}
              {this.state.selected.type === 'QuotasWithoutLimits' &&
                this.renderQuotasWithoutLimits(this.state.selected)}
              {this.state.selected.type === 'PayPerUse' &&
                this.renderPayPerUse(this.state.selected)}
            </div>
          )}
        </div>
      </div>
    );
  }
}
