import React, { useContext, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { constraints, type, format } from '@maif/react-forms';
import Select, { components } from 'react-select';
import CreatableSelect from 'react-select/creatable';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
import cloneDeep from 'lodash/cloneDeep';

import { I18nContext } from '../../../core';
import {
  formatCurrency,
  getCurrencySymbol,
  newPossibleUsagePlan,
  formatPlanType,
  MultiStepForm,
  Option,
} from '../../utils';
import { currencies } from '../../../services/currencies';
import * as Services from '../../../services';

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

const OtoroshiServicesAndGroupSelector = ({
  rawValues,
  onChange,
  translateMethod
}: any) => {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState(undefined);
  const [services, setServices] = useState(undefined);
  const [disabled, setDisabled] = useState(true);
  const [value, setValue] = useState(undefined);

  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);

  const params = useParams();

  useEffect(() => {
    const otoroshiTarget = rawValues.otoroshiTarget;

    if (otoroshiTarget && otoroshiTarget.otoroshiSettings) {
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
            setGroups(groups.map((g: any) => ({
              label: g.name,
              value: g.id,
              type: 'group'
            })));
          // @ts-expect-error TS(2345): Argument of type 'never[]' is not assignable to pa... Remove this comment to see the full error message
          else setGroups([]);
          if (!services.error)
            setServices(services.map((g: any) => ({
              label: g.name,
              value: g.id,
              type: 'service'
            })));
          // @ts-expect-error TS(2345): Argument of type 'never[]' is not assignable to pa... Remove this comment to see the full error message
          else setServices([]);
        })
        .catch(() => {
          // @ts-expect-error TS(2345): Argument of type 'never[]' is not assignable to pa... Remove this comment to see the full error message
          setGroups([]);
          // @ts-expect-error TS(2345): Argument of type 'never[]' is not assignable to pa... Remove this comment to see the full error message
          setServices([]);
        });
    }
    setDisabled(!otoroshiTarget || !otoroshiTarget.otoroshiSettings);
  }, [rawValues?.otoroshiTarget?.otoroshiSettings]);

  useEffect(() => {
    if (groups && services) {
      setLoading(false);
    }
  }, [services, groups]);

  useEffect(() => {
    if (!!groups && !!services && !!rawValues.otoroshiTarget.authorizedEntities) {
      // @ts-expect-error TS(2345): Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
      setValue([
    ...rawValues.otoroshiTarget.authorizedEntities.groups.map((authGroup: any) => (groups as any).find((g: any) => g.value === authGroup)),
    ...rawValues.otoroshiTarget.authorizedEntities.services.map((authService: any) => (services as any).find((g: any) => g.value === authService)),
].filter((f) => f));
    }
  }, [rawValues, groups, services]);

  const onValueChange = (v: any) => {
    if (!v) {
      onChange(null);
      setValue(undefined);
    } else {
      const value = v.reduce(
        (acc: any, entitie: any) => {
          switch (entitie.type) {
            case 'group':
              return {
                ...acc,
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                groups: [...acc.groups, groups.find((g: any) => g.value === entitie.value).value],
              };
            case 'service':
              return {
                ...acc,
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                services: [...acc.services, services.find((s: any) => s.value === entitie.value).value],
              };
          }
        },
        { groups: [], services: [] }
      );
      // @ts-expect-error TS(2345): Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
      setValue([
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        ...value.groups.map((authGroup: any) => groups.find((g: any) => g.value === authGroup)),
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        ...value.services.map((authService: any) => services.find((g: any) => g.value === authService)),
      ]);
      onChange(value);
    }
  };

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Select id={`input-label`} isMulti name={`search-label`} isLoading={loading} isDisabled={disabled && !loading} placeholder={translateMethod('Authorized.entities.placeholder')} components={(props: any) => <components.Group {...props}/>} options={[
        { label: 'Service groups', options: groups },
        { label: 'Services', options: services },
    ]} value={value} onChange={onValueChange} classNamePrefix="reactSelect" className="reactSelect"/>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-12 d-flex flex-row mt-1">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex flex-column flex-grow-1">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <strong className="font-italic">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Authorized Groups">Authorized Groups</Translation>
          </strong>
          {!!value &&
        (value as any).filter((x: any) => x.type === 'group')
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            .map((g: any, idx: any) => (<span className="font-italic" key={idx}>
                  {g.label}
                </span>))}
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex flex-column flex-grow-1">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <strong className="font-italic">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Authorized Services">Authorized Services</Translation>
          </strong>
          {!!value &&
        (value as any).filter((x: any) => x.type === 'service')
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            .map((g: any, idx: any) => (<span className="font-italic" key={idx}>
                  {g.label}
                </span>))}
        </div>
      </div>
    </div>);
};

const CustomMetadataInput = ({
  value,
  onChange,
  setValue
}: any) => {
  const changeValue = (possibleValues: any, key: any) => {
    const oldValue = Option(value.find((x: any) => x.key === key)).getOrElse({ '': '' });
    const newValues = [...value.filter((x: any) => x.key !== key), { ...oldValue, key, possibleValues }];
    onChange(newValues);
  };

  const changeKey = (e: any, oldName: any) => {
    if (e && e.preventDefault) e.preventDefault();

    const oldValue = Option(value.find((x: any) => x.key === oldName)).getOrElse({ '': '' });
    const newValues = [
      ...value.filter((x: any) => x.key !== oldName),
      { ...oldValue, key: e.target.value },
    ];
    onChange(newValues);
  };

  const addFirst = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!value || value.length === 0) {
      onChange([{ key: '', possibleValues: [] }]);
      setValue('subscriptionProcess', 'Manual');
      toastr.info('set up subscriptionProcess to manual due to have a customMetadata');
    }
  };

  const addNext = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    const newItem = { key: '', possibleValues: [] };
    const newValues = [...value, newItem];
    onChange(newValues);
  };

  const remove = (e: any, key: any) => {
    if (e && e.preventDefault) e.preventDefault();

    onChange(value.filter((x: any) => x.key !== key));
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {!value?.length && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="col-sm-10">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button type="button" className="btn btn-outline-primary" onClick={addFirst}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-plus" />{' '}
          </button>
        </div>
      )}
      {(value || []).map(({
        key,
        possibleValues
      }: any, idx: any) => (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div key={idx} className="col-sm-10">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="input-group">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input
              type="text"
              className="form-control col-5 me-1"
              value={key}
              onChange={(e) => changeKey(e, key)}
            />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <CreatableSelect
              isMulti
              onChange={(e) =>
                changeValue(
                  e.map(({ value }) => value),
                  key
                )
              }
              options={undefined}
              value={possibleValues.map((value: any) => ({
                label: value,
                value
              }))}
              className="input-select reactSelect flex-grow-1"
              classNamePrefix="reactSelect"
            />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button
              type="button"
              className="input-group-text btn btn-outline-danger"
              onClick={(e) => remove(e, key)}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-trash" />
            </button>
            {idx === value.length - 1 && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <button
                type="button"
                className="input-group-text btn btn-outline-primary"
                onClick={addNext}
              >
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-plus" />{' '}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const Card = ({
  plan,
  isDefault,
  makeItDefault,
  toggleVisibility,
  deletePlan,
  editPlan,
  duplicatePlan,
  creation
}: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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
    (window.confirm(translateMethod('delete.plan.confirm')) as any).then((ok: any) => {
    if (ok) {
        deletePlan();
    }
});
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="card hoverable-card mb-4 shadow-sm" style={{ position: 'relative' }}>
      {isDefault && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <i
          className="fas fa-star"
          style={{
            position: 'absolute',
            fontSize: '20px',
            top: '15px',
            right: '15px',
            zIndex: '100',
          }}
        />
      )}
      {!creation && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div
          className="dropdown"
          style={{ position: 'absolute', top: '15px', left: '15px', zIndex: '100' }}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i
            className="fa fa-cog cursor-pointer dropdown-menu-button"
            style={{ fontSize: '20px' }}
            data-bs-toggle="dropdown"
            aria-expanded="false"
            id="dropdownMenuButton"
          />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="dropdown-menu" aria-labelledby="dropdownMenuButton">
            {!isDefault && plan.visibility !== PRIVATE && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <span className="dropdown-item cursor-pointer" onClick={makeItDefault}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="Make default plan">Make default plan</Translation>
              </span>
            )}
            {!isDefault && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <span onClick={toggleVisibility} className="dropdown-item cursor-pointer">
                {plan.visibility === PUBLIC && (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <Translation i18nkey="Make it private">Make it private</Translation>
                )}
                {plan.visibility === PRIVATE && (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <Translation i18nkey="Make it public">Make it public</Translation>
                )}
              </span>
            )}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="dropdown-divider" />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span className="dropdown-item cursor-pointer" onClick={duplicatePlan}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Duplicate plan">duplicate</Translation>
            </span>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span className="dropdown-item cursor-pointer" onClick={editPlan}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Edit plan">Edit</Translation>
            </span>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="dropdown-divider" />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span
              className="dropdown-item cursor-pointer btn-danger-negative"
              onClick={deleteWithConfirm}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Delete plan">delete</Translation>
            </span>
          </div>
        </div>
      )}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="card-img-top card-link card-skin" data-holder-rendered="true">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <span>{plan.customName || formatPlanType(plan, translateMethod)}</span>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="card-body plan-body d-flex flex-column">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <p className="card-text text-justify">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span>{plan.customDescription}</span>
        </p>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex flex-column mb-2">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span className="plan-quotas">
            {!plan.maxPerSecond && !plan.maxPerMonth && translateMethod('plan.limits.unlimited')}
            {!!plan.maxPerSecond && !!plan.maxPerMonth && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span className="plan-pricing">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="plan.pricing" replacements={[pricing]}>
              pricing: {pricing}
            </Translation>
          </span>
        </div>
      </div>
    </div>
  );
};

const PUBLIC = 'Public';
const PRIVATE = 'Private';

export const TeamApiPricings = (props: any) => {
  const possibleMode = { list: 'LIST', creation: 'CREATION' };
  const [planForEdition, setPlanForEdition] = useState();
  const [mode, setMode] = useState('LIST');
  const [creation, setCreation] = useState(false);
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);


  useEffect(() => {
    return () => {
      props.injectSubMenu(null);
    };
  }, []);

  const pathes = {
    type: type.object,
    format: format.form,
    array: true,
    schema: {
      method: {
        type: type.string,
        format: format.select,
        label: translateMethod('http.method'),
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
        ],
      },
      path: {
        type: type.string,
        label: translateMethod('http.path'),
        defaultValue: '/',
        constraints: [
          constraints.matches(/^\/([^\s]\w*)*$/, translateMethod('constraint.match.path')),
        ],
      },
    },
    flow: ['method', 'path'],
  };

  const freeWithQuotasFlow = [
    {
      label: translateMethod('Quotas'),
      collapsed: false,
      flow: ['maxPerSecond', 'maxPerDay', 'maxPerMonth'],
    },
  ];

  const quotasWithLimitsFlow = [
    {
      label: translateMethod('Quotas'),
      collapsed: false,
      flow: ['maxPerSecond', 'maxPerDay', 'maxPerMonth'],
    },
    {
      label: translateMethod('Billing'),
      collapsed: false,
      flow: ['trialPeriod', 'billingDuration', 'costPerMonth', 'currency'],
    },
  ];

  const quotasWithoutLimitsFlow = [
    {
      label: translateMethod('Quotas'),
      collapsed: false,
      flow: ['maxPerSecond', 'maxPerDay', 'maxPerMonth'],
    },
    {
      label: translateMethod('Billing'),
      collapsed: false,
      flow: [
        'trialPeriod',
        'billingDuration',
        'costPerMonth',
        'costPerAdditionalRequest',
        'currency',
      ],
    },
  ];

  const payPerUseFlow = [
    {
      label: translateMethod('Billing'),
      collapsed: false,
      flow: [
        'trialPeriod',
        'billingDuration',
        'costPerMonth',
        'costPerAdditionalRequest',
        'currency',
      ],
    },
  ];

  const getRightBillingFlow = (plan: any) => {
    if (!plan) {
      return [];
    }
    switch (plan.type) {
      case 'FreeWithQuotas':
        return freeWithQuotasFlow;
      case 'QuotasWithLimits':
        return quotasWithLimitsFlow;
      case 'QuotasWithoutLimits':
        return quotasWithoutLimitsFlow;
      case 'PayPerUse':
        return payPerUseFlow;
      default:
        return [];
    }
  };

  useEffect(() => {
    if (mode === possibleMode.creation) {
      setPlanForEdition(undefined);
      setMode(possibleMode.list);
    }
  }, [props.value]);

  const deletePlan = (plan: any) => {
    let plans = cloneDeep(props.value.possibleUsagePlans).filter((p: any) => p._id !== plan._id);
    const newValue = cloneDeep(props.value);
    newValue.possibleUsagePlans = plans;
    props.save(newValue);
  };

  const createNewPlan = () => {
    const newPlan = newPossibleUsagePlan('new plan');
    // @ts-expect-error TS(2345): Argument of type '{ _id: string; type: string; cur... Remove this comment to see the full error message
    setPlanForEdition(newPlan);
    setMode(possibleMode.creation);
    setCreation(true);
  };
  const editPlan = (plan: any) => {
    setPlanForEdition(plan);
    setMode(possibleMode.creation);
  };

  const makePlanDefault = (plan: any) => {
    if (props.value.defaultUsagePlan !== plan._id && plan.visibility !== PRIVATE) {
      const updatedApi = { ...props.value, defaultUsagePlan: plan._id };
      props.save(updatedApi);
    }
  };

  const toggleVisibility = (plan: any) => {
    if (props.value.defaultUsagePlan !== plan._id) {
      const originalVisibility = plan.visibility;
      const visibility = originalVisibility === PUBLIC ? PRIVATE : PUBLIC;
      const updatedPlan = { ...plan, visibility };
      savePlan(updatedPlan);
    }
  };

  const savePlan = (updatedPlan: any) => {
    const api = props.value;
    const updatedApi = {
      ...api,
      possibleUsagePlans: [
        ...api.possibleUsagePlans.filter((p: any) => p._id !== updatedPlan._id),
        updatedPlan,
      ],
    };
    props.save(updatedApi);
  };

  const clonePlanAndEdit = (plan: any) => {
    const clone = {
      ...cloneDeep(plan),
      _id: nanoid(32),
      customName: `${plan.customName} (copy)`,
    };
    setPlanForEdition(clone);
    setMode(possibleMode.creation);
    setCreation(true);
  };

  const importPlan = () => {
    props.openApiSelectModal({
      api: props.value,
      teamId: props.team._id,
      onClose: (plan: any) => {
        const clone = {
          ...cloneDeep(plan),
          _id: nanoid(32),
          customName: `${plan.customName} (import)`,
        };
        setPlanForEdition(clone);
        setMode(possibleMode.creation);
        setCreation(true);
      },
    });
  };

  const cancelEdition = () => {
    setPlanForEdition(undefined);
    setMode(possibleMode.list);
    props.injectSubMenu(null);
    setCreation(false);
  };

  const planTypes = [
    'FreeWithoutQuotas',
    'FreeWithQuotas',
    'QuotasWithLimits',
    'QuotasWithoutLimits',
    'PayPerUse',
  ];
  const steps = [
    {
        id: 'info',
        label: 'Informations',
        schema: {
            type: {
                type: type.string,
                format: format.select,
                label: translateMethod('Type'),
                onChange: ({ rawValues, setValue, value }: any) => {
                    const isDescIsDefault = Object.values(SUBSCRIPTION_PLAN_TYPES)
                        .map(({ defaultDescription }) => defaultDescription)
                        .some((d) => !rawValues.customDescription || d === rawValues.customDescription);
                    if (isDescIsDefault) {
                        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                        setValue('customDescription', SUBSCRIPTION_PLAN_TYPES[value].defaultDescription);
                    }
                },
                options: planTypes,
                transformer: (value: any) => ({
                    label: translateMethod(value),
                    value
                }),
                constraints: [
                    constraints.required(translateMethod('constraints.required.type')),
                    constraints.oneOf(planTypes, translateMethod('constraints.oneof.plan.type')),
                ],
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
            },
        },
        flow: ['type', 'customName', 'customDescription'],
    },
    {
        id: 'oto',
        label: translateMethod('Otoroshi Settings'),
        schema: {
            otoroshiTarget: {
                type: type.object,
                format: format.form,
                label: translateMethod('Otoroshi target'),
                schema: {
                    otoroshiSettings: {
                        type: type.string,
                        format: format.select,
                        disabled: !creation && !!(planForEdition as any)?.otoroshiTarget?.otoroshiSettings,
                        label: translateMethod('Otoroshi instances'),
                        optionsFrom: Services.allSimpleOtoroshis(props.tenant._id),
                        transformer: (s: any) => ({
                            label: s.url,
                            value: s._id
                        }),
                    },
                    authorizedEntities: {
                        type: type.object,
                        visible: {
                            ref: 'otoroshiTarget.otoroshiSettings',
                            test: (v: any) => !!v,
                        },
                        render: (props: any) => OtoroshiServicesAndGroupSelector({ ...props, translateMethod }),
                        label: translateMethod('Authorized entities'),
                        placeholder: translateMethod('Authorized.entities.placeholder'),
                        help: translateMethod('authorized.entities.help'),
                    },
                },
            },
        },
        flow: ['otoroshiTarget'],
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
                        visible: false,
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
                                label: ({ rawValues }: any) => {
                                    if (rawValues.aggregationApiKeysSecurity) {
                                        return `${translateMethod('Read only apikey')} (${translateMethod('disabled.due.to.aggregation.security')})`;
                                    }
                                    else {
                                        return translateMethod('Apikey with clientId only');
                                    }
                                },
                                disabled: ({ rawValues }: any) => !!rawValues.aggregationApiKeysSecurity,
                                onChange: ({ setValue, value }: any) => {
                                    if (value) {
                                        setValue('aggregationApiKeysSecurity', false);
                                    }
                                },
                            },
                            readOnly: {
                                type: type.bool,
                                label: ({ rawValues }: any) => {
                                    if (rawValues.aggregationApiKeysSecurity) {
                                        return `${translateMethod('Read only apikey')} (${translateMethod('disabled.due.to.aggregation.security')})`;
                                    }
                                    else {
                                        return translateMethod('Read only apikey');
                                    }
                                },
                                disabled: ({ rawValues }: any) => !!rawValues.aggregationApiKeysSecurity,
                                onChange: ({ setValue, value }: any) => {
                                    if (value) {
                                        setValue('aggregationApiKeysSecurity', false);
                                    }
                                },
                            },
                            constrainedServicesOnly: {
                                type: type.bool,
                                label: translateMethod('Constrained services only'),
                            },
                            metadata: {
                                type: type.object,
                                label: translateMethod('Automatic API key metadata'),
                                help: translateMethod('automatic.metadata.help', false, 'Automatic metadata will be calculated on subscription acceptation'),
                            },
                            customMetadata: {
                                type: type.object,
                                array: true,
                                label: translateMethod('Custom Apikey metadata'),
                                render: (props: any) => CustomMetadataInput({ ...props, translateMethod }),
                                help: translateMethod('custom.metadata.help', false, 'custom metadata will have to be filled during subscription validation. Subscripption process will be switched to manual'),
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
                                            test: (v: any) => !!v,
                                        },
                                        label: translateMethod('Allow at last'),
                                        help: translateMethod('allow.least.help', 'Allowed path will be evaluated at last'),
                                    },
                                    allowed: {
                                        label: translateMethod('Allowed pathes'),
                                        visible: {
                                            ref: 'otoroshiTarget.apikeyCustomization.restrictions.enabled',
                                            test: (v: any) => !!v,
                                        },
                                        ...pathes,
                                    },
                                    forbidden: {
                                        label: translateMethod('Forbidden pathes'),
                                        visible: {
                                            ref: 'otoroshiTarget.apikeyCustomization.restrictions.enabled',
                                            test: (v: any) => !!v,
                                        },
                                        ...pathes,
                                    },
                                    notFound: {
                                        label: translateMethod('Not found pathes'),
                                        visible: {
                                            ref: 'otoroshiTarget.apikeyCustomization.restrictions.enabled',
                                            test: (v: any) => !!v,
                                        },
                                        ...pathes,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    {
        id: 'quotasAndBilling',
        label: translateMethod('Quotas & Billing'),
        disabled: (plan: any) => plan.type === 'FreeWithoutQuotas',
        flow: getRightBillingFlow,
        schema: {
            maxPerSecond: {
                type: type.number,
                label: translateMethod('Max. per second'),
                placeholder: translateMethod('Max. requests per second'),
                props: {
                    step: 1,
                    min: 0,
                },
                constraints: [
                    constraints.positive('constraints.positive'),
                    constraints.integer('constraints.integer'),
                ],
            },
            maxPerDay: {
                type: type.number,
                label: translateMethod('Max. per day'),
                placeholder: translateMethod('Max. requests per day'),
                props: {
                    step: 1,
                    min: 0,
                },
                constraints: [
                    constraints.positive('constraints.positive'),
                    constraints.integer('constraints.integer'),
                ],
            },
            maxPerMonth: {
                type: type.number,
                label: translateMethod('Max. per month'),
                placeholder: translateMethod('Max. requests per month'),
                props: {
                    step: 1,
                    min: 0,
                },
                constraints: [
                    constraints.positive('constraints.positive'),
                    constraints.integer('constraints.integer'),
                ],
            },
            costPerMonth: {
                type: type.number,
                label: ({ rawValues }: any) => translateMethod(`Cost per ${rawValues?.billingDuration?.unit.toLocaleLowerCase()}`),
                placeholder: translateMethod('Cost per billing period'),
                props: {
                    step: 1,
                    min: 0,
                },
                constraints: [constraints.positive('constraints.positive')],
            },
            costPerAdditionalRequest: {
                type: type.number,
                label: translateMethod('Cost per add. req.'),
                placeholder: translateMethod('Cost per additionnal request'),
                props: {
                    step: 1,
                    min: 0,
                },
                constraints: [constraints.positive('constraints.positive')],
            },
            currency: {
                type: type.object,
                format: format.form,
                label: null,
                schema: {
                    code: {
                        type: type.string,
                        format: format.select,
                        label: translateMethod('Currency'),
                        defaultValue: 'EUR',
                        options: currencies.map((c) => ({
                            label: `${c.name} (${c.symbol})`,
                            value: c.code,
                        })),
                    },
                },
            },
            billingDuration: {
                type: type.object,
                format: format.form,
                label: translateMethod('Billing every'),
                schema: {
                    value: {
                        type: type.number,
                        label: translateMethod('Billing period'),
                        placeholder: translateMethod('The Billing period'),
                        props: {
                            step: 1,
                            min: 0,
                        },
                        constraints: [
                            constraints.positive('constraints.positive'),
                            constraints.integer('constraints.integer'),
                            constraints.required('constraints.required.billing.period'),
                        ],
                    },
                    unit: {
                        type: type.string,
                        format: format.buttonsSelect,
                        label: translateMethod('Billing period unit'),
                        options: [
                            { label: translateMethod('Hours'), value: 'Hour' },
                            { label: translateMethod('Days'), value: 'Day' },
                            { label: translateMethod('Months'), value: 'Month' },
                            { label: translateMethod('Years'), value: 'Year' },
                        ],
                        constraints: [
                            constraints.required('constraints.required.billing.period'),
                            constraints.oneOf(['Hour', 'Day', 'Month', 'Year'], translateMethod('constraints.oneof.period')),
                        ],
                    },
                },
            },
            trialPeriod: {
                type: type.object,
                format: format.form,
                label: translateMethod('Trial'),
                schema: {
                    value: {
                        type: type.number,
                        label: translateMethod('Trial period'),
                        placeholder: translateMethod('The trial period'),
                        props: {
                            step: 1,
                            min: 0,
                        },
                        constraints: [
                            constraints.integer(translateMethod('constraints.integer')),
                            constraints.test('positive', translateMethod('constraints.positive'), (v) => v >= 0),
                        ],
                    },
                    unit: {
                        type: type.string,
                        format: format.buttonsSelect,
                        label: translateMethod('Trial period unit'),
                        options: [
                            { label: translateMethod('Hours'), value: 'Hour' },
                            { label: translateMethod('Days'), value: 'Day' },
                            { label: translateMethod('Months'), value: 'Month' },
                            { label: translateMethod('Years'), value: 'Year' },
                        ],
                        constraints: [
                            constraints.oneOf(['Hour', 'Day', 'Month', 'Year'], translateMethod('constraints.oneof.period')),
                            // constraints.when('trialPeriod.value', (value) => value > 0, [constraints.oneOf(['Hour', 'Day', 'Month', 'Year'], translateMethod('constraints.oneof.period'))]) //FIXME
                        ],
                    },
                },
            },
        },
    },
    {
        id: 'security',
        label: translateMethod('Settings'),
        schema: {
            otoroshiTarget: {
                type: type.object,
                visible: false,
            },
            autoRotation: {
                type: type.bool,
                label: translateMethod('Force apikey auto-rotation'),
            },
            aggregationApiKeysSecurity: {
                type: type.bool,
                visible: !!props.tenant.aggregationApiKeysSecurity,
                label: translateMethod('aggregation api keys security'),
                help: translateMethod('aggregation_apikeys.security.help'),
                onChange: ({ value, setValue }: any) => {
                    if (value)
                        window
                            .confirm(translateMethod('aggregation.api_key.security.notification'))
                            // @ts-expect-error TS(2339): Property 'then' does not exist on type 'boolean'.
                            .then((ok: any) => {
                            if (ok) {
                                setValue('otoroshiTarget.apikeyCustomization.readOnly', false);
                                setValue('otoroshiTarget.apikeyCustomization.clientIdOnly', false);
                            }
                        });
                },
            },
            allowMutlipleApiKeys: {
                type: type.bool,
                label: translateMethod('Allow multiple apiKey demands'),
            },
            subscriptionProcess: {
                type: type.string,
                format: format.buttonsSelect,
                disabled: ({ rawValues }: any) => !!rawValues?.otoroshiTarget?.apikeyCustomization?.customMetadata?.length,
                label: ({ rawValues }: any) => translateMethod('Subscription') +
                    (rawValues?.otoroshiTarget?.apikeyCustomization?.customMetadata?.length
                        ? ` (${translateMethod('Subscription.manual.help')})`
                        : ''),
                options: [
                    {
                        label: translateMethod('Automatic'),
                        value: 'Automatic',
                    },
                    { label: translateMethod('Manual'), value: 'Manual' },
                ],
                constraints: [
                    constraints.oneOf(['Automatic', 'Manual'], translateMethod('constraints.oneof.sub.process')),
                ],
            },
            integrationProcess: {
                type: type.string,
                format: format.buttonsSelect,
                label: () => translateMethod('Integration'),
                options: [
                    {
                        label: translateMethod('Automatic'),
                        value: 'Automatic',
                    },
                    { label: translateMethod('ApiKey'), value: 'ApiKey' },
                ],
                expert: true,
            },
        },
        flow: [
            {
                label: translateMethod('Security'),
                flow: ['autoRotation', 'allowMutlipleApiKeys', 'aggregationApiKeysSecurity'],
                inline: true,
            },
            'subscriptionProcess',
            'integrationProcess',
        ],
    },
];
              (window
    .confirm(translateMethod('aggregation.api_key.security.notification')) as any).then((ok: any) => {
    if (ok) {
        // @ts-expect-error TS(2304): Cannot find name 'setValue'.
        setValue('otoroshiTarget.apikeyCustomization.readOnly', false);
        // @ts-expect-error TS(2304): Cannot find name 'setValue'.
        setValue('otoroshiTarget.apikeyCustomization.clientIdOnly', false);
    }
});
          },
        },
        allowMutlipleApiKeys: {
          type: type.bool,
          // @ts-expect-error TS(2304): Cannot find name 'label'.
          label: translateMethod('Allow multiple apiKey demands'),
        },
        subscriptionProcess: {
          type: type.string,
          format: format.buttonsSelect,
          // @ts-expect-error TS(2304): Cannot find name 'disabled'.
          disabled: ({
            rawValues
          }: any) =>
            !!rawValues?.otoroshiTarget?.apikeyCustomization?.customMetadata?.length,
          // @ts-expect-error TS(2304): Cannot find name 'label'.
          label: ({
            rawValues
          }: any) =>
            // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
            translateMethod('Subscription') +
            (rawValues?.otoroshiTarget?.apikeyCustomization?.customMetadata?.length
              ? // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
                ` (${translateMethod('Subscription.manual.help')})`
              : ''),
          // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
          options: [
            {
              // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
              label: translateMethod('Automatic'),
              value: 'Automatic',
            },
            // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
            { label: translateMethod('Manual'), value: 'Manual' },
          ],
          // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
          constraints: [
            constraints.oneOf(
              ['Automatic', 'Manual'],
              // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
              translateMethod('constraints.oneof.sub.process')
            ),
          ],
        },
        integrationProcess: {
          type: type.string,
          format: format.buttonsSelect,
          // @ts-expect-error TS(2304): Cannot find name 'label'.
          label: () => translateMethod('Integration'),
          // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
          options: [
            {
              // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
              label: translateMethod('Automatic'),
              value: 'Automatic',
            },
            // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
            { label: translateMethod('ApiKey'), value: 'ApiKey' },
          ],
          // @ts-expect-error TS(2304): Cannot find name 'expert'.
          expert: true,
        },
      },
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      flow: [
        {
          // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
          label: translateMethod('Security'),
          flow: ['autoRotation', 'allowMutlipleApiKeys', 'aggregationApiKeysSecurity'],
          inline: true,
        },
        'subscriptionProcess',
        'integrationProcess',
      ],
    },
  ];

  return (<div className="d-flex col flex-column pricing-content">
      <div className="album">
        <div className="container">
          <div className="d-flex mb-3">
            <button onClick={createNewPlan} type="button" className="btn btn-outline-primary me-1">
              {translateMethod('add a new plan')}
            </button>
            {!!props.value.parent && (<button onClick={importPlan} type="button" className="btn btn-outline-primary me-1" style={{ marginTop: 0 }}>
                {translateMethod('import a plan')}
              </button>)}
            {planForEdition && mode === possibleMode.creation && (<div className="flex-grow-1 d-flex justify-content-end">
                <button onClick={cancelEdition} type="button" className="btn btn-outline-danger me-1" style={{ marginTop: 0 }}>
                  {translateMethod('Cancel')}
                </button>
              </div>)}
          </div>
          {planForEdition && mode === possibleMode.creation && (<div className="row">
              <div className="col-md-4">
                <Card api={props.value} plan={planForEdition} isDefault={(planForEdition as any)._id === props.value.defaultUsagePlan} creation={true}/>
              </div>
              <div className="col-md-8 d-flex">
                <MultiStepForm value={planForEdition} steps={steps} initial="info" creation={creation} save={savePlan} labels={{
            previous: translateMethod('Previous'),
            skip: translateMethod('Skip'),
            next: translateMethod('Next'),
            save: translateMethod('Save'),
        }}/>
              </div>
            </div>)}
          {mode === possibleMode.list && (<div className="row">
              {props.value.possibleUsagePlans.map((plan: any) => <div key={plan._id} className="col-md-4">
                <Card api={props.value} plan={plan} isDefault={plan._id === props.value.defaultUsagePlan} makeItDefault={() => makePlanDefault(plan)} toggleVisibility={() => toggleVisibility(plan)} deletePlan={() => deletePlan(plan)} editPlan={() => editPlan(plan)} duplicatePlan={() => clonePlanAndEdit(plan)}/>
              </div>)}
            </div>)}
        </div>
      </div>
    </div>);
};
