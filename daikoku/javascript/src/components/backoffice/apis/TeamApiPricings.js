import React, { useContext, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import faker from 'faker';
import { Form, constraints, type, format } from '@maif/react-forms'
import Select, { components } from 'react-select';

import { I18nContext } from '../../../core';
import { formatCurrency, getCurrencySymbol, newPossibleUsagePlan, formatPlanType, MultiStepForm } from '../../utils'
import { currencies } from '../../../services/currencies';
import * as Services from '../../../services'
import { toastr } from 'react-redux-toastr';

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

const Card = ({ plan, isDefault, makeItDefault, toggleVisibility, deletePlan, editPlan, duplicatePlan, creation }) => {
  const { translateMethod, Translation } = useContext(I18nContext);

  let pricing = translateMethod('Free');
  const req = translateMethod('req.');
  const month = translateMethod('month');
  if (plan.costPerMonth && plan.costPerAdditionalRequest) {
    pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(
      plan.currency.code
    )}/${month} + ${formatCurrency(plan.costPerAdditionalRequest)} ${getCurrencySymbol(
      plan.currency.code
    )}/${req}`;
  } else if (plan.costPerMonth) {
    pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(
      plan.currency.code
    )}/${month}`;
  } else if (plan.costPerRequest) {
    pricing = `${formatCurrency(plan.costPerRequest)} ${getCurrencySymbol(
      plan.currency.code
    )}/${req}`;
  }

  const deleteWithConfirm = () => {
    window.confirm(translateMethod('delete.plan.confirm')).then((ok) => {
      if (ok) {
        deletePlan()
      }
    });
  }

  return (
    <div className="card hoverable-card mb-4 shadow-sm" style={{ position: 'relative' }}>
      {isDefault && <i className="fas fa-star" style={{ position: 'absolute', fontSize: '20px', top: '15px', right: '15px', zIndex: '100' }} />}
      {!creation && <div className="dropdown" style={{ position: 'absolute', top: '15px', left: '15px', zIndex: '100' }}>
        <i
          className="fa fa-cog cursor-pointer"
          style={{ fontSize: '20px' }}
          data-bs-toggle="dropdown"
          aria-expanded="false"
          id="dropdownMenuButton" />
        <div
          className="dropdown-menu"
          aria-labelledby="dropdownMenuButton"
        >
          {!isDefault && plan.visibility !== PRIVATE && <span className="dropdown-item cursor-pointer"
            onClick={makeItDefault}>
            <Translation i18nkey="Make default plan">Make default plan</Translation>
          </span>}
          {!isDefault && (
            <span
              onClick={toggleVisibility}
              className="dropdown-item cursor-pointer">
              {plan.visibility === PUBLIC && (
                <Translation i18nkey="Make it private">Make it private</Translation>
              )}
              {plan.visibility === PRIVATE && (
                <Translation i18nkey="Make it public">Make it public</Translation>
              )}
            </span>
          )}
          <div className="dropdown-divider" />
          <span
            className="dropdown-item cursor-pointer"
            onClick={duplicatePlan}>
            <Translation i18nkey="Duplicate plan">duplicate</Translation>
          </span>
          <span
            className="dropdown-item cursor-pointer"
            onClick={editPlan}>
            <Translation i18nkey="Edit plan">Edit</Translation>
          </span>
          <div className="dropdown-divider" />
          <span
            className="dropdown-item cursor-pointer btn-danger-negative"
            onClick={deleteWithConfirm} >
            <Translation i18nkey="Delete plan">delete</Translation>
          </span>
        </div>
      </div>}
      <div className="card-img-top card-link card-skin" data-holder-rendered="true">
        <span>{plan.customName || formatPlanType(plan, translateMethod)}</span>
      </div>
      <div className="card-body plan-body d-flex flex-column">
        <p className="card-text text-justify">
          <span>{plan.customDescription}</span>
        </p>
        <div className="d-flex flex-column mb-2">
          <span className="plan-quotas">
            {!plan.maxPerSecond && !plan.maxPerMonth && translateMethod('plan.limits.unlimited')}
            {!!plan.maxPerSecond && !!plan.maxPerMonth && (
              <div>
                <div>
                  <Translation
                    i18nkey="plan.limits"
                    replacements={[plan.maxPerSecond, plan.maxPerMonth]}
                  >
                    Limits: {plan.maxPerSecond} req./sec, {plan.maxPerMonth} req./month
                  </Translation>
                </div>
              </div>
            )}
          </span>
          <span className="plan-pricing">
            <Translation i18nkey="plan.pricing" replacements={[pricing]}>
              pricing: {pricing}
            </Translation>
          </span>
        </div>
      </div>
    </div >
  )
}

const PUBLIC = 'Public';
const PRIVATE = 'Private';

export const TeamApiPricings = (props) => {
  const possibleMode = { list: 'LIST', creation: 'CREATION' }
  const [planForEdition, setPlanForEdition] = useState();
  const [mode, setMode] = useState('LIST');
  const { translateMethod } = useContext(I18nContext);

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
          options: props.otoroshiSettings,
          transformer: (s) => ({
            label: s.url,
            value: s._id,
          })
        },
        authorizedEntities: {
          type: type.object,
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
        apikeyCustomization: {
          type: type.object,
          format: format.form,
          visible: {
            ref: 'authorizedEntities',
            test: authorizedEntities => {
              console.debug({ authorizedEntities })
              return !!authorizedEntities.groups.length || !!authorizedEntities.services.length
            }
          },
          label: translateMethod('apikey customisation'), //todo: translation
          visible: {
            ref: 'authorizedEntities',
            test: v => !!v.length
          },
          schema: {
            clientIdOnly: {
              type: type.bool,
              label: translateMethod('Apikey with clientId only'),
            },
            readOnly: {
              type: type.bool,
              label: translateMethod('Read only apikey'),
            },
            constrainedServicesOnly: {
              type: type.bool,
              label: translateMethod('Constrained services only'),
            },
            dynamicPrefix: {
              type: type.string,
              label: translateMethod('Dynamic prefix'),
              help: translateMethod(
                'dynamic.prefix.help',
                false,
                'the prefix used in tags and metadata used to target dynamic values that will be updated if the value change in the original plan'
              ),
            },
            metadata: {
              type: type.object,
              label: translateMethod('Automatic API key metadata'),
              help: translateMethod(
                'automatic.metadata.help',
                false,
                'Automatic metadata will be calculated on subscription acceptation'
              ),
            },
            customMetadata: {
              type: type.object,
              // render: CustomMetadataInput,
              label: translateMethod('Custom Apikey metadata'),
              // toastr: () => toastr.info(translateMethod('sub.process.update.to.manual')),
              help: translateMethod(
                'custom.metadata.help',
                false,
                'custom metadata will have to be filled during subscription validation. Subscripption process will be switched to manual'
              ),
            },
            tags: {
              type: type.string,
              array: true,
              label: translateMethod('Apikey tags'),
            },
            restrictions: {
              type: type.object,
              format: format.form,
              schema: {
                enabled: {
                  type: type.bool,
                  label: translateMethod('Enable restrictions'),
                },
                allowLast: {
                  type: type.bool,
                  visible: {
                    ref: 'enabled',
                    test: v => !!v
                  },
                  label: translateMethod('Allow at last'),
                  help: translateMethod('allow.least.help', 'Allowed path will be evaluated at last'),
                },
                allowed: {
                  label: translateMethod('Allowed pathes'),
                  ...pathes
                },
                forbidden: {
                  label: translateMethod('Forbidden pathes'),
                  ...pathes
                },
                notFound: {
                  label: translateMethod('Not found pathes'),
                  ...pathes
                },
              }
            }
          }
        }
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
      constraints: [
        constraints.nullable()
      ]
    },
    ...otoroshiFormSchema,
    ...securityFormSchema,
  };

  const adminFlow = (plan) => {
    //FIXME
    const found = _.find(value.possibleUsagePlans, (p) => p._id === plan._id);
    if (!found.otoroshiTarget) {
      found.otoroshiTarget = {
        otoroshiSettings: null,
        authorizedEntities: [],
      };
    }
  }

  const freeWithoutQuotasFlow = (plan) => {
    return [
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      plan.aggregationApiKeysSecurity
        ? 'aggregationApiKeysSecurity'
        : props.tenant.aggregationApiKeysSecurity
          ? 'aggregationApiKeysSecurity'
          : undefined,
      ...otoroshiFormFlow,
      ...securityFormFlow,
    ];
  }

  const freeWithQuotasFlow = (plan) => {
    return [
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      plan.aggregationApiKeysSecurity
        ? 'aggregationApiKeysSecurity'
        : props.tenant.aggregationApiKeysSecurity
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
    return [
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      plan.aggregationApiKeysSecurity
        ? 'aggregationApiKeysSecurity'
        : props.tenant.aggregationApiKeysSecurity
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
    ];
  }

  const quotasWithoutLimitsFlow = (plan) => {
    return [
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      plan.aggregationApiKeysSecurity
        ? 'aggregationApiKeysSecurity'
        : props.tenant.aggregationApiKeysSecurity
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
    return [
      'type',
      'customName',
      'customDescription',
      'allowMultipleKeys',
      plan.aggregationApiKeysSecurity
        ? 'aggregationApiKeysSecurity'
        : props.tenant.aggregationApiKeysSecurity
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

  const getRightFlow = () => {
    if (!planForEdition) {
      return [];
    }
    switch (planForEdition.type) {
      case 'Admin':
        return adminFlow(planForEdition);
      case 'FreeWithoutQuotas':
        return freeWithoutQuotasFlow(planForEdition);
      case 'FreeWithQuotas':
        return freeWithQuotasFlow(planForEdition);
      case 'QuotasWithLimits':
        return quotasWithLimitsFlow(planForEdition);
      case 'QuotasWithoutLimits':
        return quotasWithoutLimitsFlow(planForEdition);
      case 'PayPerUse':
        return payPerUseFlow(planForEdition);
      default:
        return [];
    }
  }

  useEffect(() => {
    if (mode === possibleMode.creation) {
      setPlanForEdition(undefined)
      setMode(possibleMode.list)
    }
  }, [props.value]);


  const deletePlan = (plan) => {
    let plans = _.cloneDeep(props.value.possibleUsagePlans).filter((p) => p._id !== plan._id);
    const newValue = _.cloneDeep(props.value);
    newValue.possibleUsagePlans = plans;
    props.save(newValue);
  }

  const createNewPlan = () => {
    const newPlan = newPossibleUsagePlan(faker.commerce.productName() + ' plan');
    setPlanForEdition(newPlan);
    setMode(possibleMode.creation);
  }
  const editPlan = (plan) => {
    setPlanForEdition(plan);
    setMode(possibleMode.creation);
  }

  const makePlanDefault = (plan) => {
    if (props.value.defaultUsagePlan !== plan._id && plan.visibility !== PRIVATE) {
      const updatedApi = { ...props.value, defaultUsagePlan: plan._id }
      props.save(updatedApi)
    }
  }

  const toggleVisibility = (plan) => {
    if (props.value.defaultUsagePlan !== plan._id) {
      const originalVisibility = plan.visibility;
      const visibility = originalVisibility === PUBLIC ? PRIVATE : PUBLIC;
      const updatedPlan = { ...plan, visibility };
      const api = props.value
      const updatedApi = { ...api, possibleUsagePlans: [...api.possibleUsagePlans.filter(p => p._id !== updatedPlan._id), updatedPlan] }
      props.save(updatedApi)
    }
  }

  const clonePlanAndEdit = (plan) => {
    const clone = {
      ..._.cloneDeep(plan),
      _id: faker.random.alphaNumeric(32),
      customName: `${plan.customName} (copy)`,
    };
    setPlanForEdition(clone);
    setMode(possibleMode.creation);
  }

  function importPlan() {
    props.openApiSelectModal({
      api: props.value,
      teamId: props.team._id,
      onClose: (plan) => {
        const clone = {
          ..._.cloneDeep(plan),
          _id: faker.random.alphaNumeric(32),
          customName: `${plan.customName} (import)`,
        }
        setPlanForEdition(clone);
        setMode(possibleMode.creation)
      },
    });
  }

  const steps = [
    {
      id: 'info',
      label: 'Informations',
      schema: {
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
          constraints: [
            constraints.nullable()
          ]
        }
      },
      flow: ["type", "customName", "customDescription"]
    },
    {
      id: "oto",
      label: "Otoroshi Settings",
      schema: {
        otoroshiTarget: {
          type: type.object,
          format: format.form,
          label: translateMethod('Otoroshi target'),
          schema: {
            otoroshiSettings: {
              type: type.string,
              format: format.select,
              label: translateMethod('Otoroshi instances'),
              options: props.otoroshiSettings,
              transformer: (s) => ({
                label: s.url,
                value: s._id,
              })
            },
            authorizedEntities: {
              type: type.object,
              visible: {
                ref: 'otoroshiTarget.otoroshiSettings',
                test: v => !!v
              },
              render: props => OtoroshiServicesAndGroupSelector({ ...props, translateMethod }),
              label: translateMethod('Authorized entities'),
              placeholder: translateMethod('Authorized.entities.placeholder'),
              help: translateMethod('authorized.entities.help'),
            },
          },
        },
      },
      flow: ['otoroshiTarget']
    },
    {
      id: 'customization',
      label: translateMethod('Otoroshi Customization'),
      schema: {
        otoroshiTarget: {
          type: type.object,
          format: format.form,
          label: null,
          schema: {
            otoroshiSettings: {
              type: type.string,
              visible: false
            },
            authorizedEntities: {
              type: type.object,
              visible: false,
            },
            apikeyCustomization: {
              type: type.object,
              format: format.form,
              label: null,
              schema: {
                clientIdOnly: {
                  type: type.bool,
                  label: translateMethod('Apikey with clientId only'),
                },
                readOnly: {
                  type: type.bool,
                  label: translateMethod('Read only apikey'),
                },
                constrainedServicesOnly: {
                  type: type.bool,
                  label: translateMethod('Constrained services only'),
                },
                dynamicPrefix: {
                  type: type.string,
                  label: translateMethod('Dynamic prefix'),
                  help: translateMethod(
                    'dynamic.prefix.help',
                    false,
                    'the prefix used in tags and metadata used to target dynamic values that will be updated if the value change in the original plan'
                  ),
                },
                metadata: {
                  type: type.object,
                  label: translateMethod('Automatic API key metadata'),
                  help: translateMethod(
                    'automatic.metadata.help',
                    false,
                    'Automatic metadata will be calculated on subscription acceptation'
                  ),
                },
                customMetadata: {
                  type: type.object,
                  label: translateMethod('Custom Apikey metadata'),
                  onChange: ({value, setValue}) => {
                    if (value.length === 1) { 
                      setValue('subscriptionProcess', 'Manual')
                      toastr.info('set up subscriptionProcess to manual due to have a customMetadata')
                    }
                  },
                  help: translateMethod(
                    'custom.metadata.help',
                    false,
                    'custom metadata will have to be filled during subscription validation. Subscripption process will be switched to manual'
                  ),
                },
                tags: {
                  type: type.string,
                  array: true,
                  label: translateMethod('Apikey tags'),
                },
                restrictions: {
                  type: type.object,
                  format: format.form,
                  schema: {
                    enabled: {
                      type: type.bool,
                      label: translateMethod('Enable restrictions'),
                    },
                    allowLast: {
                      type: type.bool,
                      visible: {
                        ref: 'otoroshiTarget.apikeyCustomization.restrictions.enabled',
                        test: v => !!v
                      },
                      label: translateMethod('Allow at last'),
                      help: translateMethod('allow.least.help', 'Allowed path will be evaluated at last'),
                    },
                    allowed: {
                      label: translateMethod('Allowed pathes'),
                      visible: {
                        ref: 'otoroshiTarget.apikeyCustomization.restrictions.enabled',
                        test: v => !!v
                      },
                      ...pathes
                    },
                    forbidden: {
                      label: translateMethod('Forbidden pathes'),
                      visible: {
                        ref: 'otoroshiTarget.apikeyCustomization.restrictions.enabled',
                        test: v => !!v
                      },
                      ...pathes
                    },
                    notFound: {
                      label: translateMethod('Not found pathes'),
                      visible: {
                        ref: 'otoroshiTarget.apikeyCustomization.restrictions.enabled',
                        test: v => !!v
                      },
                      ...pathes
                    },
                  }
                }
              }
            }
          },
        },
      }
    },
    {
      id: 'security',
      label: translateMethod('Security'),
      schema: {
        otoroshiTarget: {
          type: type.object,
          visible: false,
        },
        autoRotation: {
          type: type.bool,
          label: translateMethod('Force apikey auto-rotation'),
        },
        subscriptionProcess: {
          type: type.string,
          format: format.buttonsSelect,
          disabled: ({ rawValues }) => !rawValues.otoroshiTarget.apikeyCustomization.metadata.length,
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
      }
    }
  ]

  return (
    <div className="d-flex col flex-column pricing-content">
      <div className="album">
        <div className="container">
          <div className="d-flex mb-3">
            <button onClick={createNewPlan} type="button" className="btn btn-outline-primary me-1">
              {translateMethod('add a new plan')}
            </button>
            {!!props.value.parent && (
              <button
                onClick={importPlan}
                type="button"
                className="btn btn-outline-primary me-1"
                style={{ marginTop: 0 }}>
                {translateMethod('import a plan')}
              </button>
            )}
          </div>
          {mode === possibleMode.creation && (
            <div className="row">
              <div className="col-md-4">
                <Card
                  api={props.value}
                  plan={planForEdition}
                  isDefault={planForEdition._id === props.value.defaultUsagePlan}
                  creation={true}
                />
              </div>
              <div className="col md-8">
                <MultiStepForm
                  value={planForEdition}
                  steps={steps}
                  initial="info"
                  creation={false} //FIXME
                  save={plan => Promise.resolve(console.debug({ plan }))}
                  getBreadcrumb={(_, breadcrumb) => props.injectSubMenu(breadcrumb)}
                />
                {/* <Form
                  schema={schema}
                  flow={getRightFlow().filter(x => x)}
                  onSubmit={(updatedPlan) => {
                    const api = props.value
                    const updatedApi = { ...api, possibleUsagePlans: [...api.possibleUsagePlans.filter(p => p._id !== updatedPlan._id), updatedPlan] }
                    props.save(updatedApi)
                  }}
                  value={planForEdition}
                  options={{
                    actions: {
                      cancel: {
                        display: true,
                        action: () => {
                          setPlanForEdition(undefined)
                          setMode(possibleMode.list)
                        }
                      }
                    }
                  }}
                /> */}
              </div>
            </div>
          )}
          {mode === possibleMode.list && <div className="row">
            {props.value.possibleUsagePlans.map((plan) => (
              <div key={plan._id} className="col-md-4">
                <Card
                  api={props.value}
                  plan={plan}
                  isDefault={plan._id === props.value.defaultUsagePlan}
                  makeItDefault={() => makePlanDefault(plan)}
                  toggleVisibility={() => toggleVisibility(plan)}
                  deletePlan={() => deletePlan(plan)}
                  editPlan={() => editPlan(plan)}
                  duplicatePlan={() => clonePlanAndEdit(plan)}
                />
              </div>
            ))}
          </div>}
        </div>
      </div>
    </div>
  )
}