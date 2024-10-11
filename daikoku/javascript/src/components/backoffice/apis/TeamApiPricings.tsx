import { UniqueIdentifier } from '@dnd-kit/core';
import {
  CodeInput,
  constraints,
  Form,
  format,
  Schema,
  type,
} from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import cloneDeep from 'lodash/cloneDeep';
import { nanoid } from 'nanoid';
import { useContext, useEffect, useRef, useState } from 'react';
import AtSign from 'react-feather/dist/icons/at-sign';
import CreditCard from 'react-feather/dist/icons/credit-card';
import Globe from 'react-feather/dist/icons/globe';
import Plus from 'react-feather/dist/icons/plus';
import Settings from 'react-feather/dist/icons/settings';
import Trash from 'react-feather/dist/icons/trash';
import User from 'react-feather/dist/icons/user';
import { useParams } from 'react-router-dom';
import Select, { components } from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { toast } from 'sonner';

import React from 'react';
import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { currencies } from '../../../services/currencies';
import { ITeamSimple } from '../../../types';
import {
  IApi,
  IDocumentation,
  isError,
  isValidationStepEmail,
  isValidationStepHttpRequest,
  isValidationStepPayment,
  isValidationStepTeamAdmin,
  IUsagePlan,
  IValidationStep,
  IValidationStepEmail,
  IValidationStepHttpRequest,
  IValidationStepTeamAdmin,
  IValidationStepType,
  UsagePlanVisibility,
} from '../../../types/api';
import {
  IOtoroshiSettings,
  ITenant,
  ITenantFull,
  IThirdPartyPaymentSettings,
} from '../../../types/tenant';
import {
  BeautifulTitle,
  formatPlanType,
  IMultistepsformStep,
  MultiStepForm,
  Option,
  renderPricing,
  Spinner,
} from '../../utils';
import { addArrayIf, insertArrayIndex } from '../../utils/array';
import {
  FixedItem,
  SortableItem,
  SortableList,
} from '../../utils/dnd/SortableList';
import { Help } from '../apikeys';
import { TeamApiDocumentation } from './TeamApiDocumentation';
import { TeamApiSwagger } from './TeamApiSwagger';
import { TeamApiTesting } from './TeamApiTesting';

const SUBSCRIPTION_PLAN_TYPES = {
  FreeWithoutQuotas: {
    defaultName: 'Free plan',
    defaultDescription:
      'Free plan with unlimited number of calls per day and per month',
  },
  FreeWithQuotas: {
    defaultName: 'Free plan with quotas',
    defaultDescription:
      'Free plan with limited number of calls per day and per month',
  },
  QuotasWithLimits: {
    defaultName: 'Quotas with limits',
    defaultDescription:
      'Priced plan with limited number of calls per day and per month',
  },
  QuotasWithoutLimits: {
    defaultName: 'Quotas with Pay per use',
    defaultDescription:
      'Priced plan with unlimited number of calls per day and per month',
  },
  PayPerUse: {
    defaultName: 'Pay per use',
    defaultDescription: 'Plan priced on usage',
  },
};

export const OtoroshiEntitiesSelector = ({ rawValues, onChange, translate }: any) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [groups, setGroups] = useState<Array<any>>([]);
  const [services, setServices] = useState<Array<any>>([]);
  const [routes, setRoutes] = useState<Array<any>>([]);
  const [disabled, setDisabled] = useState<boolean>(true);
  const [value, setValue] = useState<any>(undefined);

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
        Services.getOtoroshiRoutesAsTeamAdmin(
          params.teamId,
          rawValues.otoroshiTarget.otoroshiSettings
        ),
      ])
        .then(([groups, services, routes]) => {
          if (!groups.error)
            setGroups(
              groups.map((g: any) => ({
                label: g.name,
                value: g.id,
                type: 'group',
              }))
            );
          else setGroups([]);
          if (!services.error)
            setServices(
              services.map((g: any) => ({
                label: g.name,
                value: g.id,
                type: 'service',
              }))
            );
          else setServices([]);
          if (!routes.error)
            setRoutes(
              routes.map((g: any) => ({
                label: g.name,
                value: g.id,
                type: 'route',
              }))
            );
          else setRoutes([]);
        })
        .catch(() => {
          setGroups([]);
          setServices([]);
          setRoutes([]);
        });
    }
    setDisabled(!otoroshiTarget || !otoroshiTarget.otoroshiSettings);
  }, [rawValues?.otoroshiTarget?.otoroshiSettings]);

  useEffect(() => {
    if (groups && services && routes) {
      setLoading(false);
    }
  }, [services, groups, routes]);

  useEffect(() => {
    if (
      !!groups &&
      !!services &&
      !!routes &&
      !!rawValues.otoroshiTarget.authorizedEntities
    ) {
      setValue(
        [
          ...rawValues.otoroshiTarget.authorizedEntities.groups.map(
            (authGroup: any) =>
              (groups as any).find((g: any) => g.value === authGroup)
          ),
          ...(rawValues.otoroshiTarget.authorizedEntities.services || []).map(
            (authService: any) =>
              (services as any).find((g: any) => g.value === authService)
          ),
          ...(rawValues.otoroshiTarget.authorizedEntities.routes || []).map(
            (authRoute: any) =>
              (routes as any).find((g: any) => g.value === authRoute)
          ),
        ].filter((f) => f)
      );
    }
  }, [rawValues, groups, services, routes]);

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
                groups: [
                  ...acc.groups,
                  groups.find((g: any) => g.value === entitie.value).value,
                ],
              };
            case 'service':
              return {
                ...acc,
                services: [
                  ...acc.services,
                  services.find((s: any) => s.value === entitie.value).value,
                ],
              };
            case 'route':
              return {
                ...acc,
                routes: [
                  ...acc.routes,
                  routes.find((s: any) => s.value === entitie.value).value,
                ],
              };
          }
        },
        { groups: [], services: [], routes: [] }
      );
      setValue([
        ...value.groups.map((authGroup: any) =>
          groups.find((g: any) => g.value === authGroup)
        ),
        ...value.services.map((authService: any) =>
          services.find((g: any) => g.value === authService)
        ),
        ...value.routes.map((authRoute: any) =>
          routes.find((g: any) => g.value === authRoute)
        ),
      ]);
      onChange(value);
    }
  };

  const groupedOptions = [
    { label: 'Service groups', options: groups },
    { label: 'Services', options: services },
    { label: 'Routes', options: routes },
  ];

  const formatGroupLabel = (data) => (
    <div className="groupStyles">
      <span>{data.label}</span>
      <span className="groupBadgeStyles">{data.options.length}</span>
    </div>
  );

  return (
    <div>
      <Select
        id={`input-label`}
        isMulti
        name={`search-label`}
        isLoading={loading}
        isDisabled={disabled && !loading}
        placeholder={translate('Authorized.entities.placeholder')} //@ts-ignore //FIXME
        components={(props: any) => <components.Group {...props} />}
        formatGroupLabel={formatGroupLabel}
        options={groupedOptions}
        value={value}
        onChange={onValueChange}
        classNamePrefix="reactSelect"
        className="reactSelect"
      />
      <div className="col-12 d-flex flex-row mt-3">
        <div className="d-flex flex-column flex-grow-1">
          <strong className="reactSelect__group-heading">
            <Translation i18nkey="authorized.groups">
              Services Groups
            </Translation>
          </strong>
          {!!value &&
            value
              .filter((x: any) => x.type === 'group')
              .map((g: any, idx: any) => (
                <span className="p-2" key={idx}>
                  {g.label}
                </span>
              ))}
        </div>
        <div className="d-flex flex-column flex-grow-1">
          <strong className="reactSelect__group-heading">
            <Translation i18nkey="authorized.services">Services</Translation>
          </strong>
          {!!value &&
            value
              .filter((x: any) => x.type === 'service')
              .map((g: any, idx: any) => (
                <span className="p-2" key={idx}>
                  {g.label}
                </span>
              ))}
        </div>
        <div className="d-flex flex-column flex-grow-1">
          <strong className="reactSelect__group-heading">
            <Translation i18nkey="authorized.routes">Routes</Translation>
          </strong>
          {!!value &&
            value
              .filter((x: any) => x.type === 'route')
              .map((g: any, idx: any) => (
                <span className="p-2" key={idx}>
                  {g.label}
                </span>
              ))}
        </div>
      </div>
    </div>
  );
};

export const CustomMetadataInput = (props: {
  value?: Array<{ key: string; possibleValues: Array<string> }>;
  onChange?: (param: any) => void;
  setValue?: (key: string, data: any) => void;
  translate: (key: string) => string;
}) => {
  const { alert } = useContext(ModalContext);

  const changeValue = (possibleValues: any, key: string) => {
    const oldValue = Option(props.value?.find((x) => x.key === key)).getOrElse({
      key: '',
      possibleValues: [],
    });
    const newValues = [
      ...(props.value || []).filter((x) => x.key !== key),
      { ...oldValue, key, possibleValues },
    ];
    props.onChange && props.onChange(newValues);
  };

  const changeKey = (
    e: React.ChangeEvent<HTMLInputElement>,
    oldName: string
  ) => {
    if (e && e.preventDefault) e.preventDefault();

    const oldValue = Option(
      props.value?.find((x) => x.key === oldName)
    ).getOrElse({ key: '', possibleValues: [] });
    const newValues = [
      ...(props.value || []).filter((x) => x.key !== oldName),
      { ...oldValue, key: e.target.value },
    ];
    props.onChange && props.onChange(newValues);
  };

  const addFirst = (e: React.MouseEvent<HTMLElement>) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!props.value || props.value.length === 0) {
      props.onChange && props.onChange([{ key: '', possibleValues: [] }]);
      alert({
        message: props.translate('custom.metadata.process.change.to.manual'),
        title: props.translate('Information'),
      });
    }
  };

  const addNext = (e: React.MouseEvent<HTMLElement>) => {
    if (e && e.preventDefault) e.preventDefault();
    const newItem = { key: '', possibleValues: [] };
    const newValues = [...(props.value || []), newItem];
    props.onChange && props.onChange(newValues);
  };

  const remove = (e: React.MouseEvent<HTMLElement>, key: string) => {
    if (e && e.preventDefault) e.preventDefault();

    props.onChange &&
      props.onChange((props.value || []).filter((x: any) => x.key !== key));
  };

  return (
    <div>
      {!props.value?.length && (
        <div className="col-sm-10">
          <button
            type="button"
            className="btn btn-outline-info"
            onClick={(e) => addFirst(e)}
          >
            <i className="fas fa-plus" />{' '}
          </button>
        </div>
      )}

      {(props.value || []).map(({ key, possibleValues }, idx) => (
        <div key={idx} className="col-sm-10">
          <div className="input-group">
            <input
              type="text"
              className="form-control col-5 me-1"
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
              value={possibleValues.map((value: any) => ({
                label: value,
                value,
              }))}
              className="input-select reactSelect flex-grow-1"
              classNamePrefix="reactSelect"
            />
            <button
              type="button"
              className="input-group-text btn btn-outline-danger"
              onClick={(e) => remove(e, key)}
            >
              <i className="fas fa-trash" />
            </button>
            {idx === (props.value?.length || 0) - 1 && (
              <button
                type="button"
                className="input-group-text btn btn-outline-info"
                onClick={addNext}
              >
                <i className="fas fa-plus" />{' '}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

type CardProps = {
  plan: IUsagePlan;
  isDefault: boolean;
  makeItDefault?: () => void;
  toggleVisibility?: () => void;
  deletePlan: () => void;
  editPlan?: () => void;
  duplicatePlan?: () => void;
  creation?: boolean;
};
const Card = ({
  plan,
  isDefault,
  makeItDefault,
  toggleVisibility,
  deletePlan,
  editPlan,
  duplicatePlan,
  creation,
}: CardProps) => {
  const { translate, Translation } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const { tenant } = useContext(GlobalContext);

  const pricing = renderPricing(plan, translate);

  const deleteWithConfirm = () => {
    confirm({ message: translate('delete.plan.confirm') }).then((ok) => {
      if (ok) {
        deletePlan();
      }
    });
  };

  const noOtoroshi =
    !plan.otoroshiTarget ||
    !plan.otoroshiTarget.authorizedEntities ||
    (!plan.otoroshiTarget.authorizedEntities.groups.length &&
      !plan.otoroshiTarget.authorizedEntities.services.length &&
      !plan.otoroshiTarget.authorizedEntities.routes.length);

  return (
    <div
      className="card hoverable-card mb-4 shadow-sm"
      style={{ position: 'relative' }}
    >
      {noOtoroshi && (
        <BeautifulTitle
          className=""
          title={translate('warning.missing.otoroshi')}
          style={{
            position: 'absolute',
            fontSize: '20px',
            bottom: '15px',
            right: '15px',
            zIndex: '100',
            color: 'var(--error-color, #ff6347)',
          }}
        >
          <i className="fas fa-exclamation-triangle" />
        </BeautifulTitle>
      )}
      <div
        style={{
          position: 'absolute',
          fontSize: '20px',
          top: '15px',
          right: '15px',
          zIndex: '100',
        }}
      >
        {plan.visibility === PRIVATE && (
          <i
            className="fas fa-lock"
            style={{ color: '$card-header-text-color' }}
          />
        )}
        {isDefault && (
          <i
            className="fas fa-star"
            style={{ color: '$card-header-text-color' }}
          />
        )}
      </div>
      {!creation && (
        <div
          className="dropdown"
          style={{
            position: 'absolute',
            top: '15px',
            left: '15px',
            zIndex: '100',
          }}
        >
          <i
            className="fa fa-cog cursor-pointer dropdown-menu-button"
            style={{ fontSize: '20px' }}
            data-bs-toggle="dropdown"
            aria-expanded="false"
            id="dropdownMenuButton"
          />
          <div className="dropdown-menu" aria-labelledby="dropdownMenuButton">
            {!isDefault && plan.visibility !== PRIVATE && (
              <span
                className="dropdown-item cursor-pointer"
                onClick={makeItDefault}
              >
                {tenant.display === 'environment'
                  ? translate('pricing.default.env.btn.label')
                  : translate('Make default plan')}
              </span>
            )}
            {!isDefault && (
              <span
                onClick={toggleVisibility}
                className="dropdown-item cursor-pointer"
              >
                {plan.visibility === PUBLIC && (
                  <Translation i18nkey="Make it private">
                    Make it private
                  </Translation>
                )}
                {plan.visibility === PRIVATE && (
                  <Translation i18nkey="Make it public">
                    Make it public
                  </Translation>
                )}
              </span>
            )}
            <div className="dropdown-divider" />
            <span
              className="dropdown-item cursor-pointer"
              onClick={duplicatePlan}
            >
              {tenant.display === 'environment'
                ? translate('pricing.clone.env.btn.label')
                : translate('Duplicate plan')}
            </span>
            <span className="dropdown-item cursor-pointer" onClick={editPlan}>
              {tenant.display === 'environment'
                ? translate('pricing.edit.env.btn.label')
                : translate('Edit plan')}
            </span>
            <div className="dropdown-divider" />
            <span
              className="dropdown-item cursor-pointer btn-outline-danger"
              onClick={deleteWithConfirm}
            >
              {tenant.display === 'environment'
                ? translate('pricing.delete.env.btn.label')
                : translate('Delete plan')}
            </span>
          </div>
        </div>
      )}
      <div
        className="card-img-top card-link card-header"
        data-holder-rendered="true"
      >
        <span>{plan.customName || formatPlanType(plan, translate)}</span>
      </div>
      <div className="card-body plan-body d-flex flex-column">
        <p className="card-text text-justify">
          <span>{plan.customDescription}</span>
        </p>
        <div className="d-flex flex-column mb-2">
          <span className="plan-quotas">
            {!plan.maxPerSecond &&
              !plan.maxPerMonth &&
              translate('plan.limits.unlimited')}
            {!!plan.maxPerSecond && !!plan.maxPerMonth && (
              <div>
                <div>
                  <Translation
                    i18nkey="plan.limits"
                    replacements={[plan.maxPerSecond, plan.maxPerMonth]}
                  >
                    Limits: {plan.maxPerSecond} req./sec, {plan.maxPerMonth}{' '}
                    req./month
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
    </div>
  );
};

const PUBLIC: UsagePlanVisibility = UsagePlanVisibility.public;
const PRIVATE: UsagePlanVisibility = UsagePlanVisibility.private;

type Props = {
  currentTeam: ITeamSimple;
  api: IApi;
  team: ITeamSimple;
  tenant: ITenant;
  reload: () => Promise<void>;
  setDefaultPlan: (plan: IUsagePlan) => void;
  creation: boolean;
  expertMode: boolean;
  injectSubMenu: (x: JSX.Element | null) => void;
  openApiSelectModal?: () => void;
  setHeader: (t?: string) => void;
};
type Tab =
  | 'settings'
  | 'security'
  | 'payment'
  | 'subscription-process'
  | 'swagger'
  | 'documentation'
  | 'testing';

export const TeamApiPricings = (props: Props) => {
  const possibleMode = {
    list: 'LIST',
    creation: 'CREATION',
    edition: 'EDITION',
  };
  const [planForEdition, setPlanForEdition] = useState<IUsagePlan>();
  const [mode, setMode] = useState('LIST');
  const [creation, setCreation] = useState(false);
  const [selectedTab, setSelectedTab] = useState<Tab>('settings');

  const { translate } = useContext(I18nContext);
  const { openApiSelectModal, confirm } = useContext(ModalContext);
  const { tenant } = useContext(GlobalContext);

  const queryClient = useQueryClient();
  const queryFullTenant = useQuery({
    queryKey: ['full-tenant'],
    queryFn: () => Services.oneTenant(props.tenant._id),
  });
  const queryPlans = useQuery({
    queryKey: ['plans'],
    queryFn: () =>
      Services.getAllPlanOfApi(
        props.api.team,
        props.api._id,
        props.api.currentVersion
      ),
  });

  useEffect(() => {
    return () => {
      props.injectSubMenu(null);
      props.setHeader(undefined);
    };
  }, []);

  useEffect(() => {
    if (mode !== possibleMode.list) {
      props.injectSubMenu(
        <div className="entry__submenu d-flex flex-column">
          <span
            className={classNames('submenu__entry__link', {
              active: selectedTab === 'settings',
            })}
            onClick={() => setSelectedTab('settings')}
          >
            {translate('Settings')}
          </span>
          {mode === possibleMode.edition &&
            planForEdition &&
            paidPlans.includes(planForEdition.type) && (
              <span
                className={classNames('submenu__entry__link', {
                  active: selectedTab === 'payment',
                })}
                onClick={() => setSelectedTab('payment')}
              >
                {translate('Payment')}
              </span>
            )}
          {mode === possibleMode.edition && (
            <span
              className={classNames('submenu__entry__link', {
                active: selectedTab === 'subscription-process',
              })}
              onClick={() => setSelectedTab('subscription-process')}
            >
              {translate('Process')}
            </span>
          )}
          {mode === possibleMode.edition && (
            <span
              className={classNames('submenu__entry__link', {
                active: selectedTab === 'security',
              })}
              onClick={() => setSelectedTab('security')}
            >
              {translate('Security')}
            </span>
          )}
          {mode === possibleMode.edition &&
            tenant.display === 'environment' && (
              <span
                className={classNames('submenu__entry__link', {
                  active: selectedTab === 'swagger',
                })}
                onClick={() => setSelectedTab('swagger')}
              >
                {translate('Swagger')}
              </span>
            )}
          {mode === possibleMode.edition &&
            tenant.display === 'environment' && (
              <span
                className={classNames('submenu__entry__link', {
                  active: selectedTab === 'testing',
                  disabled:
                    !planForEdition?.swagger?.content &&
                    !planForEdition?.swagger?.url,
                })}
                onClick={() => {
                  const swaggerExist =
                    !!planForEdition?.swagger?.content ||
                    !!planForEdition?.swagger?.url;
                  if (swaggerExist) {
                    setSelectedTab('testing');
                  }
                }}
              >
                {translate('Testing')}
              </span>
            )}
          {mode === possibleMode.edition &&
            tenant.display === 'environment' && (
              <span
                className={classNames('submenu__entry__link', {
                  active: selectedTab === 'documentation',
                })}
                onClick={() => setSelectedTab('documentation')}
              >
                {translate('Documentation')}
              </span>
            )}
        </div>
      );
    } else {
      props.injectSubMenu(null);
    }
  }, [mode, selectedTab, planForEdition]);

  useEffect(() => {
    if (mode === possibleMode.creation) {
      setPlanForEdition(planForEdition);
      setMode(possibleMode.edition);
    }
  }, [props.api]);

  useEffect(() => {
    if (
      queryPlans.data &&
      !isError(queryPlans.data) &&
      mode === possibleMode.edition
    ) {
      const plan = queryPlans.data.find((p) => p._id === planForEdition?._id);
      setPlanForEdition(plan);
    }
  }, [queryPlans.data]);

  const pathes = {
    type: type.object,
    format: format.form,
    array: true,
    schema: {
      method: {
        type: type.string,
        format: format.select,
        label: translate('http.method'),
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
        label: translate('http.path'),
        defaultValue: '/',
        constraints: [
          constraints.matches(
            /^\/([^\s]\w*)*$/,
            translate('constraint.match.path')
          ),
        ],
      },
    },
    flow: ['method', 'path'],
  };

  const freeWithQuotasFlow = [
    {
      label: translate('Quotas'),
      collapsed: false,
      flow: ['maxPerSecond', 'maxPerDay', 'maxPerMonth'],
    },
  ];

  const quotasWithLimitsFlow = [
    {
      label: translate('Third-party Payment'),
      collapsed: false,
      flow: ['paymentSettings'],
    },
    {
      label: translate('Billing'),
      collapsed: false,
      flow: ['trialPeriod', 'billingDuration', 'costPerMonth', 'currency'],
    },
  ];

  const quotasWithoutLimitsFlow = [
    {
      label: translate('Third-party Payment'),
      collapsed: false,
      flow: ['paymentSettings'],
    },
    {
      label: translate('Billing'),
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
      label: translate('Third-party Payment'),
      collapsed: false,
      flow: ['paymentSettings'],
    },
    {
      label: translate('Billing'),
      collapsed: false,
      flow: [
        'trialPeriod',
        'billingDuration',
        'costPerMonth',
        'costPerRequest',
        'currency',
      ],
    },
  ];

  const getRightBillingFlow = (plan: IUsagePlan) => {
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

  const deletePlan = (plan: IUsagePlan) => {
    Services.deletePlan(
      props.team._id,
      props.api._id,
      props.api.currentVersion,
      plan
    )
      .then(() => props.reload())
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['plans'] });
        toast.success(translate('plan.deletion.successful'));
      });
  };

  const createNewPlan = () => {
    Services.fetchNewPlan('FreeWithQuotas').then((newPlan) => {
      setPlanForEdition(newPlan);
      setMode(possibleMode.creation);
      setSelectedTab('settings');
      setCreation(true);
    });
  };
  const editPlan = (plan: IUsagePlan) => {
    setCreation(false);
    setPlanForEdition(plan);
    setMode(possibleMode.edition);
    props.setHeader(plan.customName || plan.type);
  };

  const makePlanDefault = (plan: IUsagePlan) => {
    props.setDefaultPlan(plan);
  };

  const toggleVisibility = (plan: IUsagePlan) => {
    if (props.api.defaultUsagePlan !== plan._id) {
      const originalVisibility = plan.visibility;
      const visibility = originalVisibility === PUBLIC ? PRIVATE : PUBLIC;
      const updatedPlan = { ...plan, visibility };
      savePlan(updatedPlan);
    }
  };

  const savePlan = (plan: IUsagePlan) => {
    const service = creation ? Services.createPlan : Services.updatePlan;
    return service(
      props.team._id,
      props.api._id,
      props.api.currentVersion,
      plan
    ).then((response) => {
      if (isError(response)) {
        toast.error(translate(response.error));
      } else {
        toast.success(
          creation
            ? translate('plan.creation.successful')
            : translate('plan.update.successful')
        );
        setPlanForEdition(response);
        setCreation(false);
        props.reload();
        queryClient.invalidateQueries({ queryKey: ['plans'] });
      }
    });
  };

  const setupPayment = (plan: IUsagePlan) => {
    //FIXME: beware of update --> display a message to explain what user is doing !!
    return Services.setupPayment(
      props.team._id,
      props.api._id,
      props.api.currentVersion,
      plan
    ).then((response) => {
      if (isError(response)) {
        toast.error(translate(response.error));
      } else {
        toast.success(translate('plan.payment.setup.successful'));
        setPlanForEdition(response);
        props.reload();
      }
    });
  };

  const clonePlanAndEdit = (plan: IUsagePlan) => {
    const clone: IUsagePlan = {
      ...cloneDeep(plan),
      _id: nanoid(32),
      customName: `${plan.customName} (copy)`,
      paymentSettings: undefined,
    };
    setPlanForEdition(clone);
    setMode(possibleMode.creation);
    setCreation(true);
  };

  const importPlan = () => {
    openApiSelectModal({
      api: props.api,
      teamId: props.team._id,
      onClose: (plan) => {
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
    props.setHeader(undefined);
    setCreation(false);
  };

  const planTypes = [
    'FreeWithoutQuotas',
    'FreeWithQuotas',
    'QuotasWithLimits',
    'QuotasWithoutLimits',
    'PayPerUse',
  ];

  const paidPlans = ['QuotasWithLimits', 'QuotasWithoutLimits', 'PayPerUse'];

  const customNameSchemaPart = (plans: Array<IUsagePlan>, api: IApi) => {
    if (tenant.display === 'environment' && api.visibility !== 'AdminOnly') {
      const availablePlans = tenant.environments.filter((e) =>
        plans
          .filter((p) => p._id !== planForEdition?._id)
          .every((p) => p.customName !== e)
      );

      return {
        customName: {
          type: type.string,
          format: format.select,
          label: translate('Name'),
          placeholder: translate('Plan name'),
          options: availablePlans,
          constraints: [
            constraints.oneOf(
              tenant.environments,
              translate('constraints.plan.custom-name.one-of.environment')
            ),
            constraints.required(translate('constraints.required.value')),
          ],
        },
      };
    } else {
      return {
        customName: {
          type: type.string,
          label: translate('Name'),
          placeholder: translate('Plan name'),
        },
      };
    }
  };

  const steps = (
    plans: IUsagePlan[],
    api: IApi
  ): Array<IMultistepsformStep<IUsagePlan>> => [
    {
      id: 'info',
      label: 'Informations',
      schema: {
        type: {
          type: type.string,
          format: format.select,
          label: translate('Type'),
          onAfterChange: ({ rawValues, setValue, value, reset }: any) => {
            Services.fetchNewPlan(value).then((newPlan) => {
              const isDescIsDefault = Object.values(SUBSCRIPTION_PLAN_TYPES)
                .map(({ defaultDescription }) => defaultDescription)
                .some(
                  (d) =>
                    !rawValues.customDescription ||
                    d === rawValues.customDescription
                );
              let customDescription = rawValues.customDescription;
              if (isDescIsDefault) {
                const planType = SUBSCRIPTION_PLAN_TYPES[value];
                customDescription = planType.defaultDescription;
              }

              reset({
                ...newPlan,
                ...rawValues,
                type: value,
                customDescription,
              });
            });
          },
          options: planTypes,
          transformer: (value: any) => ({
            label: translate(value),
            value,
          }),
          constraints: [
            constraints.required(translate('constraints.required.type')),
            constraints.oneOf(
              planTypes,
              translate('constraints.oneof.plan.type')
            ),
          ],
        },
        ...customNameSchemaPart(plans, props.api),
        customDescription: {
          type: type.string,
          format: format.text,
          label: translate('Description'),
          placeholder: translate('Plan description'),
        },
      },
      flow: ['type', 'customName', 'customDescription'],
    },
    {
      id: 'oto',
      label: translate('Otoroshi Settings'),
      schema: {
        otoroshiTarget: {
          type: type.object,
          format: format.form,
          label: translate('Otoroshi target'),
          schema: {
            otoroshiSettings: {
              type: type.string,
              format: format.select,
              disabled:
                !creation && !!planForEdition?.otoroshiTarget?.otoroshiSettings,
              label: translate('Otoroshi instances'),
              optionsFrom: Services.allSimpleOtoroshis(
                props.tenant._id,
                props.currentTeam
              )
                .then((r) => {
                  console.log({ r });
                  return r;
                })
                .then((r) => (isError(r) ? [] : r)),
              transformer: (s: IOtoroshiSettings) => ({
                label: s.url,
                value: s._id,
              }),
            },
            authorizedEntities: {
              type: type.object,
              visible: ({ rawValues }) =>
                !!rawValues.otoroshiTarget.otoroshiSettings,
              deps: ['otoroshiTarget.otoroshiSettings'],
              render: (props) =>
                OtoroshiEntitiesSelector({ ...props, translate }),
              label: translate('Authorized entities'),
              placeholder: translate('Authorized.entities.placeholder'),
              help: translate('authorized.entities.help'),
            },
          },
        },
      },
      flow: ['otoroshiTarget', 'subscriptionProcess'],
    },
    {
      id: 'customization',
      label: translate('Otoroshi Customization'),
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
                  label: ({ rawValues }) => {
                    if (rawValues.aggregationApiKeysSecurity) {
                      return `${translate('Read only apikey')} (${translate('disabled.due.to.aggregation.security')})`;
                    } else {
                      return translate('Apikey with clientId only');
                    }
                  },
                  disabled: ({ rawValues }) =>
                    !!rawValues.aggregationApiKeysSecurity,
                  onChange: ({ setValue, value }) => {
                    if (value) {
                      setValue('aggregationApiKeysSecurity', false);
                    }
                  },
                },
                readOnly: {
                  type: type.bool,
                  label: ({ rawValues }) => {
                    if (rawValues.aggregationApiKeysSecurity) {
                      return `${translate('Read only apikey')} (${translate('disabled.due.to.aggregation.security')})`;
                    } else {
                      return translate('Read only apikey');
                    }
                  },
                  disabled: ({ rawValues }) =>
                    !!rawValues.aggregationApiKeysSecurity,
                  onChange: ({ setValue, value }) => {
                    if (value) {
                      setValue('aggregationApiKeysSecurity', false);
                    }
                  },
                },
                constrainedServicesOnly: {
                  type: type.bool,
                  label: translate('Constrained services only'),
                },
                metadata: {
                  type: type.object,
                  label: translate('Automatic API key metadata'),
                  help: translate('automatic.metadata.help'),
                },
                customMetadata: {
                  type: type.object,
                  array: true,
                  label: translate('Custom Apikey metadata'),
                  defaultValue: [],
                  render: (props) => (
                    <CustomMetadataInput {...props} translate={translate} />
                  ),
                  help: translate('custom.metadata.help'),
                },
                tags: {
                  type: type.string,
                  array: true,
                  label: translate('Apikey tags'),
                  constraints: [
                    constraints.required(
                      translate('constraints.required.value')
                    ),
                  ],
                },
                restrictions: {
                  type: type.object,
                  format: format.form,
                  label: 'Restrictions',
                  schema: {
                    enabled: {
                      type: type.bool,
                      label: translate('Enable restrictions'),
                    },
                    allowLast: {
                      type: type.bool,
                      visible: ({ rawValues }) =>
                        !!rawValues.otoroshiTarget.apikeyCustomization
                          .restrictions.enabled,
                      deps: [
                        'otoroshiTarget.apikeyCustomization.restrictions.enabled',
                      ],
                      label: translate('Allow at last'),
                      help: translate('allow.least.help'),
                    },
                    allowed: {
                      label: translate('Allowed pathes'),
                      visible: ({ rawValues }) =>
                        rawValues.otoroshiTarget.apikeyCustomization
                          .restrictions.enabled,
                      deps: [
                        'otoroshiTarget.apikeyCustomization.restrictions.enabled',
                      ],
                      ...pathes,
                    },
                    forbidden: {
                      label: translate('Forbidden pathes'),
                      visible: ({ rawValues }) =>
                        rawValues.otoroshiTarget.apikeyCustomization
                          .restrictions.enabled,
                      deps: [
                        'otoroshiTarget.apikeyCustomization.restrictions.enabled',
                      ],
                      ...pathes,
                    },
                    notFound: {
                      label: translate('Not found pathes'),
                      visible: ({ rawValues }) =>
                        rawValues.otoroshiTarget.apikeyCustomization
                          .restrictions.enabled,
                      deps: [
                        'otoroshiTarget.apikeyCustomization.restrictions.enabled',
                      ],
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
      id: 'quotas',
      label: translate('Quotas'),
      disabled: (plan) =>
        plan.type === 'FreeWithoutQuotas' || plan.type === 'PayPerUse',
      schema: {
        maxPerSecond: {
          type: type.number,
          label: translate('Max. per second'),
          placeholder: translate('Max. requests per second'),
          props: {
            step: 1,
            min: 0,
          },
          constraints: [
            constraints.positive(translate('constraints.positive')),
            constraints.integer(translate('constraints.integer')),
          ],
        },
        maxPerDay: {
          type: type.number,
          label: translate('Max. per day'),
          placeholder: translate('Max. requests per day'),
          props: {
            step: 1,
            min: 0,
          },
          constraints: [
            constraints.positive(translate('constraints.positive')),
            constraints.integer(translate('constraints.integer')),
          ],
        },
        maxPerMonth: {
          type: type.number,
          label: translate('Max. per month'),
          placeholder: translate('Max. requests per month'),
          props: {
            step: 1,
            min: 0,
          },
          constraints: [
            constraints.positive(translate('constraints.positive')),
            constraints.integer(translate('constraints.integer')),
          ],
        },
      },
    },
  ];

  const billingSchema = {
    paymentSettings: {
      type: type.object,
      format: format.form,
      label: translate('payment settings'),
      schema: {
        thirdPartyPaymentSettingsId: {
          type: type.string,
          format: format.select,
          label: translate('Type'),
          help: 'If no type is selected, use Daikoku APIs to get billing informations',
          options: queryFullTenant.data
            ? (queryFullTenant.data as ITenantFull).thirdPartyPaymentSettings
            : [],
          transformer: (s: IThirdPartyPaymentSettings) => ({
            label: s.name,
            value: s._id,
          }),
          props: { isClearable: true },
          onChange: ({ rawValues, setValue, value }) => {
            const settings = queryFullTenant.data
              ? (queryFullTenant.data as ITenantFull).thirdPartyPaymentSettings
              : [];
            setValue(
              'paymentSettings.type',
              settings.find((s) => value === s._id)?.type
            );
          },
        },
      },
    },
    costPerMonth: {
      type: type.number,
      label: ({ rawValues }) =>
        translate(
          `Cost per ${rawValues?.billingDuration?.unit.toLocaleLowerCase()}`
        ),
      placeholder: translate('Cost per billing period'),
      constraints: [constraints.positive(translate('constraints.positive'))],
    },
    costPerAdditionalRequest: {
      type: type.number,
      label: translate('Cost per add. req.'),
      placeholder: translate('Cost per additionnal request'),
      constraints: [constraints.positive(translate('constraints.positive'))],
    },
    costPerRequest: {
      type: type.number,
      label: translate('Cost per req.'),
      placeholder: translate('Cost per request'),
      constraints: [constraints.positive(translate('constraints.positive'))],
    },
    currency: {
      type: type.object,
      format: format.form,
      label: null,
      schema: {
        code: {
          type: type.string,
          format: format.select,
          label: translate('Currency'),
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
      label: translate('Billing every'),
      schema: {
        value: {
          type: type.number,
          label: translate('Billing period'),
          placeholder: translate('The Billing period'),
          props: {
            step: 1,
            min: 0,
          },
          constraints: [
            constraints.positive(translate('constraints.positive')),
            constraints.integer(translate('constraints.integer')),
            constraints.required(
              translate('constraints.required.billing.period')
            ),
          ],
        },
        unit: {
          type: type.string,
          format: format.buttonsSelect,
          label: translate('Billing period unit'),
          options: [
            { label: translate('Hours'), value: 'Hour' },
            { label: translate('Days'), value: 'Day' },
            { label: translate('Months'), value: 'Month' },
            { label: translate('Years'), value: 'Year' },
          ],
          constraints: [
            constraints.required('constraints.required.billing.period'),
            constraints.oneOf(
              ['Hour', 'Day', 'Month', 'Year'],
              translate('constraints.oneof.period')
            ),
          ],
        },
      },
    },
    trialPeriod: {
      type: type.object,
      format: format.form,
      label: translate('Trial'),
      schema: {
        value: {
          type: type.number,
          label: translate('Trial period'),
          placeholder: translate('The trial period'),
          defaultValue: 0,
          props: {
            step: 1,
            min: 0,
          },
          constraints: [
            constraints.integer(translate('constraints.integer')),
            constraints.test(
              'positive',
              translate('constraints.positive'),
              (v) => v >= 0
            ),
          ],
        },
        unit: {
          type: type.string,
          format: format.buttonsSelect,
          label: translate('Trial period unit'),
          defaultValue: 'Month',
          options: [
            { label: translate('Hours'), value: 'Hour' },
            { label: translate('Days'), value: 'Day' },
            { label: translate('Months'), value: 'Month' },
            { label: translate('Years'), value: 'Year' },
          ],
          constraints: [
            constraints.oneOf(
              ['Hour', 'Day', 'Month', 'Year'],
              translate('constraints.oneof.period')
            ),
            // constraints.when('trialPeriod.value', (value) => value > 0, [constraints.oneOf(['Hour', 'Day', 'Month', 'Year'], translate('constraints.oneof.period'))]) //FIXME
          ],
        },
      },
    },
  };

  const securitySchema: Schema = {
    otoroshiTarget: {
      type: type.object,
      visible: false,
    },
    autoRotation: {
      type: type.bool,
      format: format.buttonsSelect,
      label: translate('Force apikey auto-rotation'),
      props: {
        trueLabel: translate('Enabled'),
        falseLabel: translate('Disabled'),
      },
    },
    aggregationApiKeysSecurity: {
      type: type.bool,
      format: format.buttonsSelect,
      visible: !!props.tenant.aggregationApiKeysSecurity,
      label: translate('aggregation api keys security'),
      help: translate('aggregation_apikeys.security.help'),
      onChange: ({ value, setValue }: any) => {
        if (value)
          confirm({
            message: translate('aggregation.api_key.security.notification'),
          }).then((ok) => {
            if (ok) {
              setValue('otoroshiTarget.apikeyCustomization.readOnly', false);
              setValue(
                'otoroshiTarget.apikeyCustomization.clientIdOnly',
                false
              );
            }
          });
      },
      props: {
        trueLabel: translate('Enabled'),
        falseLabel: translate('Disabled'),
      },
    },
    allowMultipleKeys: {
      type: type.bool,
      format: format.buttonsSelect,
      label: translate('Allow multiple apiKey demands'),
      props: {
        trueLabel: translate('Enabled'),
        falseLabel: translate('Disabled'),
      },
    },
    integrationProcess: {
      type: type.string,
      format: format.buttonsSelect,
      label: () => translate('Integration'),
      options: [
        {
          label: translate('Automatic'),
          value: 'Automatic',
        },
        { label: translate('ApiKey'), value: 'ApiKey' },
      ], //@ts-ignore //FIXME
      expert: true,
    },
    visibility: {
      type: type.string,
      format: format.buttonsSelect,
      label: () => translate('Visibility'),
      options: [
        { label: translate('Public'), value: 'Public' },
        { label: translate('Private'), value: 'Private' },
      ],
    },
    authorizedTeams: {
      type: type.string,
      format: format.select,
      isMulti: true,
      defaultValue: [],
      visible: ({ rawValues }) => rawValues['visibility'] !== 'Public',
      label: translate('Authorized teams'),
      optionsFrom: '/api/me/teams',
      transformer: (t: any) => ({
        label: t.name,
        value: t._id,
      }),
    },
  };

  const availablePlans =
    queryPlans.data &&
    !isError(queryPlans.data) &&
    tenant.environments.filter((e) =>
      (queryPlans.data as Array<IUsagePlan>).every((p) => p.customName !== e)
    );
  return (
    <div className="d-flex col flex-column pricing-content">
      <div className="album">
        {planForEdition && mode !== possibleMode.list && (
          <i
            onClick={cancelEdition}
            className="fa-regular fa-circle-left fa-lg cursor-pointer a-fake"
            style={{ marginTop: 0 }}
          />
        )}
        <div className="container">
          <div className="d-flex mb-3">
            {!planForEdition && (
              <button
                onClick={createNewPlan}
                type="button"
                disabled={
                  tenant.display === 'environment' &&
                  (!availablePlans || !availablePlans.length)
                }
                className="btn btn-outline-success btn-sm me-1"
              >
                {tenant.display === 'environment'
                  ? translate('pricing.add.new.env.btn.label')
                  : translate('add a new plan')}
              </button>
            )}
            {!planForEdition && !!props.api.parent && (
              <button
                onClick={importPlan}
                type="button"
                className="btn btn-outline-info me-1"
                style={{ marginTop: 0 }}
              >
                {tenant.display === 'environment'
                  ? translate('pricing.import.env.btn.label')
                  : translate('import a plan')}
              </button>
            )}
          </div>
          {planForEdition && mode !== possibleMode.list && (
            <div className="row">
              <div className="col-md-12">
                {queryPlans.data && selectedTab === 'settings' && (
                  <MultiStepForm<IUsagePlan>
                    value={planForEdition}
                    steps={steps(
                      queryPlans.data as Array<IUsagePlan>,
                      props.api
                    )}
                    initial="info"
                    creation={creation}
                    save={savePlan}
                    currentTeam={props.currentTeam}
                    labels={{
                      previous: translate('Previous'),
                      skip: translate('Skip'),
                      next: translate('Next'),
                      save: translate('Save'),
                    }}
                  />
                )}
                {queryPlans.data && selectedTab === 'payment' && (
                  <Form
                    schema={billingSchema}
                    flow={getRightBillingFlow(planForEdition)}
                    onSubmit={(plan) => setupPayment(plan)}
                    value={planForEdition}
                  />
                )}
                {queryPlans.data && selectedTab === 'security' && (
                  <Form
                    schema={securitySchema}
                    onSubmit={savePlan}
                    value={planForEdition}
                  />
                )}
                {queryPlans.data && selectedTab === 'subscription-process' && (
                  <SubscriptionProcessEditor
                    savePlan={savePlan}
                    value={planForEdition}
                    team={props.team}
                    tenant={queryFullTenant.data as ITenantFull}
                  />
                )}
                {queryPlans.data && selectedTab === 'swagger' && (
                  <TeamApiSwagger value={planForEdition} save={savePlan} />
                )}
                {queryPlans.data && selectedTab === 'testing' && (
                  <TeamApiTesting
                    currentTeam={props.currentTeam}
                    value={planForEdition}
                    api={props.api}
                    save={savePlan}
                  />
                )}
                {queryPlans.data && selectedTab === 'documentation' && (
                  <TeamApiPricingDocumentation
                    api={props.api}
                    team={props.team}
                    planForEdition={planForEdition}
                    onSave={(documentation) =>
                      savePlan({ ...planForEdition, documentation })
                    }
                    reloadState={() =>
                      queryClient.invalidateQueries({ queryKey: ['plans'] })
                    }
                    plans={queryPlans.data as Array<IUsagePlan>}
                  />
                )}
              </div>
            </div>
          )}
          {mode === possibleMode.list && (
            <div className="row">
              {queryPlans.isLoading && <Spinner />}
              {queryPlans.data &&
                !isError(queryPlans.data) &&
                queryPlans.data
                  .sort((a, b) =>
                    (a.customName || a.type).localeCompare(
                      b.customName || b.type
                    )
                  )
                  .map((plan) => (
                    <div key={plan._id} className="col-md-4">
                      <Card
                        plan={plan}
                        isDefault={plan._id === props.api.defaultUsagePlan}
                        makeItDefault={() => makePlanDefault(plan)}
                        toggleVisibility={() => toggleVisibility(plan)}
                        deletePlan={() => deletePlan(plan)}
                        editPlan={() => editPlan(plan)}
                        duplicatePlan={() => clonePlanAndEdit(plan)}
                      />
                    </div>
                  ))}
              {queryPlans.isError && <div>Error while fetching usage plan</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

type SubProcessProps = {
  savePlan: (plan: IUsagePlan) => Promise<void>;
  value: IUsagePlan;
  team: ITeamSimple;
  tenant: ITenantFull;
};

type EmailOption = { option: 'all' | 'oneOf' };

const SubscriptionProcessEditor = (props: SubProcessProps) => {
  const { translate } = useContext(I18nContext);
  const { openCustomModal, openFormModal, close } = useContext(ModalContext);

  const editProcess = (name: IValidationStepType, index: number) => {
    //todo: use the index !!
    switch (name) {
      case 'email':
        return openFormModal({
          title: translate('subscription.process.add.email.step.title'),
          schema: {
            title: {
              type: type.string,
              label: translate('subscription.process.email.step.title.label'),
              defaultValue: translate('subscription.process.email.step.title.defaultValue'),
              constraints: [
                constraints.required(translate('constraints.required.value')),
              ],
            },
            emails: {
              type: type.string,
              format: format.email,
              label: translate('subscription.process.email.step.emails.label'),
              array: true,
              constraints: [
                constraints.required(translate('constraints.required.value')),
                constraints.email(translate('constraints.matches.email')),
              ],
            },
            option: {
              type: type.string,
              format: format.buttonsSelect,
              options: ['all', 'oneOf'],
              defaultValue: 'oneOf',
              visible: ({ rawValues }) => {
                return rawValues.emails && rawValues.emails.length > 1;
              },
            },
            message: {
              type: type.string,
              label: translate('subscription.process.email.step.message.label'),
              format: format.text,
            },
          },
          onSubmit: (data: IValidationStepEmail & EmailOption) => {
            if (data.option === 'oneOf') {
              const step: IValidationStepEmail = {
                type: 'email',
                emails: data.emails,
                message: data.message,
                id: nanoid(32),
                title: data.title,
              };
              props.savePlan({
                ...props.value,
                subscriptionProcess: insertArrayIndex(
                  { ...step, id: nanoid(32) },
                  props.value.subscriptionProcess,
                  index
                ),
              });
            } else {
              const steps: Array<IValidationStepEmail> = data.emails.map(
                (email) => ({
                  type: 'email',
                  emails: [email],
                  message: data.message,
                  id: nanoid(32),
                  title: data.title,
                })
              );
              const subscriptionProcess = steps.reduce(
                (process, step) => insertArrayIndex(step, process, index),
                props.value.subscriptionProcess
              );
              props.savePlan({ ...props.value, subscriptionProcess });
            }
          },
          options: {
            actions: {
              add: {
                label: translate('subscription.process.email.step.add.label')
              }
            }
          },
          actionLabel: translate('Create'),
        });
      case 'teamAdmin': {
        const step: IValidationStepTeamAdmin = {
          type: 'teamAdmin',
          team: props.team._id,
          id: nanoid(32),
          title: 'Admin',
          schema: {
            motivation: {
              type: type.string,
              format: format.text,
              constraints: [{ type: 'required' }],
            },
          },
          formatter: '[[motivation]]',
        };
        return props
          .savePlan({
            ...props.value,
            subscriptionProcess: [step, ...props.value.subscriptionProcess],
          })
          .then(() => close());
      }
      case 'httpRequest': {
        const step: IValidationStepHttpRequest = {
          type: 'httpRequest',
          id: nanoid(32),
          title: 'Admin',
          url: 'https://changeit.io',
          headers: {},
        };

        return openFormModal({
          title: translate('subscription.process.add.httpRequest.step.title'),
          schema: {
            title: {
              type: type.string,
              defaultValue: 'HttpRequest',
              constraints: [
                constraints.required(translate('constraints.required.value')),
              ],
            },
            url: {
              type: type.string,
              constraints: [
                constraints.required(translate('constraints.required.value')),
                constraints.url(translate('constraints.matches.url')),
              ],
            },
            Headers: {
              type: type.object,
              defaultValue: {},
            },
          },
          value: step,
          onSubmit: (data: IValidationStepHttpRequest) => {
            const subscriptionProcess = insertArrayIndex(
              data,
              props.value.subscriptionProcess,
              index
            );
            props.savePlan({ ...props.value, subscriptionProcess });
          },
          actionLabel: translate('Create'),
        });
      }
    }
  };

  const editMailStep = (value: IValidationStepEmail) => {
    return openFormModal({
      title: translate('subscription.process.update.email.step.title'),
      schema: {
        emails: {
          type: type.string,
          array: true,
        },
        message: {
          type: type.string,
          format: format.text,
        },
      },
      onSubmit: (data: IValidationStepEmail) => {
        props.savePlan({
          ...props.value,
          subscriptionProcess: props.value.subscriptionProcess.map((p) => {
            if (p.id === data.id) {
              return data;
            }
            return p;
          }),
        });
      },
      actionLabel: translate('Update'),
      value,
    });
  };

  const editHttpRequestStep = (value: IValidationStepHttpRequest) => {
    return openFormModal({
      title: translate('subscription.process.update.email.step.title'),
      schema: {
        title: {
          type: type.string,
          constraints: [
            constraints.required(translate('constraints.required.value')),
          ],
        },
        url: {
          type: type.string,
          constraints: [
            constraints.required(translate('constraints.required.value')),
            constraints.url(translate('constraints.matches.url')),
          ],
        },
        Headers: {
          type: type.object,
        },
      },
      onSubmit: (data: IValidationStepHttpRequest) => {
        props.savePlan({
          ...props.value,
          subscriptionProcess: props.value.subscriptionProcess.map((p) => {
            if (p.id === data.id) {
              return data;
            }
            return p;
          }),
        });
      },
      actionLabel: translate('Update'),
      value,
    });
  };

  //todo
  const addProcess = (index: number) => {
    const alreadyStepAdmin = props.value.subscriptionProcess.some(
      isValidationStepTeamAdmin
    );

    const options = addArrayIf(
      !alreadyStepAdmin,
      [
        { value: 'email', label: translate('subscription.process.email') },
        {
          value: 'httpRequest',
          label: translate('subscription.process.httpRequest'),
        },
      ],
      {
        value: 'teamAdmin',
        label: translate('subscription.process.team.admin'),
      }
    );

    openFormModal({
      title: translate('subscription.process.creation.title'),
      schema: {
        type: {
          type: type.string,
          format: format.buttonsSelect,
          label: translate('subscription.process.type.selection'),
          options,
        },
      },
      onSubmit: (data: IValidationStep) => editProcess(data.type, index),
      actionLabel: translate('Create'),
      noClose: true,
    });
  };

  const deleteStep = (deletedStepId: UniqueIdentifier) => {
    const subscriptionProcess = props.value.subscriptionProcess.filter(
      (step) => step.id !== deletedStepId
    );
    props.savePlan({ ...props.value, subscriptionProcess });
  };

  if (!props.value.subscriptionProcess.length) {
    return (
      <div className="d-flex flex-column align-items-center">
        <div> {translate('api.pricings.no.step.explanation')}</div>
        <button
          className="btn btn-outline-primary my-2"
          onClick={() => addProcess(0)}
        >
          {translate('api.pricings.add.first.step.btn.label')}
        </button>
      </div>
    );
  }

  return (
    <div className="d-flex flex-row align-items-center">
      <button
        className="btn btn-outline-primary sortable-list-btn"
        onClick={() => addProcess(0)}
      >
        <Plus />
      </button>
      <SortableList
        items={props.value.subscriptionProcess}
        onChange={(subscriptionProcess) =>
          props.savePlan({ ...props.value, subscriptionProcess })
        }
        className="flex-grow-1"
        renderItem={(item, idx) => {
          if (isValidationStepPayment(item)) {
            return (
              <FixedItem id={item.id}>
                <ValidationStep
                  index={idx + 1}
                  step={item}
                  tenant={props.tenant}
                />
              </FixedItem>
            );
          } else {
            return (
              <>
                <SortableItem
                  className="validation-step-container"
                  action={
                    <div
                      className={classNames('d-flex flex-row', {
                        'justify-content-between':
                          !isValidationStepPayment(item),
                        'justify-content-end': isValidationStepPayment(item),
                      })}
                    >
                      {isValidationStepEmail(item) ? (
                        <button
                          className="btn btn-sm btn-outline-info"
                          onClick={() => editMailStep(item)}
                        >
                          <Settings size={15} />
                        </button>
                      ) : (
                        <></>
                      )}
                      {isValidationStepHttpRequest(item) ? (
                        <button
                          className="btn btn-sm btn-outline-info"
                          onClick={() => editHttpRequestStep(item)}
                        >
                          <Settings size={15} />
                        </button>
                      ) : (
                        <></>
                      )}
                      {isValidationStepTeamAdmin(item) ? (
                        <button
                          className="btn btn-sm btn-outline-info"
                          onClick={() =>
                            openCustomModal({
                              title: translate('motivation.form.modal.title'),
                              content: (
                                <MotivationForm
                                  value={item}
                                  saveMotivation={({ schema, formatter }) => {
                                    const step = { ...item, schema, formatter };
                                    const updatedPlan = {
                                      ...props.value,
                                      subscriptionProcess:
                                        props.value.subscriptionProcess.map(
                                          (s) => (s.id === step.id ? step : s)
                                        ),
                                    };
                                    props.savePlan(updatedPlan);
                                  }}
                                />
                              ),
                            })
                          }
                        >
                          <Settings size={15} />
                        </button>
                      ) : (
                        <></>
                      )}
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => deleteStep(item.id)}
                      >
                        <Trash size={15} />
                      </button>
                    </div>
                  }
                  id={item.id}
                >
                  <ValidationStep
                    index={idx + 1}
                    step={item}
                    tenant={props.tenant}
                  />
                </SortableItem>
                <button
                  className="btn btn-outline-primary sortable-list-btn"
                  onClick={() => addProcess(idx + 1)}
                >
                  <Plus />
                </button>
              </>
            );
          }
        }}
      />
    </div>
  );
};

type MotivationFormProps = {
  saveMotivation: (m: { schema: object; formatter: string }) => void;
  value: IValidationStepTeamAdmin;
};

const MotivationForm = (props: MotivationFormProps) => {
  const [schema, setSchema] = useState<string | object>(
    props.value.schema || '{}'
  );
  const [realSchema, setRealSchema] = useState<any>(props.value.schema || {});
  const [formatter, setFormatter] = useState(props.value.formatter || '');
  const [value, setValue] = useState<any>({});
  const [example, setExample] = useState('');

  const { translate } = useContext(I18nContext);
  const { close } = useContext(ModalContext);

  const childRef = useRef();
  const codeInputRef = useRef();

  useEffect(() => {
    //@ts-ignore
    if (codeInputRef.current.hasFocus) {
      let maybeFormattedSchema = schema;
      try {
        maybeFormattedSchema =
          typeof schema === 'object' ? schema : JSON.parse(schema);
      } catch (_) {}

      setRealSchema(maybeFormattedSchema || {});
    }
  }, [schema]);

  useEffect(() => {
    const regexp = /\[\[(.+?)\]\]/g;
    const matches = formatter.match(regexp);

    const result = matches?.reduce((acc, match) => {
      const key = match.replace('[[', '').replace(']]', '');
      return acc.replace(match, value[key] || match);
    }, formatter);

    setExample(result || formatter);
  }, [value, formatter]);

  return (
    <>
      <div className="container">
        <div className="row">
          <div className="col-6">
            <h6>{translate('motivation.form.setting.title')}</h6>
            <div className="motivation-form__editor mb-1">
              <label>{translate('motivation.form.schema.label')}</label>
              <Help message={translate('motivation.form.schema.help')} />
              <CodeInput
                mode="javascript"
                onChange={(e) => {
                  setSchema(e);
                }}
                value={
                  typeof schema === 'object'
                    ? JSON.stringify(schema, null, 2)
                    : schema
                }
                setRef={(ref) => (codeInputRef.current = ref)}
              />
            </div>
            <div className="motivation-form__editor mb-1">
              <label>{translate('motivation.form.formatter.label')}</label>
              <Help message={translate('motivation.form.formatter.help')} />
              <CodeInput
                mode="markdown"
                onChange={(e) => {
                  setFormatter(e);
                }}
                value={formatter}
              />
            </div>
          </div>
          <div className="col-6 d-flex flex-column">
            <div className="flex-1">
              {/* @ts-ignore */}
              <WrapperError ref={childRef}>
                <h6>{translate('motivation.form.preview.title')}</h6>
                <i>{translate('motivation.form.sample.help')}</i>
                <Form
                  schema={realSchema}
                  onSubmit={setValue}
                  options={{
                    actions: {
                      submit: {
                        label: translate('motivation.form.sample.button.label'),
                      },
                    },
                  }}
                />
              </WrapperError>
            </div>
            <div className="flex-1">
              <div>{translate('motivation.form.sample.title')}</div>
              <div>{example}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button
          className="btn btn-outline-success"
          onClick={() => {
            props.saveMotivation({ schema: realSchema, formatter });
            close();
          }}
        >
          {translate('Save')}
        </button>
      </div>
    </>
  );
};

type ValidationStepProps = {
  step: IValidationStep;
  tenant: ITenantFull;
  update?: () => void;
  index: number;
};

const ValidationStep = (props: ValidationStepProps) => {
  const step = props.step;
  if (isValidationStepPayment(step)) {
    const thirdPartyPaymentSettings =
      props.tenant.thirdPartyPaymentSettings.find(
        (setting) => setting._id == step.thirdPartyPaymentSettingsId
      );
    return (
      <div className="d-flex flex-column validation-step">
        <span className="validation-step__index">
          {String(props.index).padStart(2, '0')}
        </span>
        <span className="validation-step__name">{step.title}</span>
        <span className="validation-step__type">
          <CreditCard />
        </span>
        <div className="d-flex flex-row validation-step__infos">
          <span>{thirdPartyPaymentSettings?.name}</span>
          <span>{thirdPartyPaymentSettings?.type}</span>
        </div>
      </div>
    );
  } else if (isValidationStepEmail(step)) {
    return (
      <div className="d-flex flex-column validation-step">
        <span className="validation-step__index">
          {String(props.index).padStart(2, '0')}
        </span>
        <span className="validation-step__name">{step.title}</span>
        <span className="validation-step__type">
          <AtSign />
        </span>
        <div className="d-flex flex-row validation-step__infos">
          <span>{step.emails[0]}</span>
          {step.emails.length > 1 && (
            <span>{` + ${step.emails.length - 1}`}</span>
          )}
        </div>
      </div>
    );
  } else if (isValidationStepTeamAdmin(step)) {
    return (
      <div className="d-flex flex-column validation-step">
        <span className="validation-step__index">
          {String(props.index).padStart(2, '0')}
        </span>
        <span className="validation-step__name">{step.title}</span>
        <span className="validation-step__type">
          <User />
        </span>
      </div>
    );
  } else if (isValidationStepHttpRequest(step)) {
    return (
      <div className="d-flex flex-column validation-step">
        <span className="validation-step__index">
          {String(props.index).padStart(2, '0')}
        </span>
        <span className="validation-step__name">{step.title}</span>
        <span className="validation-step__type">
          <Globe />
        </span>
      </div>
    );
  } else {
    return <></>;
  }
};

type TeamApiPricingDocumentationProps = {
  planForEdition: IUsagePlan;
  team: ITeamSimple;
  api: IApi;
  reloadState: () => Promise<void>;
  onSave: (d: IDocumentation) => Promise<void>;
  plans: Array<IUsagePlan>;
};
const TeamApiPricingDocumentation = (
  props: TeamApiPricingDocumentationProps
) => {
  const { openApiDocumentationSelectModal } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);

  const createPlanDoc = () => {
    Services.fetchNewApiDoc().then(props.onSave);
  };

  if (!props.planForEdition.documentation) {
    return (
      <div>
        <div className="alert alert-warning" role="alert">
          {translate('documentation.not.setted.message')}
        </div>
        <button
          type="button"
          className="btn btn-outline-info"
          onClick={createPlanDoc}
        >
          {translate('documentation.add.button.label')}
        </button>
      </div>
    );
  } else {
    return (
      <TeamApiDocumentation
        documentation={props.planForEdition.documentation}
        team={props.team}
        api={props.api}
        creationInProgress={true}
        reloadState={props.reloadState}
        onSave={props.onSave}
        importAuthorized={props.plans
          .filter((p) => p._id !== props.planForEdition._id)
          .some((p) => p.documentation?.pages.length)}
        importPage={() =>
          openApiDocumentationSelectModal({
            api: props.api,
            teamId: props.team._id,
            onClose: () => {
              toast.success(translate('doc.page.import.successfull'));
              props.reloadState();
            },
            getDocumentationPages: () =>
              Services.getAllPlansDocumentation(
                props.team._id,
                props.api._humanReadableId,
                props.api.currentVersion
              ),
            importPages: (pages, linked) =>
              Services.importPlanPages(
                props.team._id,
                props.api._id,
                pages,
                props.api.currentVersion,
                props.planForEdition._id,
                linked
              ),
          })
        }
      />
    );
  }
};

export default class WrapperError extends React.Component {
  state = {
    error: undefined,
  };

  componentDidCatch(error) {
    this.setState({ error });
  }

  reset() {
    this.setState({ error: undefined });
  }

  render() {
    if (this.state.error) return <div>Something wrong happened</div>; //@ts-ignore
    return this.props.children;
  }
}
