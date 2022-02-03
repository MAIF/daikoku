import React, { useState, useEffect, useRef, useContext } from 'react';
import { Form, constraints, type, format } from '@maif/react-forms';
import classNames from 'classnames';
import faker from 'faker';
import _ from 'lodash';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { useParams } from 'react-router-dom';
import Select, { components } from 'react-select';
import CreatableSelect from 'react-select/creatable';

import { currencies } from '../../../services/currencies';
import { Spinner, newPossibleUsagePlan, Option } from '../../utils';
import * as Services from '../../../services';
import { Help } from '../../inputs';
import { I18nContext, openApiSelectModal } from '../../../core';
import { object, string } from 'prop-types';

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

const OtoroshiServicesAndGroupSelector = ({ rawValues, error, onChange, translateMethod }) => {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState(undefined);
  const [services, setServices] = useState(undefined);
  const [disabled, setDisabled] = useState(true);
  const [value, setValue] = useState(undefined);

  const { Translation } = useContext(I18nContext);

  const params = useParams();

  useEffect(() => {
    Promise.all([
      Services.getOtoroshiGroupsAsTeamAdmin(
        params.teamId,
        rawValues.otoroshiTarget.otoroshiSettings
      ),
      Services.getOtoroshiServicesAsTeamAdmin(
        params.teamId,
        rawValues.otoroshiTarget.otoroshiSettings
      ),
    ])
      .then(([groups, services]) => {
        if (!groups.error)
          setGroups(groups.map((g) => ({ label: g.name, value: g.id, type: 'group' })));
        else setGroups([]);
        if (!services.error)
          setServices(services.map((g) => ({ label: g.name, value: g.id, type: 'service' })));
        else setServices([]);
      })
      .catch(() => {
        setGroups([]);
        setServices([]);
      });
  }, [rawValues.otoroshiTarget.otoroshiSettings]);

  useEffect(() => {
    if (groups && services) {
      setLoading(false);
    }
  }, [services, groups]);

  useEffect(() => {
    if (!!groups && !!services && !!rawValues.otoroshiTarget.authorizedEntities) {
      setValue(
        [
          ...rawValues.otoroshiTarget.authorizedEntities.groups.map((authGroup) =>
            groups.find((g) => g.value === authGroup)
          ),
          ...rawValues.otoroshiTarget.authorizedEntities.services.map((authService) =>
            services.find((g) => g.value === authService)
          ),
        ].filter((f) => f)
      );
    }
  }, [rawValues, groups, services]);

  useEffect(() => {
    const otoroshiTarget = rawValues.otoroshiTarget;
    console.debug({ otoroshiTarget, disabled: !otoroshiTarget || !otoroshiTarget.otoroshiSettings })
    setDisabled(!otoroshiTarget || !otoroshiTarget.otoroshiSettings);
  }, [rawValues.otoroshiTarget.otoroshiSettings]);


  const onValueChange = (v) => {
    if (!v) {
      onChange(null);
      setValue(undefined);
    } else {
      const value = v.reduce(
        (acc, entitie) => {
          switch (entitie.type) {
            case 'group':
              return {
                ...acc,
                groups: [...acc.groups, groups.find((g) => g.value === entitie.value).value],
              };
            case 'service':
              return {
                ...acc,
                services: [...acc.services, services.find((s) => s.value === entitie.value).value],
              };
          }
        },
        { groups: [], services: [] }
      );
      setValue([
        ...value.groups.map((authGroup) => groups.find((g) => g.value === authGroup)),
        ...value.services.map((authService) => services.find((g) => g.value === authService)),
      ]);
      onChange(value);
    }
  };

  return (
    <div>
      <Select
        id={`input-label`}
        isMulti
        name={`search-label`}
        isLoading={loading}
        isDisabled={disabled && !loading}
        placeholder={translateMethod('Authorized.entities.placeholder')}
        components={(props) => <components.Group {...props} />}
        options={[
          { label: 'Service groups', options: groups },
          { label: 'Services', options: services },
        ]}
        value={value}
        onChange={onValueChange}
        classNamePrefix="reactSelect"
        className="reactSelect"
      />
      <div className="col-12 d-flex flex-row mt-1">
        <div className="d-flex flex-column flex-grow-1">
          <strong className="font-italic">
            <Translation i18nkey="Authorized Groups">Authorized Groups</Translation>
          </strong>
          {!!value &&
            value
              .filter((x) => x.type === 'group')
              .map((g, idx) => (
                <span className="font-italic" key={idx}>
                  {g.label}
                </span>
              ))}
        </div>
        <div className="d-flex flex-column flex-grow-1">
          <strong className="font-italic">
            <Translation i18nkey="Authorized Services">Authorized Services</Translation>
          </strong>
          {!!value &&
            value
              .filter((x) => x.type === 'service')
              .map((g, idx) => (
                <span className="font-italic" key={idx}>
                  {g.label}
                </span>
              ))}
        </div>
      </div>
    </div>
  );
};

function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

function TeamApiPricingComponent({ value, tenant, ...props }) {
  const [selected, setSelected] = useState(value.possibleUsagePlans[0]);
  const [otoroshiSettings, setOtoroshiSettings] = useState([]);
  const params = useParams();

  const { translateMethod, Translation } = useContext(I18nContext);

  const prevValue = usePrevious(value);

  useEffect(() => {
    Services.allSimpleOtoroshis(tenant._id).then((settings) => setOtoroshiSettings(settings));
  }, []);

  useEffect(() => {
    if (prevValue) {
      if (prevValue.possibleUsagePlans.length < value.possibleUsagePlans.length)
        setSelected(value.possibleUsagePlans.slice(-1)[0]);
      else if (
        !equals(
          prevValue.possibleUsagePlans.map((p) => p._id).sort(),
          value.possibleUsagePlans.map((p) => p._id).sort()
        )
      )
        setSelected(value.possibleUsagePlans[0]);
    }
  }, [params.versionId, value.possibleUsagePlans]);

  function equals(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  const otoroshiFormFlow = [
    {
      label: translateMethod('Otoroshi'),
      collapsed: true,
      flow: [
        'otoroshiTarget'
      ]
    }
  ]

  const pathes = {
    type: type.object,
    format: format.form,
    array: true,
    visible: {
      ref: 'enabled',
      test: v => !!v
    },
    schema: {
      method: {
        type: type.string,
        format: format.select,
        label: translateMethod('http.method'), //todo: translation
        options: [
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
        ]
      },
      'path': {
        type: type.string,
        label: translateMethod('http.path'), //todo:trabnslation
        defaultValue: '/',
        constraints: [
          constraints.matches(/^\/([^\s]\w*)*$/, 'constraint.match.path') //todo:  trabnslation
        ]
      }
    },
    flow: ['method', 'path']
  }

  const otoroshiFormSchema = {
    otoroshiTarget: {
      type: type.object,
      format: format.form,
      label: translateMethod('Otoroshi target'),
      schema: {
        otoroshiSettings: {
          type: type.string,
          format: format.select,
          label: translateMethod('Otoroshi instances'),
          options: otoroshiSettings.map((s) => ({
            label: s.url,
            value: s._id,
          })),
        },
        authorizedEntities: {
          type: type.string,
          visible: {
            ref: 'otoroshiSettings',
            test: v => !!v
          },
          render: props => OtoroshiServicesAndGroupSelector({ ...props, translateMethod }),
          // render: props => <button className='btn btn-outline-primary' onClick={() => console.debug({ props })}>test</button>,
          label: translateMethod('Authorized entities'),
          placeholder: translateMethod('Authorized.entities.placeholder'),
          help: translateMethod('authorized.entities.help'),
        },
        // apikeyCustomization: {
        //   type: type.object,
        //   format: format.form,
        //   label: translateMethod('apikey customisation'), //todo: translation
        //   visible: {
        //     ref: 'authorizedEntities',
        //     test: v => !!v.length
        //   },
        //   schema: {
        //     clientIdOnly: {
        //       type: type.bool,
        //       label: translateMethod('Apikey with clientId only'),
        //     },
        //     readOnly: {
        //       type: type.bool,
        //       label: translateMethod('Read only apikey'),
        //     },
        //     constrainedServicesOnly: {
        //       type: type.bool,
        //       label: translateMethod('Constrained services only'),
        //     },
        //     dynamicPrefix: {
        //       type: type.string,
        //       label: translateMethod('Dynamic prefix'),
        //       help: translateMethod(
        //         'dynamic.prefix.help',
        //         false,
        //         'the prefix used in tags and metadata used to target dynamic values that will be updated if the value change in the original plan'
        //       ),
        //     },
        //     metadata: {
        //       type: type.object,
        //       label: translateMethod('Automatic API key metadata'),
        //       help: translateMethod(
        //         'automatic.metadata.help',
        //         false,
        //         'Automatic metadata will be calculated on subscription acceptation'
        //       ),
        //     },
        //     customMetadata: {
        //       type: object,
        //       render: CustomMetadataInput,
        //       label: translateMethod('Custom Apikey metadata'),
        //       toastr: () => toastr.info(translateMethod('sub.process.update.to.manual')),
        //       help: translateMethod(
        //         'custom.metadata.help',
        //         false,
        //         'custom metadata will have to be filled during subscription validation. Subscripption process will be switched to manual'
        //       ),
        //     },
        //     tags: {
        //       type: string,
        //       array: true,
        //       label: translateMethod('Apikey tags'),
        //     },
        //     restrictions: {
        //       type: type.object,
        //       format: format.form,
        //       schema: {
        //         enabled: {
        //           type: type.bool,
        //           label: translateMethod('Enable restrictions'),
        //         },
        //         allowLast: {
        //           type: type.bool,
        //           visible: {
        //             ref: 'enabled',
        //             test: v => !!v
        //           },
        //           label: translateMethod('Allow at last'),
        //           help: translateMethod('allow.least.help', 'Allowed path will be evaluated at last'),
        //         },
        //         allowed: {
        //           label: translateMethod('Allowed pathes'),
        //           ...pathes
        //         },
        //         forbidden: {
        //           label: translateMethod('Forbidden pathes'),
        //           ...pathes
        //         },
        //         notFound: {
        //           label: translateMethod('Not found pathes'),
        //           ...pathes
        //         },
        //       }
        //     }
        //   }
        // }
      },
    }
  };


  const securityFormFlow = [
    {
      label: translateMethod('Security'),
      collapsed: true,
      flow: [
        'autoRotation',
        'subscriptionProcess',
        'integrationProcess',
      ]
    }
  ];

  const securityFormSchema = {
    autoRotation: {
      type: type.bool,
      label: translateMethod('Force apikey auto-rotation'),
    },
    subscriptionProcess: {
      type: type.string,
      format: format.buttonsSelect,
      disabled: false, //FIXME ===> disable if customMetatda.legnth ==> react-form v1.0.16
      label: translateMethod('Subscription'),
      options: [
        {
          label: translateMethod('Automatic'),
          value: 'Automatic',
        },
        { label: translateMethod('Manual'), value: 'Manual' },
      ],
    },
    integrationProcess: {
      type: type.string,
      format: format.buttonsSelect,
      label: translateMethod('Integration'),
      options: [
        {
          label: translateMethod('Automatic'),
          value: 'Automatic',
        },
        { label: translateMethod('ApiKey'), value: 'ApiKey' },
      ],
    },
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
  }

  function onChange(v) {
    console.debug({v})
    if (!v.currency) {
      v.currency = { code: 'EUR' };
    }
    v = { ...v, ...smartNameAndDescription(v.type) };

    (() => {
      if (v.type !== selected.type)
        return Services.fetchNewPlan(v.type).then((res) => ({ ...res, ...v }));
      else return Promise.resolve(v);
    })().then((plan) => {
      const selected = value.possibleUsagePlans.filter((p) => p._id === plan._id)[0];
      const idx = value.possibleUsagePlans.indexOf(selected);
      let plans = _.cloneDeep(value.possibleUsagePlans);
      plans.splice(idx, 1, plan);

      const newValue = _.cloneDeep(value);
      newValue.possibleUsagePlans = plans;
      props.onChange(newValue);
      setSelected(plan);
    });
  }

  const adminFlow = (plan) => {
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }
  }

  const freeWithoutQuotasFlow = (plan) => {
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }

    return [
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      found.aggregationApiKeysSecurity
        ? 'aggregationApiKeysSecurity'
        : tenant.aggregationApiKeysSecurity
          ? 'aggregationApiKeysSecurity'
          : undefined,
      ...otoroshiFormFlow,
      ...securityFormFlow,
    ];
  }

  const freeWithQuotasFlow = (plan) => {
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }
    return [
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      found.aggregationApiKeysSecurity
        ? 'aggregationApiKeysSecurity'
        : tenant.aggregationApiKeysSecurity
          ? 'aggregationApiKeysSecurity'
          : undefined,
      {
        label: translateMethod('Quotas'),
        collapsed: true,
        flow: [
          'maxPerSecond',
          'maxPerDay',
          'maxPerMonth',
        ]
      },
      ...otoroshiFormFlow,
      ...securityFormFlow,
    ];
  }

  const quotasWithLimitsFlow = (plan) => {
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }
    return [
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      found.aggregationApiKeysSecurity
        ? 'aggregationApiKeysSecurity'
        : tenant.aggregationApiKeysSecurity
          ? 'aggregationApiKeysSecurity'
          : undefined,
      {
        label: translateMethod('Quotas'),
        collapsed: true,
        flow: [
          'maxPerSecond',
          'maxPerDay',
          'maxPerMonth',
        ]
      },
      {
        label: translateMethod('Trial'),
        collapsed: true,
        flow: [
          'trialPeriod',
        ]
      },
      {
        label: translateMethod('Billing'),
        collapsed: true,
        flow: [
          'costPerMonth',
          'currency.code',
          'billingDuration',
        ]
      },
      ...otoroshiFormFlow,
      ...securityFormFlow,
    ].filter((f) => f);
    const schema = {
      _id: {
        type: 'string',
        disabled: true,
        props: {
          label: translateMethod('Id'),
          placeholder: '---',
        },
      },
      type: {
        type: 'select',
        props: {
          label: translateMethod('Type'),
          possibleValues: [
            {
              label: translateMethod('FreeWithoutQuotas', false, 'Free without quotas'),
              value: 'FreeWithoutQuotas',
            },
            {
              label: translateMethod('FreeWithQuotas', false, 'Free with quotas'),
              value: 'FreeWithQuotas',
            },
            {
              label: translateMethod('QuotasWithLimits', false, 'Quotas with limits'),
              value: 'QuotasWithLimits',
            },
            {
              label: translateMethod('QuotasWithoutLimits', false, 'Quotas without limits'),
              value: 'QuotasWithoutLimits',
            },
            {
              label: translateMethod('PayPerUse', false, 'Pay per use'),
              value: 'PayPerUse',
            },
          ],
        },
      },
      'billingDuration.value': {
        type: 'number',
        props: {
          label: translateMethod('Billing every'),
        },
      },
      'billingDuration.unit': {
        type: 'select',
        props: {
          label: translateMethod('Billing every'),
          possibleValues: [
            { label: translateMethod('Hours'), value: 'Hour' },
            { label: translateMethod('Days'), value: 'Day' },
            { label: translateMethod('Months'), value: 'Month' },
            { label: translateMethod('Years'), value: 'Year' },
          ],
        },
      },
      allowMultipleKeys: {
        type: 'bool',
        props: {
          label: translateMethod('Allow multiple apiKey demands'),
        },
      },
      aggregationApiKeysSecurity: {
        type: 'bool',
        props: {
          label: translateMethod('aggregation api keys security'),
          help: translateMethod('aggregation_apikeys.security.help'),
        },
      },
      'trialPeriod.value': {
        type: 'number',
        props: {
          label: translateMethod('Trial period'),
          placeholder: translateMethod('The trial period'),
        },
      },
      'trialPeriod.unit': {
        type: 'select',
        props: {
          label: translateMethod('Trial period unit'),
          possibleValues: [
            { label: translateMethod('Hours'), value: 'Hour' },
            { label: translateMethod('Days'), value: 'Day' },
            { label: translateMethod('Months'), value: 'Month' },
            { label: translateMethod('Years'), value: 'Year' },
          ],
        },
      },
      maxPerSecond: {
        type: 'number',
        props: {
          label: translateMethod('Max. per second'),
          placeholder: translateMethod('Max. requests per second'),
        },
      },
      maxPerDay: {
        type: 'number',
        props: {
          label: translateMethod('Max. per day'),
          placeholder: translateMethod('Max. requests per day'),
        },
      },
      maxPerMonth: {
        type: 'number',
        props: {
          label: translateMethod('Max. per month'),
          placeholder: translateMethod('Max. requests per month'),
        },
      },
      costPerMonth: {
        type: 'number',
        props: {
          label: translateMethod('Cost per month'),
          placeholder: translateMethod('Cost per month'),
        },
      },
      'currency.code': {
        type: 'select',
        props: {
          label: translateMethod('Currency'),
          possibleValues: currencies.map((c) => ({
            label: `${c.name} (${c.symbol})`,
            value: c.code,
          })),
        },
      },
      customName: {
        type: 'string',
        props: {
          label: translateMethod('Name'),
          placeholder: translateMethod('Plan name'),
        },
      },
      customDescription: {
        type: 'string',
        props: {
          label: translateMethod('Description'),
          placeholder: translateMethod('Plan description'),
        },
      },
      ...otoroshiFormSchema,
      ...securityFormSchema,
    };
  }

  const quotasWithoutLimitsFlow = (plan) => {
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }
    return [
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      found.aggregationApiKeysSecurity
        ? 'aggregationApiKeysSecurity'
        : tenant.aggregationApiKeysSecurity
          ? 'aggregationApiKeysSecurity'
          : undefined,
      {
        label: translateMethod('Quotas'),
        collapsed: true,
        flow: [
          'maxPerSecond',
          'maxPerDay',
          'maxPerMonth',
        ]
      },
      {
        label: translateMethod('Trial'),
        collapsed: true,
        flow: [
          'trialPeriod',
        ]
      },
      {
        label: translateMethod('Billing'),
        collapsed: true,
        flow: [
          'costPerMonth',
          'costPerAdditionalRequest',
          'currency.code',
          'billingDuration',
        ]
      },
      ...otoroshiFormFlow,
      ...securityFormFlow,
    ];
  }

  const payPerUseFlow = (plan) => {
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }
    return [
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      found.aggregationApiKeysSecurity
        ? 'aggregationApiKeysSecurity'
        : tenant.aggregationApiKeysSecurity
          ? 'aggregationApiKeysSecurity'
          : undefined,
      {
        label: translateMethod('Trial'),
        collapsed: true,
        flow: [
          'trialPeriod',
        ]
      },
      {
        label: translateMethod('Billing'),
        collapsed: true,
        flow: [
          'costPerMonth',
          'costPerAdditionalRequest',
          'currency.code',
          'billingDuration',
        ]
      },
      ...otoroshiFormFlow,
      ...securityFormFlow,
    ];
  }

  function addNewPlan() {
    let plans = _.cloneDeep(value.possibleUsagePlans);
    const newPlan = newPossibleUsagePlan(faker.commerce.productName() + ' plan');
    plans.push(newPlan);
    const newValue = _.cloneDeep(value);
    newValue.possibleUsagePlans = plans;
    props.onChange(newValue);
    setSelected(newPlan);
  }

  function importPlan() {
    props.openApiSelectModal({
      api: value,
      teamId: props.teamId,
      onClose: () => {
        props.reload();
        setSelected(value.possibleUsagePlans.slice(-1)[0]);
      },
    });
  }

  const clonePlan = () => {
    let plans = _.cloneDeep(value.possibleUsagePlans);
    const clone = {
      ..._.cloneDeep(selected),
      _id: faker.random.alphaNumeric(32),
      customName: `${selected.customName} (copy)`,
    };
    plans.push(clone);
    const newValue = _.cloneDeep(value);
    value.possibleUsagePlans = plans;
    props.onChange(value);
    setSelected(clone);
  }

  function deletePlan() {
    window
      .confirm(
        translateMethod('delete.plan.confirm', 'Are you sure you want to delete this plan ?')
      )
      .then((ok) => {
        if (ok) {
          let plans = _.cloneDeep(value.possibleUsagePlans).filter((p) => p._id !== selected._id);
          const newValue = _.cloneDeep(value);
          newValue.possibleUsagePlans = plans;
          setSelected(plans.length ? plans[0] : null);
          props.onChange(newValue);
        }
      });
  }

  function makesDefault() {
    if (selected.visibility === PUBLIC) {
      const newValue = _.cloneDeep(value);
      newValue.defaultUsagePlan = selected._id;
      props.onChange(newValue);
    }
  }

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
  }


  const schema = {
    type: {
      type: type.string,
      format: format.select,
      label: translateMethod('Type'),
      options: [
        {
          label: translateMethod('FreeWithoutQuotas', false, 'Free without quotas'),
          value: 'FreeWithoutQuotas',
        },
        {
          label: translateMethod('FreeWithQuotas', false, 'Free with quotas'),
          value: 'FreeWithQuotas',
        },
        {
          label: translateMethod('QuotasWithLimits', false, 'Quotas with limits'),
          value: 'QuotasWithLimits',
        },
        {
          label: translateMethod('QuotasWithoutLimits', false, 'Quotas without limits'),
          value: 'QuotasWithoutLimits',
        },
        {
          label: translateMethod('PayPerUse', false, 'Pay per use'),
          value: 'PayPerUse',
        },
      ],
      constraints: [
        constraints.required('') //todo: message
      ]
    },
    'billingDuration': {
      type: type.object,
      format: format.form,
      label: translateMethod('Billing'), //todo: translate
      schema: {
        value: {
          type: type.number,
          label: translateMethod('Billing every'),
          constraints: [
            constraints.positive() //todo: message
          ]
        },
        unit: {
          type: type.string,
          format: format.select,
          label: translateMethod('Billing every'),
          options: [
            { label: translateMethod('Hours'), value: 'Hour' },
            { label: translateMethod('Days'), value: 'Day' },
            { label: translateMethod('Months'), value: 'Month' },
            { label: translateMethod('Years'), value: 'Year' },
          ],
        }
      },
      flow: ['value', 'unit']
    },
    allowMultipleKeys: {
      type: type.bool,
      label: translateMethod('Allow multiple apiKey demands'),
    },
    aggregationApiKeysSecurity: {
      type: type.bool,
      label: translateMethod('aggregation api keys security'),
      help: translateMethod('aggregation_apikeys.security.help'),
    },
    trialPeriod: {
      type: type.object,
      label: translateMethod('Trial'), //todo: translation,
      schema: {
        value: {
          type: type.number,
          label: translateMethod('Trial period'),
          placeholder: translateMethod('The trial period'),
          constraints: [
            constraints.positive() //todo: message
          ]
        },
        unit: {
          type: type.string,
          format: format.select,
          label: translateMethod('Trial period unit'),
          possibleValues: [
            { label: translateMethod('Hours'), value: 'Hour' },
            { label: translateMethod('Days'), value: 'Day' },
            { label: translateMethod('Months'), value: 'Month' },
            { label: translateMethod('Years'), value: 'Year' },
          ],
        }
      },
      flow: ['value', 'unit']
    },
    maxPerSecond: {
      type: type.number,
      label: translateMethod('Max. per second'),
      placeholder: translateMethod('Max. requests per second'),
      constraints: [
        constraints.positive() //todo: message
      ]
    },
    maxPerDay: {
      type: type.number,
      label: translateMethod('Max. per day'),
      placeholder: translateMethod('Max. requests per day'),
      constraints: [
        constraints.positive() //todo: message
      ]
    },
    maxPerMonth: {
      type: type.number,
      label: translateMethod('Max. per month'),
      placeholder: translateMethod('Max. requests per month'),
      constraints: [
        constraints.positive() //todo: message
      ]
    },
    costPerMonth: {
      type: type.number,
      label: translateMethod('Cost per month'),
      placeholder: translateMethod('Cost per month'),
      constraints: [
        constraints.positive() //todo: message
      ]
    },
    costPerAdditionalRequest: {
      type: type.number,
      label: translateMethod('Cost per add. req.'),
      placeholder: translateMethod('Cost per additionnal request'),
      constraints: [
        constraints.positive() //todo: message
      ]
    },
    'currency.code': {
      type: type.string,
      format: format.select,
      label: translateMethod('Currency'),
      possibleValues: currencies.map((c) => ({
        label: `${c.name} (${c.symbol})`,
        value: c.code,
      })),
    },
    customName: {
      type: type.string,
      label: translateMethod('Name'),
      placeholder: translateMethod('Plan name'),
    },
    customDescription: {
      type: type.string,
      format: format.text,
      label: translateMethod('Description'),
      placeholder: translateMethod('Plan description'),
      constraints:[
        constraints.nullable()
      ]
    },
    ...otoroshiFormSchema,
    ...securityFormSchema,
  };



  const getRightFlow = () => {
    if (!selected) {
      return [];
    }
    switch (selected.type) {
      case 'Admin':
        return adminFlow(selected);
      case 'FreeWithoutQuotas':
        return freeWithoutQuotasFlow(selected);
      case 'FreeWithQuotas':
        return freeWithQuotasFlow(selected);
      case 'QuotasWithLimits':
        return quotasWithLimitsFlow(selected);
      case 'QuotasWithoutLimits':
        return quotasWithoutLimitsFlow(selected);
      case 'PayPerUse':
        return payPerUseFlow(selected);
      default:
        return [];
    }
  }


  function planToOption(plan) {
    if (!plan || value.possibleUsagePlans.length === 0) return null;

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
  }

  if (value === null) return null;

  const flow = getRightFlow().filter(x => x);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 100 }}>
      <div
        className="d-flex align-items-center justify-space-between py-3 mb-2"
        style={{ borderBottom: '1px solid #DFDFDF' }}
      >
        {value.visibility !== 'AdminOnly' && (
          <>
            <button onClick={addNewPlan} type="button" className="btn btn-outline-primary me-1">
              {translateMethod('add a new plan')}
            </button>
            {!!value.parent && (
              <button
                onClick={importPlan}
                type="button"
                className="btn btn-outline-primary me-1"
                style={{ marginTop: 0 }}>
                {translateMethod('import a plan')}
              </button>
            )}
          </>
        )}
        <Select
          clearable={false}
          value={planToOption(selected)}
          placeholder="Select a plan to edit it"
          options={value.possibleUsagePlans.map(planToOption)}
          onChange={(e) => setSelected(e.plan)}
          classNamePrefix="reactSelect"
          className="reactSelect"
          styles={{
            container: (base) => ({
              ...base,
              flex: 1,
            }),
          }}
        />
      </div>
      <div className="col-12">
        {!!selected && value.possibleUsagePlans.find((p) => p._id === selected._id) && (
          <div>
            <div className="d-flex justify-content-end">
              {value.defaultUsagePlan !== selected._id && selected.visibility !== PRIVATE && (
                <button
                  onClick={makesDefault}
                  type="button"
                  className="btn btn-sm btn-outline-primary me-1 mb-2">
                  <i className="fas fa-star me-1" title="Default plan" />
                  <Translation i18nkey="Make default plan">Make default plan</Translation>
                </button>
              )}
              {value.defaultUsagePlan !== selected._id && (
                <button
                  onClick={makePrivate}
                  type="button"
                  className="btn btn-sm btn-outline-primary mb-2 me-1">
                  <i
                    className={classNames('fas me-1', {
                      'fa-lock': selected.visibility === 'Public',
                      'fa-unlock': selected.visibility === 'Private',
                    })}
                  />
                  {selected.visibility === 'Public' && (
                    <Translation i18nkey="Make it private">Make it private</Translation>
                  )}
                  {selected.visibility === 'Private' && (
                    <Translation i18nkey="Make it public">Make it public</Translation>
                  )}
                </button>
              )}
              {value.visibility !== 'AdminOnly' && (
                <button
                  onClick={clonePlan}
                  type="button"
                  className="btn btn-sm btn-outline-primary mb-2 me-1">
                  <i className="fas fa-clone me-1" />
                  <Translation i18nkey="Duplicate plan">Duplicate plan</Translation>
                </button>
              )}
              {value.visibility !== 'AdminOnly' && (
                <button
                  onClick={deletePlan}
                  type="button"
                  className="btn btn-sm btn-outline-danger mb-2">
                  <i className="fas fa-trash me-1" />
                  <Translation i18nkey="Delete plan">Delete plan</Translation>
                </button>
              )}
            </div>
            <Form
              schema={schema}
              onSubmit={onChange}
              options={{
                autosubmit: true
              }}
              flow={flow}
              value={selected}
              footer={() => (null)}
            />
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
      props.setValue('subscriptionProcess', 'Manual');
      // props.toastr(); //FIXME
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

        <div className="col-sm-10">
          <button
            disabled={props.disabled}
            type="button"
            className="btn btn-outline-primary"
            onClick={addFirst}
          >
            <i className="fas fa-plus" />{' '}
          </button>
        </div>
      )}
      {props.value.map(({ key, possibleValues }, idx) => (
        <div className="col-sm-10">
          <div className="input-group">
            <input
              disabled={props.disabled}
              type="text"
              className="form-control col-5 me-1"
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
            <button
              disabled={props.disabled}
              type="button"
              className="input-group-text btn btn-outline-danger"
              onClick={(e) => remove(e, key)}>
              <i className="fas fa-trash" />
            </button>
            {idx === props.value.length - 1 && (
              <button
                disabled={props.disabled}
                type="button"
                className="input-group-text btn btn-outline-primary"
                onClick={addNext}>
                <i className="fas fa-plus" />{' '}
              </button>
            )}
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
        <div className="mb-3 row">
          <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
            <Help text={props.help} label={props.label} />
          </label>
          <div className="col-sm-10">
            <button
              disabled={props.disabled}
              type="button"
              className="btn btn-outline-primary"
              onClick={addItem}
            >
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
                className="reactSelect flex-grow-1 me-1"
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
                style={{ height: 'calc(1.5em + 0.75rem + 2px)' }}
              >
                <button
                  disabled={props.disabled}
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => removeItem(idx)}
                >
                  <i className="fas fa-trash" />
                </button>
                {idx === props.value.length - 1 && (
                  <button
                    disabled={props.disabled}
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={addItem}
                  >
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
