import React, { useState, useEffect, useRef } from 'react';
import _ from 'lodash';
import { currencies } from '../../../services/currencies';
import faker from 'faker';
import Select, { components } from 'react-select';
import CreatableSelect from 'react-select/creatable';
import classNames from 'classnames';

import { Spinner, newPossibleUsagePlan, Option } from '../../utils';
import { t, Translation } from '../../../locales';
import * as Services from '../../../services';
import { Help } from '../../inputs';
import { toastr } from 'react-redux-toastr';
import { connect } from 'react-redux';
import { openApiSelectModal } from '../../../core';

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


const OtoroshiServicesAndGroupSelector = props => {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState(undefined);
  const [services, setServices] = useState(undefined);
  const [disabled, setDisabled] = useState(true);
  const [value, setValue] = useState(undefined);

  useEffect(() => {
    Promise.all([
      Services.getOtoroshiGroups(props.tenant._id, props._found.otoroshiTarget.otoroshiSettings),
      Services.getOtoroshiServices(props.tenant._id, props._found.otoroshiTarget.otoroshiSettings)
    ]).then(([groups, services]) => {
      setGroups(groups.map(g => ({ label: g.name, value: g.id, type: 'group' })));
      setServices(services.map(g => ({ label: g.name, value: g.id, type: 'service' })));
    });
  }, []);

  useEffect(() => {
    if (groups && services) {
      setLoading(false);
    }
  }, [services, groups]);

  useEffect(() => {
    if (!!groups && !!services && !!props._found.otoroshiTarget.authorizedEntities) {
      setValue([
        ...props._found.otoroshiTarget.authorizedEntities.groups.map(authGroup => groups.find(g => g.value === authGroup)),
        ...props._found.otoroshiTarget.authorizedEntities.services.map(authService => services.find(g => g.value === authService))
      ].filter(f => f));
    }
  }, [props._found, groups, services]);

  useEffect(() => {
    const otoroshiTarget = props._found.otoroshiTarget;
    setDisabled(!otoroshiTarget || !otoroshiTarget.otoroshiSettings);
  }, [props._found.otoroshiTarget, loading]);

  const onChange = v => {

    if (!v) {
      props.onChange(null);
      setValue(undefined);
    } else {
      const value = v.reduce((acc, entitie) => {
        switch (entitie.type) {
          case 'group':
            return { ...acc, groups: [...acc.groups, groups.find(g => g.value === entitie.value).value] };
          case 'service':
            return { ...acc, services: [...acc.services, services.find(s => s.value === entitie.value).value] };
        }
      }, { groups: [], services: [] });
      setValue([...value.groups.map(authGroup => groups.find(g => g.value === authGroup)),
      ...value.services.map(authService => services.find(g => g.value === authService))]);
      props.onChange(value);
    }
  };

  return (
    <div className="form-group row">
      <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
        <Help text={props.help} label={props.label} />
      </label>
      <div className="col-sm-10 d-flex flex-column">
        <Select
          id={`input-${props.label}`}
          isMulti
          name={`${props.label}-search`}
          isLoading={loading}
          isDisabled={disabled && !loading}
          placeholder={props.placeholder}
          components={(props) => <components.Group {...props} />}
          options={[{ label: 'Service groups', options: groups }, { label: 'Services', options: services }]}
          value={value}
          onChange={onChange}
          classNamePrefix="reactSelect"
          className="reactSelect"
        />
        <div className="col-12 d-flex flex-row mt-1">
          <div className="d-flex flex-column flex-grow-1">
            <strong className="font-italic">
              <Translation i18nkey="Authorized Groups" language={props.currentLanguage}>
                Authorized Groups
              </Translation>
            </strong>
            {!!value && value.filter(x => x.type === 'group').map((g, idx) => <span className="font-italic" key={idx}>{g.label}</span>)}
          </div>
          <div className="d-flex flex-column flex-grow-1">
            <strong className="font-italic">
              <Translation i18nkey="Authorized Services" language={props.currentLanguage}>
                Authorized Services
              </Translation>
            </strong>
            {!!value && value.filter(x => x.type === 'service').map((g, idx) => <span className="font-italic" key={idx}>{g.label}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
};

function usePrevious(value) {
  const ref = useRef();
  useEffect(() => { ref.current = value }, [value]);
  return ref.current;
}

function TeamApiPricingComponent({ value, tenant, currentLanguage, ...props }) {
  const [selected, setSelected] = useState(value.possibleUsagePlans[0])
  const [otoroshiSettings, setOtoroshiSettings] = useState([]);

  const prevValue = usePrevious(value)

  useEffect(() => {
    Services.allSimpleOtoroshis(tenant._id)
      .then(settings => setOtoroshiSettings(settings));
  }, [])

  useEffect(() => {
    if (prevValue) {
      if (prevValue.possibleUsagePlans.length < value.possibleUsagePlans.length)
        setSelected(value.possibleUsagePlans.slice(-1)[0])
      else if (!equals(
        prevValue.possibleUsagePlans.map(p => p._id).sort(),
        value.possibleUsagePlans.map(p => p._id).sort()))
        setSelected(value.possibleUsagePlans[0])
    }
  }, [props.params.versionId, value.possibleUsagePlans])

  function equals(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i])
  }

  function otoroshiFlow(_found) {
    if (
      !(
        !!_found.otoroshiTarget &&
        !!_found.otoroshiTarget.otoroshiSettings &&
        !!_found.otoroshiTarget.authorizedEntities
      )
    ) {
      return [
        `>>> ${t('Otoroshi', currentLanguage)}`,
        'otoroshiTarget.otoroshiSettings',
        'otoroshiTarget.authorizedEntities',
      ];
    }
    return [
      `>>> ${t('Otoroshi', currentLanguage)}`,
      'otoroshiTarget.otoroshiSettings',
      'otoroshiTarget.authorizedEntities',
      'otoroshiTarget.apikeyCustomization.clientIdOnly',
      'otoroshiTarget.apikeyCustomization.readOnly',
      'otoroshiTarget.apikeyCustomization.constrainedServicesOnly',
      'otoroshiTarget.apikeyCustomization.dynamicPrefix',
      'otoroshiTarget.apikeyCustomization.tags',
      'otoroshiTarget.apikeyCustomization.metadata',
      'otoroshiTarget.apikeyCustomization.customMetadata',
      'otoroshiTarget.apikeyCustomization.restrictions.enabled',
      'otoroshiTarget.apikeyCustomization.restrictions.allowLast',
      'otoroshiTarget.apikeyCustomization.restrictions.allowed',
      'otoroshiTarget.apikeyCustomization.restrictions.forbidden',
      'otoroshiTarget.apikeyCustomization.restrictions.notFound',
    ];
  };

  function otoroshiForm(_found) {
    const firstPartOfOtoroshiForm = {
      'otoroshiTarget.otoroshiSettings': {
        type: 'select',
        props: {
          label: t('Otoroshi instance', currentLanguage),
          possibleValues: otoroshiSettings.map((s) => ({
            label: s.url,
            value: s._id,
          })),
        },
      },
      'otoroshiTarget.authorizedEntities': {
        type: OtoroshiServicesAndGroupSelector,
        props: {
          label: t('Authorized entities', currentLanguage),
          _found,
          placeholder: t('Authorized.entities.placeholder', currentLanguage),
          tenant: tenant,
          help: t('authorized.entities.help', currentLanguage),

        },
      },
    };
    if (
      !(
        !!_found.otoroshiTarget &&
        !!_found.otoroshiTarget.otoroshiSettings &&
        !!_found.otoroshiTarget.authorizedEntities
      )
    ) {
      return firstPartOfOtoroshiForm;
    }
    return {
      ...firstPartOfOtoroshiForm,
      'otoroshiTarget.apikeyCustomization.clientIdOnly': {
        type: 'bool',
        props: {
          label: t('Apikey with clientId only', currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.readOnly': {
        type: 'bool',
        props: {
          label: t('Read only apikey', currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.constrainedServicesOnly': {
        type: 'bool',
        props: {
          label: t('Constrained services only', currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.dynamicPrefix': {
        type: 'string',
        props: {
          label: t('Dynamic prefix', currentLanguage),
          help: t(
            'dynamic.prefix.help',
            currentLanguage,
            false,
            'the prefix used in tags and metadata used to target dynamic values that will be updated if the value change in the original plan'
          ),
        },
      },
      'otoroshiTarget.apikeyCustomization.metadata': {
        type: 'object',
        props: {
          label: t('Automatic API key metadata', currentLanguage),
          help: t(
            'automatic.metadata.help',
            currentLanguage,
            false,
            'Automatic metadata will be calculated on subscription acceptation'
          ),
        },
      },
      'otoroshiTarget.apikeyCustomization.customMetadata': {
        type: CustomMetadataInput,
        props: {
          label: t('Custom Apikey metadata', currentLanguage),
          toastr: () => toastr.info(t('sub.process.update.to.manual', currentLanguage)),
          help: t(
            'custom.metadata.help',
            currentLanguage,
            false,
            'custom metadata will have to be filled during subscription validation. Subscripption process will be switched to manual'
          ),
        },
      },
      'otoroshiTarget.apikeyCustomization.tags': {
        type: 'array',
        props: {
          label: t('Apikey tags', currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.restrictions.enabled': {
        type: 'bool',
        props: {
          label: t('Enable restrictions', currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.restrictions.allowLast': {
        type: 'bool',
        props: {
          label: t('Allow at last', currentLanguage),
          help: t(
            'allow.least.help',
            currentLanguage,
            'Allowed path will be evaluated at last'
          ),
        },
      },
      'otoroshiTarget.apikeyCustomization.restrictions.allowed': {
        type: OtoroshiPathInput,
        props: {
          label: t('Allowed pathes', currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.restrictions.forbidden': {
        type: OtoroshiPathInput,
        props: {
          label: t('Forbidden pathes', currentLanguage),
        },
      },
      'otoroshiTarget.apikeyCustomization.restrictions.notFound': {
        type: OtoroshiPathInput,
        props: {
          label: t('Not found pathes', currentLanguage),
        },
      },
    };
  };

  function securityFlow(_found) {
    return [
      `>>> ${t('Security', currentLanguage)}`,
      'autoRotation',
      'subscriptionProcess',
      'integrationProcess',
    ];
  };

  function securityForm(_found) {
    return {
      autoRotation: {
        type: 'bool',
        props: {
          label: t('Force apikey auto-rotation', currentLanguage),
        },
      },
      subscriptionProcess: {
        type: 'select',
        disabled:
          _found.otoroshiTarget.apikeyCustomization.customMetadata &&
          !!_found.otoroshiTarget.apikeyCustomization.customMetadata.length,
        props: {
          label: t('Subscription', currentLanguage),
          possibleValues: [
            {
              label: t('Automatic', currentLanguage),
              value: 'Automatic',
            },
            { label: t('Manual', currentLanguage), value: 'Manual' },
          ],
        },
      },
      integrationProcess: {
        type: 'select',
        props: {
          label: t('Integration', currentLanguage),
          possibleValues: [
            {
              label: t('Automatic', currentLanguage),
              value: 'Automatic',
            },
            { label: t('ApiKey', currentLanguage), value: 'ApiKey' },
          ],
        },
      },
    };
  };

  function smartNameAndDescription(newType) {
    let response = {};
    if (newType !== selected.type) {
      const { customName, customDescription, type } = selected;
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

  function onChange(v) {
    if (!v.currency) {
      v.currency = { code: 'EUR' };
    }
    v = { ...v, ...smartNameAndDescription(v.type) };
    const selected = value.possibleUsagePlans.filter((p) => p._id === v._id)[0];
    const idx = value.possibleUsagePlans.indexOf(selected);
    let plans = _.cloneDeep(value.possibleUsagePlans);
    plans.splice(idx, 1, v);
    const newValue = _.cloneDeep(value);
    newValue.possibleUsagePlans = plans;
    props.onChange(newValue);
    setSelected(v);
  };

  function renderAdmin(plan) {
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }
    const flow = ['_id', 'type', 'customName', 'customDescription', ...otoroshiFlow(found)];
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Id', currentLanguage),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        disabled: true,
        props: {
          label: t('Type', currentLanguage),
          possibleValues: [
            {
              label: t(
                'FreeWithoutQuotas',
                currentLanguage,
                false,
                'Free without quotas'
              ),
              value: 'FreeWithoutQuotas',
            },
            {
              label: t('FreeWithQuotas', currentLanguage, false, 'Free with quotas'),
              value: 'FreeWithQuotas',
            },
            {
              label: t('QuotasWithLimits', currentLanguage, false, 'Quotas with limits'),
              value: 'QuotasWithLimits',
            },
            {
              label: t(
                'QuotasWithoutLimits',
                currentLanguage,
                false,
                'Quotas without limits'
              ),
              value: 'QuotasWithoutLimits',
            },
            {
              label: t('PayPerUse', currentLanguage, false, 'Pay per use'),
              value: 'PayPerUse',
            },
          ],
        },
      },
      customName: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Name', currentLanguage),
          placeholder: t('Plan name', currentLanguage),
        },
      },
      customDescription: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Description', currentLanguage),
          placeholder: t('Plan description', currentLanguage),
        },
      },
      ...otoroshiForm(found),
    };
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          flow={flow}
          schema={schema}
          value={found}
          onChange={onChange}
          currentLanguage={currentLanguage}
        />
      </React.Suspense>
    );
  };

  function renderFreeWithoutQuotas(plan) {
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }
    const flow = [
      '_id',
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      found.aggregationApiKeysSecurity ? 'aggregationApiKeysSecurity' : (tenant.aggregationApiKeysSecurity ? 'aggregationApiKeysSecurity' : undefined),
      `>>> ${t('Billing', currentLanguage)}`,
      'billingDuration.value',
      'billingDuration.unit',
      ...otoroshiFlow(found),
      ...securityFlow(found),
    ].filter(f => f);
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Id', currentLanguage),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        props: {
          label: t('Type', currentLanguage),
          possibleValues: [
            {
              label: t(
                'FreeWithoutQuotas',
                currentLanguage,
                false,
                'Free without quotas'
              ),
              value: 'FreeWithoutQuotas',
            },
            {
              label: t('FreeWithQuotas', currentLanguage, false, 'Free with quotas'),
              value: 'FreeWithQuotas',
            },
            {
              label: t('QuotasWithLimits', currentLanguage, false, 'Quotas with limits'),
              value: 'QuotasWithLimits',
            },
            {
              label: t(
                'QuotasWithoutLimits',
                currentLanguage,
                false,
                'Quotas without limits'
              ),
              value: 'QuotasWithoutLimits',
            },
            {
              label: t('PayPerUse', currentLanguage, false, 'Pay per use'),
              value: 'PayPerUse',
            },
          ],
        },
      },
      'billingDuration.value': {
        type: 'number',
        props: {
          label: t('Billing every', currentLanguage),
        },
      },
      'billingDuration.unit': {
        type: 'select',
        props: {
          label: t('Billing every', currentLanguage),
          possibleValues: [
            { label: t('Hours', currentLanguage), value: 'Hour' },
            { label: t('Days', currentLanguage), value: 'Day' },
            { label: t('Months', currentLanguage), value: 'Month' },
            { label: t('Years', currentLanguage), value: 'Year' },
          ],
        },
      },
      customName: {
        type: 'string',
        props: {
          label: t('Name', currentLanguage),
          placeholder: t('Plan name', currentLanguage),
        },
      },
      customDescription: {
        type: 'string',
        props: {
          label: t('Description', currentLanguage),
          placeholder: t('Plan description', currentLanguage),
        },
      },
      allowMultipleKeys: {
        type: 'bool',
        props: {
          label: t('Allow multiple apiKey demands', currentLanguage),
        },
      },
      aggregationApiKeysSecurity: {
        type: 'bool',
        props: {
          label: t('aggregation api keys security', currentLanguage),
          help: t(
            'aggregation_apikeys.security.help',
            currentLanguage
          )
        },
      },
      ...otoroshiForm(found),
      ...securityForm(found),
    };
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          flow={flow}
          schema={schema}
          value={found}
          onChange={onChange}
          currentLanguage={currentLanguage}
        />
      </React.Suspense>
    );
  };

  function renderFreeWithQuotas(plan) {
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }
    const flow = [
      '_id',
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      found.aggregationApiKeysSecurity ? 'aggregationApiKeysSecurity' : (tenant.aggregationApiKeysSecurity ? 'aggregationApiKeysSecurity' : undefined),
      `>>> ${t('Quotas', currentLanguage)}`,
      'maxPerSecond',
      'maxPerDay',
      'maxPerMonth',
      `>>> ${t('Billing', currentLanguage)}`,
      'billingDuration.value',
      'billingDuration.unit',
      ...otoroshiFlow(found),
      ...securityFlow(found),
    ].filter(f => f);
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Id', currentLanguage),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        props: {
          label: t('Type', currentLanguage),
          possibleValues: [
            {
              label: t(
                'FreeWithoutQuotas',
                currentLanguage,
                false,
                'Free without quotas'
              ),
              value: 'FreeWithoutQuotas',
            },
            {
              label: t('FreeWithQuotas', currentLanguage, false, 'Free with quotas'),
              value: 'FreeWithQuotas',
            },
            {
              label: t('QuotasWithLimits', currentLanguage, false, 'Quotas with limits'),
              value: 'QuotasWithLimits',
            },
            {
              label: t(
                'QuotasWithoutLimits',
                currentLanguage,
                false,
                'Quotas without limits'
              ),
              value: 'QuotasWithoutLimits',
            },
            {
              label: t('PayPerUse', currentLanguage, false, 'Pay per use'),
              value: 'PayPerUse',
            },
          ],
        },
      },
      'billingDuration.value': {
        type: 'number',
        props: {
          label: t('Billing every', currentLanguage),
        },
      },
      'billingDuration.unit': {
        type: 'select',
        props: {
          label: t('Billing every', currentLanguage),
          possibleValues: [
            { label: t('Hours', currentLanguage), value: 'Hour' },
            { label: t('Days', currentLanguage), value: 'Day' },
            { label: t('Months', currentLanguage), value: 'Month' },
            { label: t('Years', currentLanguage), value: 'Year' },
          ],
        },
      },
      allowMultipleKeys: {
        type: 'bool',
        props: {
          label: t('Allow multiple apiKey demands', currentLanguage),
        },
      },
      aggregationApiKeysSecurity: {
        type: 'bool',
        props: {
          label: t('aggregation api keys security', currentLanguage),
          help: t(
            'aggregation_apikeys.security.help',
            currentLanguage
          )
        },
      },
      maxPerSecond: {
        type: 'number',
        props: {
          label: t('Max. per second', currentLanguage),
          placeholder: t('Max. requests per second', currentLanguage),
        },
      },
      maxPerDay: {
        type: 'number',
        props: {
          label: t('Max. per day', currentLanguage),
          placeholder: t('Max. requests per day', currentLanguage),
        },
      },
      maxPerMonth: {
        type: 'number',
        props: {
          label: t('Max. per month', currentLanguage),
          placeholder: t('Max. requests per month', currentLanguage),
        },
      },
      customName: {
        type: 'string',
        props: {
          label: t('Name', currentLanguage),
          placeholder: t('Plan name', currentLanguage),
        },
      },
      customDescription: {
        type: 'string',
        props: {
          label: t('Description', currentLanguage),
          placeholder: t('Plan description', currentLanguage),
        },
      },
      ...otoroshiForm(found),
      ...securityForm(found),
    };
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          flow={flow}
          schema={schema}
          value={found}
          onChange={onChange}
          currentLanguage={currentLanguage}
        />
      </React.Suspense>
    );
  };

  function renderQuotasWithLimits(plan) {
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }
    const flow = [
      '_id',
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      found.aggregationApiKeysSecurity ? 'aggregationApiKeysSecurity' : (tenant.aggregationApiKeysSecurity ? 'aggregationApiKeysSecurity' : undefined),
      `>>> ${t('Quotas', currentLanguage)}`,
      'maxPerSecond',
      'maxPerDay',
      'maxPerMonth',
      `>>> ${t('Trial', currentLanguage)}`,
      'trialPeriod.value',
      'trialPeriod.unit',
      `>>> ${t('Billing', currentLanguage)}`,
      'costPerMonth',
      'currency.code',
      'billingDuration.value',
      'billingDuration.unit',
      ...otoroshiFlow(found),
      ...securityFlow(found),
    ].filter(f => f);
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Id', currentLanguage),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        props: {
          label: t('Type', currentLanguage),
          possibleValues: [
            {
              label: t(
                'FreeWithoutQuotas',
                currentLanguage,
                false,
                'Free without quotas'
              ),
              value: 'FreeWithoutQuotas',
            },
            {
              label: t('FreeWithQuotas', currentLanguage, false, 'Free with quotas'),
              value: 'FreeWithQuotas',
            },
            {
              label: t('QuotasWithLimits', currentLanguage, false, 'Quotas with limits'),
              value: 'QuotasWithLimits',
            },
            {
              label: t(
                'QuotasWithoutLimits',
                currentLanguage,
                false,
                'Quotas without limits'
              ),
              value: 'QuotasWithoutLimits',
            },
            {
              label: t('PayPerUse', currentLanguage, false, 'Pay per use'),
              value: 'PayPerUse',
            },
          ],
        },
      },
      'billingDuration.value': {
        type: 'number',
        props: {
          label: t('Billing every', currentLanguage),
        },
      },
      'billingDuration.unit': {
        type: 'select',
        props: {
          label: t('Billing every', currentLanguage),
          possibleValues: [
            { label: t('Hours', currentLanguage), value: 'Hour' },
            { label: t('Days', currentLanguage), value: 'Day' },
            { label: t('Months', currentLanguage), value: 'Month' },
            { label: t('Years', currentLanguage), value: 'Year' },
          ],
        },
      },
      allowMultipleKeys: {
        type: 'bool',
        props: {
          label: t('Allow multiple apiKey demands', currentLanguage),
        },
      },
      aggregationApiKeysSecurity: {
        type: 'bool',
        props: {
          label: t('aggregation api keys security', currentLanguage),
          help: t(
            'aggregation_apikeys.security.help',
            currentLanguage
          )
        },
      },
      'trialPeriod.value': {
        type: 'number',
        props: {
          label: t('Trial period', currentLanguage),
          placeholder: t('The trial period', currentLanguage),
        },
      },
      'trialPeriod.unit': {
        type: 'select',
        props: {
          label: t('Trial period unit', currentLanguage),
          possibleValues: [
            { label: t('Hours', currentLanguage), value: 'Hour' },
            { label: t('Days', currentLanguage), value: 'Day' },
            { label: t('Months', currentLanguage), value: 'Month' },
            { label: t('Years', currentLanguage), value: 'Year' },
          ],
        },
      },
      maxPerSecond: {
        type: 'number',
        props: {
          label: t('Max. per second', currentLanguage),
          placeholder: t('Max. requests per second', currentLanguage),
        },
      },
      maxPerDay: {
        type: 'number',
        props: {
          label: t('Max. per day', currentLanguage),
          placeholder: t('Max. requests per day', currentLanguage),
        },
      },
      maxPerMonth: {
        type: 'number',
        props: {
          label: t('Max. per month', currentLanguage),
          placeholder: t('Max. requests per month', currentLanguage),
        },
      },
      costPerMonth: {
        type: 'number',
        props: {
          label: t('Cost per month', currentLanguage),
          placeholder: t('Cost per month', currentLanguage),
        },
      },
      'currency.code': {
        type: 'select',
        props: {
          label: t('Currency', currentLanguage),
          possibleValues: currencies.map((c) => ({
            label: `${c.name} (${c.symbol})`,
            value: c.code,
          })),
        },
      },
      customName: {
        type: 'string',
        props: {
          label: t('Name', currentLanguage),
          placeholder: t('Plan name', currentLanguage),
        },
      },
      customDescription: {
        type: 'string',
        props: {
          label: t('Description', currentLanguage),
          placeholder: t('Plan description', currentLanguage),
        },
      },
      ...otoroshiForm(found),
      ...securityForm(found),
    };
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          flow={flow}
          schema={schema}
          value={found}
          onChange={onChange}
          currentLanguage={currentLanguage}
        />
      </React.Suspense>
    );
  };

  function renderQuotasWithoutLimits(plan) {
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }
    const flow = [
      '_id',
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      found.aggregationApiKeysSecurity ? 'aggregationApiKeysSecurity' : (tenant.aggregationApiKeysSecurity ? 'aggregationApiKeysSecurity' : undefined),
      `>>> ${t('Quotas', currentLanguage)}`,
      'maxPerSecond',
      'maxPerDay',
      'maxPerMonth',
      `>>> ${t('Trial', currentLanguage)}`,
      'trialPeriod.value',
      'trialPeriod.unit',
      `>>> ${t('Billing', currentLanguage)}`,
      'costPerMonth',
      'costPerAdditionalRequest',
      'currency.code',
      'billingDuration.value',
      'billingDuration.unit',
      ...otoroshiFlow(found),
      ...securityFlow(found),
    ].filter(f => f);
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Id', currentLanguage),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        props: {
          label: t('Type', currentLanguage),
          possibleValues: [
            {
              label: t(
                'FreeWithoutQuotas',
                currentLanguage,
                false,
                'Free without quotas'
              ),
              value: 'FreeWithoutQuotas',
            },
            {
              label: t('FreeWithQuotas', currentLanguage, false, 'Free with quotas'),
              value: 'FreeWithQuotas',
            },
            {
              label: t('QuotasWithLimits', currentLanguage, false, 'Quotas with limits'),
              value: 'QuotasWithLimits',
            },
            {
              label: t(
                'QuotasWithoutLimits',
                currentLanguage,
                false,
                'Quotas without limits'
              ),
              value: 'QuotasWithoutLimits',
            },
            {
              label: t('PayPerUse', currentLanguage, false, 'Pay per use'),
              value: 'PayPerUse',
            },
          ],
        },
      },
      'billingDuration.value': {
        type: 'number',
        props: {
          label: t('Billing every', currentLanguage),
        },
      },
      'billingDuration.unit': {
        type: 'select',
        props: {
          label: t('Billing every', currentLanguage),
          possibleValues: [
            { label: t('Hours', currentLanguage), value: 'Hour' },
            { label: t('Days', currentLanguage), value: 'Day' },
            { label: t('Months', currentLanguage), value: 'Month' },
            { label: t('Years', currentLanguage), value: 'Year' },
          ],
        },
      },
      allowMultipleKeys: {
        type: 'bool',
        props: {
          label: t('Allow multiple apiKey demands', currentLanguage),
        },
      },
      aggregationApiKeysSecurity: {
        type: 'bool',
        props: {
          label: t('aggregation api keys security', currentLanguage),
          help: t(
            'aggregation_apikeys.security.help',
            currentLanguage
          )
        },
      },
      'trialPeriod.value': {
        type: 'number',
        props: {
          label: t('Trial period', currentLanguage),
          placeholder: t('The trial period', currentLanguage),
        },
      },
      'trialPeriod.unit': {
        type: 'select',
        props: {
          label: t('Trial period unit', currentLanguage),
          possibleValues: [
            { label: t('Hours', currentLanguage), value: 'Hour' },
            { label: t('Days', currentLanguage), value: 'Day' },
            { label: t('Months', currentLanguage), value: 'Month' },
            { label: t('Years', currentLanguage), value: 'Year' },
          ],
        },
      },
      maxPerSecond: {
        type: 'number',
        props: {
          label: t('Max. per second', currentLanguage),
          placeholder: t('Max. requests per second', currentLanguage),
        },
      },
      maxPerDay: {
        type: 'number',
        props: {
          label: t('Max. per day', currentLanguage),
          placeholder: t('Max. requests per day', currentLanguage),
        },
      },
      maxPerMonth: {
        type: 'number',
        props: {
          label: t('Max. per month', currentLanguage),
          placeholder: t('Max. requests per month', currentLanguage),
        },
      },
      costPerMonth: {
        type: 'number',
        props: {
          label: t('Cost per month', currentLanguage),
          placeholder: t('Cost per month', currentLanguage),
        },
      },
      costPerAdditionalRequest: {
        type: 'number',
        props: {
          label: t('Cost per add. req.', currentLanguage),
          placeholder: t('Cost per additionnal request', currentLanguage),
        },
      },
      'currency.code': {
        type: 'select',
        props: {
          label: t('Currency', currentLanguage),
          possibleValues: currencies.map((c) => ({
            label: `${c.name} (${c.symbol})`,
            value: c.code,
          })),
        },
      },
      customName: {
        type: 'string',
        props: {
          label: t('Name', currentLanguage),
          placeholder: t('Plan name', currentLanguage),
        },
      },
      customDescription: {
        type: 'string',
        props: {
          label: t('Description', currentLanguage),
          placeholder: t('Plan description', currentLanguage),
        },
      },
      ...otoroshiForm(found),
      ...securityForm(found),
    };
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          flow={flow}
          schema={schema}
          value={found}
          onChange={onChange}
          currentLanguage={currentLanguage}
        />
      </React.Suspense>
    );
  };

  function renderPayPerUse(plan) {
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }
    const flow = [
      '_id',
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      found.aggregationApiKeysSecurity ? 'aggregationApiKeysSecurity' : (tenant.aggregationApiKeysSecurity ? 'aggregationApiKeysSecurity' : undefined),
      `>>> ${t('Billing', currentLanguage)}`,
      'costPerMonth',
      'costPerRequest',
      'currency.code',
      'billingDuration.value',
      'billingDuration.unit',
      `>>> ${t('Trial', currentLanguage)}`,
      'trialPeriod.value',
      'trialPeriod.unit',
      ...otoroshiFlow(found),
      ...securityFlow(found),
    ].filter(f => f);
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: t('Id', currentLanguage),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        props: {
          label: t('Type', currentLanguage),
          possibleValues: [
            {
              label: t(
                'FreeWithoutQuotas',
                currentLanguage,
                false,
                'Free without quotas'
              ),
              value: 'FreeWithoutQuotas',
            },
            {
              label: t('FreeWithQuotas', currentLanguage, false, 'Free with quotas'),
              value: 'FreeWithQuotas',
            },
            {
              label: t('QuotasWithLimits', currentLanguage, false, 'Quotas with limits'),
              value: 'QuotasWithLimits',
            },
            {
              label: t(
                'QuotasWithoutLimits',
                currentLanguage,
                false,
                'Quotas without limits'
              ),
              value: 'QuotasWithoutLimits',
            },
            {
              label: t('PayPerUse', currentLanguage, false, 'Pay per use'),
              value: 'PayPerUse',
            },
          ],
        },
      },
      costPerMonth: {
        type: 'number',
        props: {
          label: t('Cost per month', currentLanguage),
          placeholder: t('Cost per month', currentLanguage),
        },
      },
      costPerRequest: {
        type: 'number',
        props: {
          label: t('Cost per req.', currentLanguage),
          placeholder: t('Cost per request', currentLanguage),
        },
      },
      'currency.code': {
        type: 'select',
        props: {
          label: t('Currency', currentLanguage),
          possibleValues: currencies.map((c) => ({
            label: `${c.name} (${c.symbol})`,
            value: c.code,
          })),
        },
      },
      'billingDuration.value': {
        type: 'number',
        props: {
          label: t('Billing every', currentLanguage),
        },
      },
      'billingDuration.unit': {
        type: 'select',
        props: {
          label: t('Billing every', currentLanguage),
          possibleValues: [
            { label: t('Hours', currentLanguage), value: 'Hour' },
            { label: t('Days', currentLanguage), value: 'Day' },
            { label: t('Months', currentLanguage), value: 'Month' },
            { label: t('Years', currentLanguage), value: 'Year' },
          ],
        },
      },
      allowMultipleKeys: {
        type: 'bool',
        props: {
          label: t('Allow multiple apiKey demands', currentLanguage),
        },
      },
      aggregationApiKeysSecurity: {
        type: 'bool',
        props: {
          label: t('aggregation api keys security', currentLanguage),
          help: t(
            'aggregation_apikeys.security.help',
            currentLanguage
          )
        },
      },
      'trialPeriod.value': {
        type: 'number',
        props: {
          label: t('Trial period', currentLanguage),
          placeholder: t('The trial period', currentLanguage),
        },
      },
      'trialPeriod.unit': {
        type: 'select',
        props: {
          label: t('Trial period unit', currentLanguage),
          possibleValues: [
            { label: t('Hours', currentLanguage), value: 'Hour' },
            { label: t('Days', currentLanguage), value: 'Day' },
            { label: t('Months', currentLanguage), value: 'Month' },
            { label: t('Years', currentLanguage), value: 'Year' },
          ],
        },
      },
      customName: {
        type: 'string',
        props: {
          label: t('Name', currentLanguage),
          placeholder: t('Plan name', currentLanguage),
        },
      },
      customDescription: {
        type: 'string',
        props: {
          label: t('Description', currentLanguage),
          placeholder: t('Plan description', currentLanguage),
        },
      },
      ...otoroshiForm(found),
      ...securityForm(found),
    };
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          flow={flow}
          schema={schema}
          value={found}
          onChange={onChange}
          currentLanguage={currentLanguage}
        />
      </React.Suspense>
    );
  };

  function addNewPlan() {
    let plans = _.cloneDeep(value.possibleUsagePlans);
    const newPlan = newPossibleUsagePlan(faker.commerce.productName() + ' plan');
    plans.push(newPlan);
    const newValue = _.cloneDeep(value);
    newValue.possibleUsagePlans = plans;
    props.onChange(newValue);
    setSelected(newPlan);
  };

  function importPlan() {
    props.openApiSelectModal({
      currentLanguage,
      api: value,
      teamId: props.teamId,
      onClose: () => {
        props.reload()
        setSelected(value.possibleUsagePlans.slice(-1)[0])
      }
    });
  }

  function clonePlan() {
    let plans = _.cloneDeep(value.possibleUsagePlans);
    const clone = {
      ..._.cloneDeep(selected),
      _id: faker.random.alphaNumeric(32),
      customName: `${selected.customName} (copy)`,
    };
    plans.push(clone);
    const value = _.cloneDeep(value);
    value.possibleUsagePlans = plans;
    props.onChange(value);
    setSelected(clone);
  };

  function deletePlan() {
    window
      .confirm(
        t(
          'delete.plan.confirm',
          currentLanguage,
          'Are you sure you want to delete this plan ?'
        )
      )
      .then((ok) => {
        if (ok) {
          let plans = _.cloneDeep(value.possibleUsagePlans).filter(
            (p) => p._id !== selected._id
          );
          const newValue = _.cloneDeep(value);
          newValue.possibleUsagePlans = plans;
          setSelected(plans.length ? plans[0] : null)
          props.onChange(newValue);
        }
      });
  };

  function makesDefault() {
    if (selected.visibility === PUBLIC) {
      const newValue = _.cloneDeep(value);
      newValue.defaultUsagePlan = selected._id;
      props.onChange(newValue);
    }
  };

  function makePrivate() {
    if (value.defaultUsagePlan !== selected._id) {
      const originalVisibility = selected.visibility;
      const visibility = originalVisibility === PUBLIC ? PRIVATE : PUBLIC;
      const updatedPlan = { ...selected, visibility };
      setSelected(updatedPlan);

      const updatedValue = {
        ...value,
        possibleUsagePlans: [
          ...value.possibleUsagePlans.filter((pp) => pp._id !== selected._id),
          updatedPlan,
        ],
      };

      props.onChange(updatedValue);
    }
  };

  function planToOption(plan) {
    if (!plan || value.possibleUsagePlans.length === 0)
      return null

    return {
      label:
        value.defaultUsagePlan === plan._id ? (
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
      default: value.defaultUsagePlan === plan._id,
      value: plan._id,
      plan,
    };
  };

  if (value === null)
    return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 100 }}>
      <div
        className="d-flex align-items-center justify-space-between py-3 mb-2"
        style={{ borderBottom: '1px solid #DFDFDF' }}>
        {value.visibility !== 'AdminOnly' && (
          <>
            <button
              onClick={addNewPlan}
              type="button"
              className="btn btn-outline-primary mr-1">
              {t('add a new plan', currentLanguage)}
            </button>
            <button
              onClick={importPlan}
              type="button"
              className="btn btn-outline-primary mr-1"
              style={{ marginTop: 0 }}>
              {t('import a plan', currentLanguage)}
            </button>
          </>
        )}
        <Select
          clearable={false}
          value={planToOption(selected)}
          placeholder="Select a plan to edit it"
          options={value.possibleUsagePlans.map(planToOption)}
          onChange={e => setSelected(e.plan)}
          classNamePrefix="reactSelect"
          className="reactSelect"
          styles={{
            container: base => ({
              ...base,
              flex: 1
            })
          }}
        />
      </div>
      <div className="col-12">
        {!!selected && value.possibleUsagePlans.find(p => p._id === selected._id) && (
          <div>
            <div className="d-flex justify-content-end">
              {value.defaultUsagePlan !== selected._id &&
                selected.visibility !== PRIVATE && (
                  <button
                    onClick={makesDefault}
                    type="button"
                    className="btn btn-sm btn-outline-primary mr-1 mb-2">
                    <i className="fas fa-star mr-1" title="Default plan" />
                    <Translation
                      i18nkey="Make default plan"
                      language={currentLanguage}>
                      Make default plan
                    </Translation>
                  </button>
                )}
              {value.defaultUsagePlan !== selected._id && (
                <button
                  onClick={makePrivate}
                  type="button"
                  className="btn btn-sm btn-outline-primary mb-2 mr-1">
                  <i
                    className={classNames('fas mr-1', {
                      'fa-lock': selected.visibility === 'Public',
                      'fa-unlock': selected.visibility === 'Private',
                    })}
                  />
                  {selected.visibility === 'Public' && (
                    <Translation i18nkey="Make it private" language={currentLanguage}>
                      Make it private
                    </Translation>
                  )}
                  {selected.visibility === 'Private' && (
                    <Translation i18nkey="Make it public" language={currentLanguage}>
                      Make it public
                    </Translation>
                  )}
                </button>
              )}
              {value.visibility !== 'AdminOnly' && (
                <button
                  onClick={clonePlan}
                  type="button"
                  className="btn btn-sm btn-outline-primary mb-2 mr-1">
                  <i className="fas fa-clone mr-1" />
                  <Translation i18nkey="Duplicate plan" language={currentLanguage}>
                    Duplicate plan
                  </Translation>
                </button>
              )}
              {value.visibility !== 'AdminOnly' && (
                <button
                  onClick={deletePlan}
                  type="button"
                  className="btn btn-sm btn-outline-danger mb-2">
                  <i className="fas fa-trash mr-1" />
                  <Translation i18nkey="Delete plan" language={currentLanguage}>
                    Delete plan
                  </Translation>
                </button>
              )}
            </div>
            {selected.type === 'Admin' && renderAdmin(selected)}
            {selected.type === 'FreeWithoutQuotas' && renderFreeWithoutQuotas(selected)}
            {selected.type === 'FreeWithQuotas' && renderFreeWithQuotas(selected)}
            {selected.type === 'QuotasWithLimits' && renderQuotasWithLimits(selected)}
            {selected.type === 'QuotasWithoutLimits' && renderQuotasWithoutLimits(selected)}
            {selected.type === 'PayPerUse' && renderPayPerUse(selected)}
          </div>
        )}
      </div>
    </div>
  );
}

const CustomMetadataInput = (props) => {
  const changeValue = (possibleValues, key) => {
    const oldValue = Option(props.value.find((x) => x.key === key)).getOrElse({ '': '' });
    const newValues = [
      ...props.value.filter((x) => x.key !== key),
      { ...oldValue, key, possibleValues },
    ];
    props.onChange(newValues);
  };

  const changeKey = (e, oldName) => {
    if (e && e.preventDefault) e.preventDefault();

    const oldValue = Option(props.value.find((x) => x.key === oldName)).getOrElse({ '': '' });
    const newValues = [
      ...props.value.filter((x) => x.key !== oldName),
      { ...oldValue, key: e.target.value },
    ];
    props.onChange(newValues);
  };

  const addFirst = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!props.value || props.value.length === 0) {
      props.onChange([{ key: '', possibleValues: [] }]);
      props.changeValue('subscriptionProcess', 'Manual');
      props.toastr();
    }
  };

  const addNext = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const newItem = { key: '', possibleValues: [] };
    const newValues = [...props.value, newItem];
    props.onChange(newValues);
  };

  const remove = (e, key) => {
    if (e && e.preventDefault) e.preventDefault();

    props.onChange(props.value.filter((x) => x.key !== key));
  };

  return (
    <div>
      {props.value.length === 0 && (
        <div className="form-group row">
          <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
            <Help text={props.help} label={props.label} />
          </label>
          <div className="col-sm-10">
            <button
              disabled={props.disabled}
              type="button"
              className="btn btn-outline-primary"
              onClick={addFirst}>
              <i className="fas fa-plus" />{' '}
            </button>
          </div>
        </div>
      )}
      {props.value.map(({ key, possibleValues }, idx) => (
        <div key={`form-group-${idx}`} className="row mb-2">
          {idx === 0 && (
            <label className="col-xs-12 col-sm-2 col-form-label">
              <Help text={props.help} label={props.label} />
            </label>
          )}
          {idx > 0 && <label className="col-xs-12 col-sm-2 col-form-label">&nbsp;</label>}
          <div className="col-sm-10 d-flex">
            <div className="input-group">
              <input
                disabled={props.disabled}
                type="text"
                className="form-control col-5 mr-1"
                placeholder={props.placeholderKey}
                value={key}
                onChange={(e) => changeKey(e, key)}
              />
              <CreatableSelect
                isMulti
                onChange={(e) =>
                  changeValue(
                    e.map(({ value }) => value),
                    key
                  )
                }
                options={undefined}
                value={possibleValues.map((value) => ({ label: value, value }))}
                className="input-select reactSelect flex-grow-1"
                classNamePrefix="reactSelect"
              />

              <span
                className="input-group-append"
                style={{ height: 'calc(1.5em + 0.75rem + 2px)' }}>
                <button
                  disabled={props.disabled}
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={(e) => remove(e, key)}>
                  <i className="fas fa-trash" />
                </button>
                {idx === props.value.length - 1 && (
                  <button
                    disabled={props.disabled}
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={addNext}>
                    <i className="fas fa-plus" />{' '}
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const OtoroshiPathInput = (props) => {
  const [pathes, setPathes] = useState(props.value || []);

  useEffect(() => {
    props.onChange(pathes);
  }, [pathes]);

  const httpMethods = [
    '*',
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'DELETE',
    'CONNECT',
    'OPTIONS',
    'TRACE',
    'PATCH',
  ];

  const addItem = () => setPathes([...pathes, { method: '*', path: '/*' }]);
  const removeItem = (idx) => {
    const _pathes = [...pathes];
    _pathes.splice(idx - 1, 1);
    setPathes(_pathes);
  };

  const changeMethod = (method, idx) => {
    const _pathes = [...pathes];
    _pathes.splice(idx, 1, { ...pathes[idx], method });
    setPathes(_pathes);
  };

  const changePath = (path, idx) => {
    const _pathes = [...pathes];
    _pathes.splice(idx, 1, { ...pathes[idx], path });
    setPathes(_pathes);
  };

  return (
    <div>
      {props.value.length === 0 && (
        <div className="form-group row">
          <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
            <Help text={props.help} label={props.label} />
          </label>
          <div className="col-sm-10">
            <button
              disabled={props.disabled}
              type="button"
              className="btn btn-outline-primary"
              onClick={addItem}>
              <i className="fas fa-plus" />{' '}
            </button>
          </div>
        </div>
      )}
      {pathes.map(({ method, path }, idx) => (
        <div key={`form-group-${idx}`} className="row mb-2">
          {idx === 0 && (
            <label className="col-xs-12 col-sm-2 col-form-label">
              <Help text={props.help} label={props.label} />
            </label>
          )}
          {idx > 0 && <label className="col-xs-12 col-sm-2 col-form-label">&nbsp;</label>}
          <div className="col-sm-10 d-flex">
            <div className="input-group">
              <Select
                placeholder="Select a language"
                options={httpMethods.sort().map((l) => ({ label: l, value: l }))}
                type="text"
                className="reactSelect flex-grow-1 mr-1"
                value={{ label: method, value: method }}
                onChange={(e) => changeMethod(e.value, idx)}
                classNamePrefix="reactSelect"
              />
              <input
                onChange={(e) => changePath(e.target.value, idx)}
                value={path}
                className="input-select reactSelect flex-grow-1"
                classNamePrefix="reactSelect"
              />

              <span
                className="input-group-append"
                style={{ height: 'calc(1.5em + 0.75rem + 2px)' }}>
                <button
                  disabled={props.disabled}
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => removeItem(idx)}>
                  <i className="fas fa-trash" />
                </button>
                {idx === props.value.length - 1 && (
                  <button
                    disabled={props.disabled}
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={addItem}>
                    <i className="fas fa-plus" />{' '}
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};


const mapStateToProps = (state) => ({
  ...state.context,
  error: state.error,
});

const mapDispatchToProps = {
  openApiSelectModal: (team) => openApiSelectModal(team),
};

export const TeamApiPricing = connect(mapStateToProps, mapDispatchToProps)(TeamApiPricingComponent);