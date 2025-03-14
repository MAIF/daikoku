import { yupResolver } from '@hookform/resolvers/yup';
import { constraints, Flow, Form, format, Schema, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import cloneDeep from 'lodash/cloneDeep';
import difference from 'lodash/difference';
import find from 'lodash/find';
import { nanoid } from 'nanoid';
import { useContext, useEffect, useMemo, useState } from 'react';
import MinusCircle from 'react-feather/dist/icons/minus-circle';
import More from 'react-feather/dist/icons/more-vertical';
import PlusCircle from 'react-feather/dist/icons/plus-circle';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Link, useMatch, useNavigate, useParams } from 'react-router-dom';
import Select, { components } from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { toast } from 'sonner';
import * as yup from 'yup';

import { GraphQLClient } from 'graphql-request';
import React from 'react';
import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { currencies } from '../../../services/currencies';
import {
  IApi,
  IBaseUsagePlan,
  IOtoroshiSettings,
  isError,
  ISubscription,
  ISubscriptionDemand,
  isValidationStepTeamAdmin,
  ITeamSimple,
  ITenantFull,
  IThirdPartyPaymentSettings,
  IUsagePlan
} from '../../../types';
import { Help } from '../../backoffice';
import {
  access,
  api as API,
  apikey,
  Can,
  isPublish,
  isSubscriptionProcessIsAutomatic,
  manage,
  Option,
  renderPlanInfo,
  renderPricing,
  Spinner
} from '../../utils';
import { Collapse } from '../../utils/FormWithChoice';
import { ApiDocumentation } from './ApiDocumentation';
import { ApiRedoc } from './ApiRedoc';
import { ApiSwagger } from './ApiSwagger';

type OtoroshiEntitiesSelectorProps = {
  rawValues: any
  onChange: (item: any) => void,
  translate: (x: string) => string
  ownerTeam: ITeamSimple
}
export const OtoroshiEntitiesSelector = ({ rawValues, onChange, translate, ownerTeam }: OtoroshiEntitiesSelectorProps) => {
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
          ownerTeam._id,
          rawValues.otoroshiTarget.otoroshiSettings
        ),
        Services.getOtoroshiServicesAsTeamAdmin(
          ownerTeam._id,
          rawValues.otoroshiTarget.otoroshiSettings
        ),
        Services.getOtoroshiRoutesAsTeamAdmin(
          ownerTeam._id,
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

type InternalState = { [x: string]: { key: string, value: any } };

export const ObjectInput = (props: {
  value?: object,
  onChange?: (value: InternalState) => void,
  defaultKeyValue?: { key: string, value: string },
  className: string,
  disabled?: boolean,
  placeholderKey?: string,
  placeholderValue?: string
}) => {
  const [internalState, setInternalState] = useState<InternalState>({})

  useEffect(() => {
    setInternalState(Object.fromEntries(
      Object.entries(props.value || {})
        .map(([key, value], idx) => [Date.now() + idx, { key, value }])
    ))
  }, [])

  useEffect(() => {
    if (props.value) {
      const newState = props.value || {}

      const previousState = Object.entries(internalState || {})
        .reduce((acc, [_, item]) => {
          if (item.key)
            return ({ ...acc, [item.key]: item.value })
          return acc
        }, {})

      if (newState !== previousState)
        setInternalState(Object.fromEntries(
          Object.entries(props.value || {})
            .map(([key, value], idx) => [Date.now() + idx, { key, value }])
        ))
    }
  }, [props.value])

  const onChange = (state: InternalState) => {
    props?.onChange?.(Object.values(state).reduce((acc, c) => ({
      ...acc,
      [c.key]: c.value
    }), {}))
  }

  const changeValue = (id: string, newValue: string) => {
    const newState = {
      ...internalState,
      [id]: { key: internalState[id].key, value: newValue }
    }
    setInternalState(newState)
    onChange(newState)
  };

  const changeKey = (id: string, newValue: string) => {
    const newState = {
      ...internalState,
      [id]: { key: newValue, value: internalState[id].value }
    }
    setInternalState(newState)
    onChange(newState)
  };

  const addFirst = () => {
    if (!internalState || Object.keys(internalState).length === 0) {
      const newState = {
        ...internalState,
        [Date.now()]: props.defaultKeyValue || { key: '', value: '' }
      }
      setInternalState(newState)
      onChange(newState)
    }
  };

  const addNext = () => {
    const newItem = props.defaultKeyValue || { key: '', value: '' };
    const newState = {
      ...internalState,
      [Date.now()]: newItem
    }
    setInternalState(newState);
    onChange(newState)
  };

  const remove = (removedId: string) => {
    const newState = Object.fromEntries(Object.entries(internalState).filter(([id, _]) => id !== removedId))
    setInternalState(newState)
    onChange(newState)
  };

  return (
    <div className={props.className}>
      {Object.keys(internalState || {}).length === 0 && (
        <button
          disabled={props.disabled}
          type="button"
          className='mrf-flex mrf-btn mrf-btn_blue mrf-btn_sm'
          onClick={addFirst}>
          <PlusCircle />
        </button>
      )}
      {Object.entries(internalState || {}).map(([id, { key, value }], idx) => (
        <div className='mrf-flex mrf-mt_5' key={idx}>
          <input
            disabled={props.disabled}
            type="text"
            className='mrf-w_50 mrf-input'
            placeholder={props.placeholderKey}
            value={key}
            onChange={e => changeKey(id, e.target.value)}
          />
          <input
            disabled={props.disabled}
            type="text"
            className='mrf-w_50 mrf-input'
            placeholder={props.placeholderValue}
            value={value}
            onChange={e => changeValue(id, e.target.value)}
          />
          <button
            disabled={props.disabled}
            type="button"
            className='mrf-flex mrf-ai_center mrf-btn mrf-btn_red mrf-btn_sm mrf-ml_10'
            onClick={() => remove(id)}>
            <MinusCircle />
          </button>
          {idx === Object.keys(internalState).length - 1 && (
            <button
              disabled={props.disabled}
              type="button"
              className='mrf-flex mrf-ai_center mrf-btn mrf-btn_blue mrf-btn_sm mrf-ml_5'
              onClick={addNext}>
              <PlusCircle />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export const CustomMetadataInput = (props: {
  value?: Array<{ key: string; possibleValues: Array<string> }>;
  onChange: (param: any) => void;
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

export const currency = (plan?: IBaseUsagePlan) => {
  if (!plan) {
    return undefined;
  }
  const cur = find(currencies, (c) => c.code === plan.currency?.code);
  return `${cur?.name}(${cur?.symbol})`;
};

type ApiPricingCardProps = {
  plan: IUsagePlan;
  api: IApi;
  askForApikeys: (x: {
    team: string;
    plan: IUsagePlan;
    apiKey?: ISubscription;
    motivation?: object;
  }) => Promise<void>;
  myTeams: Array<ITeamSimple>;
  ownerTeam: ITeamSimple;
  subscriptions: Array<ISubscription>;
  inProgressDemands: Array<ISubscriptionDemand>;
  updatePlan: (p: IUsagePlan) => void
  plans: Array<IUsagePlan>
};

type MemoizedFormProps = {
  plan: IUsagePlan
  schema: Schema
  flow: Flow
  onSubmit: (plan: IUsagePlan) => void
}

// const MemoizedForm = memo((props: MemoizedFormProps) => {
//   return (
//     <Form
//       schema={props.schema}
//       flow={props.flow}
//       onSubmit={props.onSubmit}
//       value={props.plan}
//       options={{
//         autosubmit: true,
//         actions: {
//           submit: {
//             display: false
//           }
//         }
//       }}
//     />
//   )
// }, (newPlan, oldPlan) => cleanHash(oldPlan) === cleanHash(newPlan))

const ApiPricingCard = (props: ApiPricingCardProps) => {
  const { Translation } = useContext(I18nContext);
  const {
    openFormModal,
    openLoginOrRegisterModal,
    openApiKeySelectModal,
    openCustomModal,
    confirm,
    close,
    closeRightPanel
  } = useContext(ModalContext);
  const { connectedUser, tenant } = useContext(GlobalContext);
  const queryClient = useQueryClient();

  const graphqlEndpoint = `${window.location.origin}/api/search`;
  const customGraphQLClient = new GraphQLClient(graphqlEndpoint);

  const showApiKeySelectModal = (team: string) => {
    const { plan } = props;

    const askForApikeys = (
      team: string,
      plan: IUsagePlan,
      apiKey?: ISubscription
    ) => {
      const adminStep = plan.subscriptionProcess.find((s) =>
        isValidationStepTeamAdmin(s)
      );
      if (adminStep && isValidationStepTeamAdmin(adminStep)) {
        openFormModal<any>({
          title: translate('motivations.modal.title'),
          schema: adminStep.schema,
          onSubmit: (motivation: object) =>
            props.askForApikeys({ team, plan, apiKey, motivation }),
          actionLabel: translate('Send'),
          value: apiKey?.customMetadata,
        });
      } else {
        props.askForApikeys({ team, plan: plan, apiKey }).then(() => close());
      }
    };

    type IUsagePlanGQL = {
      _id: string;
      otoroshiTarget: {
        otoroshiSettings: string;
      };
      aggregationApiKeysSecurity: boolean;
    };
    type IApiGQL = {
      _id: string;
      _humanReadableId: string;
      currentVersion: string;
      name: string;
      possibleUsagePlans: IUsagePlanGQL[];
    };

    Services.getAllTeamSubscriptions(team)
      .then((subscriptions) =>
        customGraphQLClient.request<{ apis: Array<IApiGQL> }>(Services.graphql.apisByIdsWithPlans,
          { ids: [...new Set(subscriptions.map((s) => s.api))] },
        )
          .then(({ apis }) => ({ apis, subscriptions }))
      )
      .then(
        ({
          apis,
          subscriptions,
        }) => {
          const int = subscriptions.map((subscription) => {
            const api = apis.find((a) => a._id === subscription.api);
            const plan = Option(api?.possibleUsagePlans)
              .flatMap((plans) =>
                Option(plans.find((plan) => plan._id === subscription.plan))
              )
              .getOrNull();
            return { subscription, api, plan };
          });

          const filteredApiKeys = int
            .filter(
              (infos) =>
                infos.plan?.otoroshiTarget?.otoroshiSettings === plan?.otoroshiTarget?.otoroshiSettings &&
                (infos.plan?.aggregationApiKeysSecurity)
            )
            .filter(s => !tenant.environmentAggregationApiKeysSecurity || s.subscription.planName === plan.customName)
            .map((infos) => infos.subscription);

          if (
            !tenant.aggregationApiKeysSecurity || !plan.aggregationApiKeysSecurity ||
            filteredApiKeys.length <= 0
          ) {
            askForApikeys(team, plan);
          } else {
            openApiKeySelectModal({
              plan,
              apiKeys: filteredApiKeys,
              onSubscribe: () => askForApikeys(team, plan),
              extendApiKey: (apiKey: ISubscription) =>
                askForApikeys(team, plan, apiKey),
            });
          }
        }
      );
  };

  const plan = props.plan;
  const customDescription = plan.customDescription;
  const isAutomaticProcess = isSubscriptionProcessIsAutomatic(plan);

  const authorizedTeams = props.myTeams
    .filter((t) => !tenant.subscriptionSecurity || t.type !== 'Personal')
    .filter(
      (t) =>
        props.api.visibility === 'Public' ||
        props.api.authorizedTeams.includes(t._id) ||
        t._id === props.ownerTeam._id
    );

  const allPossibleTeams = difference(
    authorizedTeams.map((t) => t._id),
    props.subscriptions
      .filter((_) => !plan.allowMultipleKeys)
      .filter((f) => !f._deleted)
      .map((s) => s.team)
  );

  const isAccepted = !allPossibleTeams.length;

  const { translate } = useContext(I18nContext);

  let pricing = renderPricing(plan, translate);

  const otoroshiTargetIsDefined =
    !!plan.otoroshiTarget && plan.otoroshiTarget.authorizedEntities;
  const otoroshiEntitiesIsDefined =
    otoroshiTargetIsDefined &&
    (!!plan.otoroshiTarget?.authorizedEntities?.groups.length ||
      !!plan.otoroshiTarget?.authorizedEntities?.routes.length ||
      !!plan.otoroshiTarget?.authorizedEntities?.services.length);

  const openTeamSelectorModal = () => {
    openCustomModal({
      title: translate('team.selection.title'),
      content: <TeamSelector
        teams={authorizedTeams
          .filter((t) => t.type !== 'Admin' || props.api.visibility === 'AdminOnly')
          .filter((team) => plan.visibility === 'Public' || team._id === props.ownerTeam._id)
          .filter((t) => !tenant.subscriptionSecurity || t.type !== 'Personal')}
        pendingTeams={props.inProgressDemands.map((s) => s.team)}
        acceptedTeams={props.subscriptions
          .filter((f) => !f._deleted)
          .map((subs) => subs.team)}
        allowMultipleDemand={plan.allowMultipleKeys}
        showApiKeySelectModal={showApiKeySelectModal}
        plan={props.plan}
      />
    })
  }

  const editPlan = () => props.updatePlan(props.plan)

  const deleteWithConfirm = () => {
    const displayType = tenant.display === 'environment' ? 'environment' : 'plan'
    openFormModal({
      title: translate('Confirm'),
      description: <div className="alert alert-danger" role="alert">
        <h4 className="alert-heading">{translate('Warning')}</h4>
        <p>{translate(`delete.${displayType}.confirm.modal.description.1`)}</p>
        <ul>
          <li>{translate(`delete.${displayType}.confirm.modal.description.2`)}</li>
        </ul>
      </div>,
      schema: {
        confirm: {
          type: type.string,
          label: translate({ key: 'delete.item.confirm.modal.confirm.label', replacements: [plan.customName] }),
          constraints: [
            constraints.oneOf(
              [plan.customName],
              translate({ key: 'constraints.type.api.name', replacements: [plan.customName] })
            ),
          ],
        },
      },
      onSubmit: () => Services.deletePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, props.plan)
        .then(() => queryClient.invalidateQueries({ queryKey: ["plans"] }))
        .then(() => toast.success(translate({ key: `delete.${displayType}.successful.toast.label`, replacements: [plan.customName] })))
        .then(() => closeRightPanel()),
      actionLabel: translate('Confirm')
    })
  };

  const duplicatePlan = () => {
    const clone: IUsagePlan = {
      ...cloneDeep(plan),
      _id: nanoid(32),
      customName: `${plan.customName} (copy)`,
      paymentSettings: undefined,
    };

    props.updatePlan(clone)

  };

  return (
    <div
      className="col-md-4 card mb-4 shadow-sm usage-plan__card"
      data-usage-plan={plan.customName}
    >
      <div
        className="card-img-top card-link card-header"
        data-holder-rendered="true"
      >
        <Can I={manage} a={API} team={props.ownerTeam}>
          <div
            className="dropdown"
            style={{
              position: 'absolute',
              top: '0px',
              right: '15px',
              zIndex: '100',
            }}
          >
            <More
              className="cursor-pointer dropdown-menu-button"
              style={{ fontSize: '20px' }}
              data-bs-toggle="dropdown"
              aria-expanded="false"
              id={`${plan._id}-dropdownMenuButton`}
            />
            <div className="dropdown-menu" aria-labelledby={`${plan._id}-dropdownMenuButton`}>
              <span className="dropdown-item cursor-pointer" onClick={editPlan}>
                {tenant.display === 'environment'
                  ? translate('pricing.edit.env.btn.label')
                  : translate('Edit plan')}
              </span>
              {props.api.visibility !== 'AdminOnly' && <>
                <span
                  className="dropdown-item cursor-pointer"
                  onClick={duplicatePlan}
                >
                  {tenant.display === 'environment'
                    ? translate('pricing.clone.env.btn.label')
                    : translate('Duplicate plan')}
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
              </>}
            </div>
          </div>
        </Can>
        <span className='overflow-hidden'>{plan.customName}</span>
      </div>
      <div className="card-body plan-body d-flex flex-column">
        <div className="d-flex flex-row">
          <p className="card-text text-justify flex-grow-1">
            {customDescription && <span>{customDescription}</span>}
            {!customDescription && renderPlanInfo(plan)}
          </p>
          {tenant.display === 'environment' && (
            <div className="flex-shrink-1 d-flex flex-column">
              <Link
                to={`./${props.plan.customName}/swagger`}
                relative="path"
                className={classNames('btn btn-sm btn-outline-primary mb-1', {
                  link__disabled:
                    !props.plan.swagger?.url && !props.plan.swagger?.content,
                })}
              >
                swagger
              </Link>
              <Link
                to={`./${props.plan.customName}/testing`}
                relative="path"
                className={classNames('btn btn-sm btn-outline-primary mb-1', {
                  link__disabled: !props.plan.testing?.enabled,
                })}
              >
                test
              </Link>
              <Link
                to={`./${props.plan.customName}/documentation`}
                relative="path"
                className={classNames('btn btn-sm btn-outline-primary', {
                  link__disabled: !props.plan.documentation?.pages.length,
                })}
              >
                Documentation
              </Link>
            </div>
          )}
        </div>
        <div className="d-flex flex-column mb-2">
          <span className="plan-quotas">
            {!plan.maxPerMonth && translate('plan.limits.unlimited')}
            {!!plan.maxPerMonth && (
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
        <div className="d-flex justify-content-between align-items-center flex-wrap">
          {!otoroshiTargetIsDefined && props.api.visibility !== 'AdminOnly' && (
            <span className="badge bg-danger m-1">
              {translate('otoroshi.missing.target')}
            </span>
          )}
          {!otoroshiEntitiesIsDefined &&
            props.api.visibility !== 'AdminOnly' && (
              <span className="badge bg-danger m-1">
                {translate('otoroshi.missing.entities')}
              </span>
            )}
          {!isPublish(props.api) && props.api.visibility !== 'AdminOnly' && (
            <span className="badge bg-danger m-1">
              {translate('api.not.pusblished')}
            </span>
          )}
          {((otoroshiTargetIsDefined && otoroshiEntitiesIsDefined) ||
            props.api.visibility === 'AdminOnly') &&
            (!isAccepted || props.api.visibility === 'AdminOnly') &&
            isPublish(props.api) && (
              <Can
                I={access}
                a={apikey}
                teams={authorizedTeams.filter(
                  (team) =>
                    plan.visibility === 'Public' ||
                    team._id === props.ownerTeam._id
                )}
              >
                {(props.api.visibility === 'AdminOnly' ||
                  (plan.otoroshiTarget && !isAccepted)) && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary col-12"
                      onClick={openTeamSelectorModal}
                    >
                      <Translation
                        i18nkey={
                          isAutomaticProcess ? 'Get API key' : 'Request API key'
                        }
                      />
                    </button>
                  )}
              </Can>
            )}
          {connectedUser.isGuest && (
            <button
              type="button"
              className="btn btn-sm btn-outline-primary mx-auto mt-3"
              onClick={() => openLoginOrRegisterModal({ tenant })}
            >
              <Translation i18nkey="Get API key" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

type ITeamSelector = {
  teams: Array<ITeamSimple>;
  pendingTeams: Array<string>;
  acceptedTeams: Array<string>;
  allowMultipleDemand?: boolean;
  showApiKeySelectModal: (teamId: string) => void;
  plan: IUsagePlan;
};

const TeamSelector = (props: ITeamSelector) => {
  const { translate } = useContext(I18nContext);
  const { close } = useContext(ModalContext);
  const navigate = useNavigate();

  const displayVerifiedBtn = props.plan.subscriptionProcess.some(
    (p) => p.type === 'payment'
  );

  return (
    <div className="modal-body">
      <div>
        <div className="modal-description">
          {translate('team.selection.desc.request')}
        </div>
        <div className="team-selection__container">
          {props.teams
            .filter(
              (t) =>
                !!props.allowMultipleDemand ||
                !props.acceptedTeams.includes(t._id)
            )
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((team) => {
              const allowed =
                props.allowMultipleDemand ||
                (!props.pendingTeams.includes(team._id) &&
                  !props.acceptedTeams.includes(team._id) &&
                  (!displayVerifiedBtn || team.verified));

              return (
                <div
                  key={team._id}
                  className={classNames('team-selection team-selection__team', {
                    selectable: allowed,
                    'cursor-forbidden': !allowed,
                  })}
                  onClick={() => {
                    return allowed
                      ? props.showApiKeySelectModal(team._id)
                      : () => { };
                  }}
                >
                  {props.pendingTeams.includes(team._id) && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary disabled"
                    >
                      {translate('Request in progress')}
                    </button>
                  )}
                  {displayVerifiedBtn && !team.verified && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => {
                        close();
                        navigate(`/${team._humanReadableId}/settings/edition`);
                      }}
                    >
                      {translate('Email not verified')}
                    </button>
                  )}
                  <span className="ms-2">{team.name}</span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

type ApiPricingProps = {
  api: IApi;
  myTeams: Array<ITeamSimple>;
  ownerTeam: ITeamSimple;
  subscriptions: Array<ISubscription>;
  inProgressDemands: Array<ISubscriptionDemand>;
  askForApikeys: (x: {
    team: string;
    plan: IUsagePlan;
    apiKey?: ISubscription;
    motivation?: object;
  }) => Promise<void>;
};

type UsagePlanFormProps = {
  plan: IUsagePlan,
  creation: boolean,
  ownerTeam: ITeamSimple,
  api: IApi,
  plans: Array<IUsagePlan>
  onSubmit: (plan: IUsagePlan) => void
}

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
]
type PathesArrayProps = {
  name: string,
  control: any,
  label: string
}
function PathesArray(props: PathesArrayProps) {
  const { fields, append, remove } = useFieldArray({
    control: props.control,
    name: props.name,
  });

  return (
    <>
      <h2 className="text-xl font-bold">{props.label}</h2>

      <div className="d-flex flex-column gap-2 align-items-center col-6">
        {fields.map((field, index) => (
          <div key={field.id} className="d-flex gap-2 flex-grow-1">
            <Controller
              name={`${props.name}.${index}.method`}
              control={props.control}
              render={({ field }) => (
                <Select
                  {...field}
                  options={httpMethods.map((method) => ({
                    value: method,
                    label: method,
                  }))}
                  onChange={(selected) => field.onChange(selected?.value)}
                  value={{ value: field.value, label: field.value }}
                  className="w-32"
                />
              )}
            />

            <Controller
              name={`${props.name}.${index}.path`}
              control={props.control}
              render={({ field }) => (
                <input {...field} className="border p-1 rounded flex-grow-1" />
              )}
            />

            <button
              type="button"
              className="bg-red-500 text-white px-2 py-1 rounded"
              onClick={() => remove(index)}
            >
              ❌
            </button>
          </div>
        ))}
        <button
          type="button"
          className="px-4 py-2 rounded"
          onClick={() => append({ method: "GET", path: "" })}
        >
          Ajouter un Path
        </button>
      </div>

    </>
  );
}

export const UsagePlanForm = (props) => {
  const { tenant } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);

  const teamsQuery = useQuery({
    queryKey: ['teams'],
    queryFn: () => Services.teams(props.ownerTeam)
  })

  const otoroshiQuery = useQuery({
    queryKey: ['otoroshis'],
    queryFn: () => Services.allSimpleOtoroshis(
      tenant._id,
      props.ownerTeam
    ).then((r) => (isError(r) ? [] : r))
  })

  // 🎯 Définition du schéma de validation avec Yup
  const schema = yup.object({
    customName: yup.string().required(translate("constraints.required.value")),
    customDescription: yup.string(),
    visibility: yup.string().oneOf(["Public", "Private"], translate("constraints.invalid.choice")).required(),
    authorizedTeams: yup.array().of(yup.string()),

    maxPerSecond: yup.number().nullable().min(1, translate("constraints.positive")),
    maxPerDay: yup.number().nullable().min(1, translate("constraints.positive")),
    maxPerMonth: yup.number().nullable().min(1, translate("constraints.positive")),

    costPerMonth: yup.number().nullable().min(0, translate("constraints.positive")),
    costPerRequest: yup.number().nullable().min(0, translate("constraints.positive")),

    otoroshiTarget: yup.object({
      otoroshiSettings: yup.string(),
      authorizedEntities: yup.array().of(yup.string()).nullable(),
      apikeyCustomization: yup.object({
        clientIdOnly: yup.boolean(),
        readOnly: yup.boolean(),
        constrainedServicesOnly: yup.boolean(),
        metadata: yup.object(),
        customMetadata: yup.array().of(yup.object({ key: yup.string(), possibleValues: yup.array().of(yup.string()) }).required()),
        tags: yup.array().of(yup.string().required()),
        restrictions: yup.object({
          enabled: yup.boolean(),
          allowLast: yup.boolean(),
          allowed: yup.array().of(yup.object({ method: yup.string(), path: yup.string() })),
          forbidden: yup.array().of(yup.object({ method: yup.string(), path: yup.string() })),
          notFound: yup.array().of(yup.object({ method: yup.string(), path: yup.string() }))
        })
      })
    }).nullable(),
  });

  const { control, handleSubmit, watch, setValue, getValues } = useForm({
    defaultValues: props.plan,
    resolver: yupResolver(schema),
  });


  const isPrivatePlan = watch('visibility') === 'Private'
  const otoroshiSettings = watch('otoroshiTarget.otoroshiSettings')
  const restrictions = watch('otoroshiTarget.apikeyCustomization.restrictions')


  const [quotasDisplayed, setQuotasDisplayed] = useState(!!props.plan.maxPerMonth);
  const [billingDisplayed, setBillingDisplayed] = useState(!!props.plan.costPerMonth);

  useEffect(() => {
    if (!quotasDisplayed) {
      setValue("maxPerSecond", null);
      setValue("maxPerDay", null);
      setValue("maxPerMonth", null);
    }
  }, [quotasDisplayed]);

  useEffect(() => {
    if (!billingDisplayed) {
      setValue("costPerMonth", null);
      setValue("costPerRequest", null);
    }
  }, [billingDisplayed]);

  const onSubmit = (data) => {
    console.log("Formulaire soumis", data);
    props.onSubmit(data);
  };

  const teams = teamsQuery.data ? (isError(teamsQuery.data) ? [] : teamsQuery.data) : []
  const otoroshis = otoroshiQuery.data ?? []
  return (
    <form onSubmit={handleSubmit(onSubmit)} onError={console.error} className="usage-plan-form-panel-content">
      <div className="usage-plan-form">

        <Controller
          name="customName"
          control={control}
          render={({ field, fieldState }) => (
            <div>
              <label>{translate('Name')}</label>
              <input {...field} placeholder={translate('Plan name')} className="form-control" />
              {fieldState.error && <p className="error">{fieldState.error.message}</p>}
            </div>
          )}
        />

        <Controller
          name="customDescription"
          control={control}
          render={({ field }) => (
            <div>
              <label>{translate('Description')}</label>
              <textarea {...field} placeholder={translate('Plan description')} className="form-control" />
            </div>
          )}
        />

        <Controller
          name="visibility"
          control={control}
          render={({ field }) => (
            <div>
              <label>{translate('Visibility')}</label>
              <ToggleFormPartButton
                value={field.value === 'Public'}
                action={(value) => {
                  if (value)
                    setValue('authorizedTeams', [])
                  field.onChange(value ? 'Public' : 'Private')
                }}
                falseLabel={"Privé"}
                falseDescription={"seules les équipe authorisé peuvent voir le plan"}
                trueLabel={"Public"}
                trueDescription={"tout l mon peux voir et souscrire"}
              />
            </div>
          )}
        />

        {!!isPrivatePlan && <Controller
          name="authorizedTeams"
          control={control}
          render={({ field }) => (
            <div>
              <label>{translate('Authorized teams')}</label>
              <Help message={translate('usage.plan.form.authorized.teams.help')} />
              <Select
                {...field}
                options={teams.map((team) => ({
                  value: team._id,
                  label: team.name,
                }))}
                isMulti
                closeMenuOnSelect={false}
                onChange={(selectedOptions) => {
                  field.onChange(selectedOptions.map((option) => option.value));
                }}
                value={teams
                  .filter((team) => field.value.includes(team._id))
                  .map((team) => ({ value: team._id, label: team.name }))}
              />
            </div>
          )}
        />}

        <Collapse label={translate('Otoroshi target')} errored={false} collapsed={true}>
          <Controller
            name="otoroshiTarget.otoroshiSettings"
            control={control}
            render={({ field }) => (
              <div>
                <label>{translate('Otoroshi instances')}</label>
                <Select
                  {...field}
                  isDisabled={!props.creation && !!props.plan?.otoroshiTarget?.otoroshiSettings}
                  options={otoroshis.map((o) => ({
                    value: o._id,
                    label: o.url,
                  }))}
                  onChange={(selectedOptions) => {
                    field.onChange(selectedOptions?.value);
                  }}
                  value={
                    Option(otoroshis.find((o) => o._id === field.value))
                      .map(o => ({ value: field.value, label: o.url }))
                      .getOrNull()
                  }
                />
              </div>
            )}
          />
          {!!otoroshiSettings && <Controller
            name='otoroshiTarget.authorizedEntities'
            control={control}
            render={({ field }) => (<>
              <label>{translate('Authorized entities')}</label>
              <Help message={translate('authorized.entities.help')} />
              <OtoroshiEntitiesSelector rawValues={getValues()} onChange={field.onChange} translate={translate} ownerTeam={props.ownerTeam} />
            </>)}
          />}
        </Collapse>

        {!!otoroshiSettings && <Collapse label={translate("usage.plan.form.customization.flow.label")} errored={false} collapsed={true}>

          <Controller
            name="otoroshiTarget.apikeyCustomization.clientIdOnly"
            control={control}
            render={({ field }) => (
              <div>
                <label>{translate('client id only')}</label>
                <ToggleFormPartButton
                  value={field.value}
                  action={field.onChange}
                  trueLabel={"client id only"}
                  trueDescription={"pas besoin de secret"}
                  falseLabel={"client id and client secret"}
                  falseDescription={"il faut le id et le secret"}
                />
              </div>
            )}
          />

          <Controller
            name="otoroshiTarget.apikeyCustomization.readOnly"
            control={control}
            render={({ field }) => (
              <div>
                <label>{translate('clientIdOnly')}</label>
                <ToggleFormPartButton
                  value={field.value}
                  action={field.onChange}
                  trueLabel={"read only"}
                  trueDescription={"just des get"}
                  falseLabel={"read & write"}
                  falseDescription={"RestFull"}
                />
              </div>
            )}
          />
          <Controller
            name="otoroshiTarget.apikeyCustomization.constrainedServicesOnly"
            control={control}
            render={({ field }) => (
              <div>
                <label>{translate('constrainedServicesOnly')}</label>
                <ToggleFormPartButton
                  value={field.value}
                  action={field.onChange}
                  trueLabel={"constrained Services only"}
                  trueDescription={"faut expliquer plus clairement"}
                  falseLabel={"open bar"}
                  falseDescription={"idem"}
                />
              </div>
            )}
          />
          <Controller
            name="otoroshiTarget.apikeyCustomization.metadata"
            control={control}
            render={({ field }) => (
              <div>
                <label>{translate('metadata')}</label>
                <ObjectInput value={field.value} onChange={field.onChange} className='' />
              </div>
            )}
          />
          <Controller
            name="otoroshiTarget.apikeyCustomization.customMetadata"
            control={control}
            render={({ field }) => (
              <div>
                <label>{translate('customMetadata')}</label>
                <CustomMetadataInput value={field.value} onChange={field.onChange} translate={translate} />
              </div>
            )}
          />
          <Controller
            name="otoroshiTarget.apikeyCustomization.tags"
            control={control}
            render={({ field }) => (
              <div>
                <label>{translate('constrainedServicesOnly')}</label>
                <CreatableSelect
                  isMulti
                  onChange={(e) => field.onChange(e.map(({ value }) => value))}
                  options={undefined}
                  value={field.value.map((value: any) => ({
                    label: value,
                    value,
                  }))}
                  className="input-select reactSelect flex-grow-1"
                  classNamePrefix="reactSelect"
                />
              </div>
            )}
          />
          <Controller
            name="otoroshiTarget.apikeyCustomization.restrictions.enabled"
            control={control}
            render={({ field }) => (
              <div>
                <label>{translate('restrictions')}</label>
                <ToggleFormPartButton
                  value={field.value}
                  action={field.onChange}
                  trueLabel={"Enable restriction"}
                  trueDescription={"faut expliquer plus clairement"}
                  falseLabel={"Disable restriction"}
                  falseDescription={"idem"}
                />
              </div>
            )}
          />

          {restrictions.enabled && <>
            <Controller
              name="otoroshiTarget.apikeyCustomization.restrictions.allowLast"
              control={control}
              render={({ field }) => (
                <div>
                  <label>{translate('allowlast')}</label>
                  <ToggleFormPartButton
                    value={field.value}
                    action={field.onChange}
                    trueLabel={"allow Last"}
                    trueDescription={"faut expliquer plus clairement"}
                    falseLabel={"disallow Last"}
                    falseDescription={"idem"}
                  />
                </div>
              )}
            />
            

            <PathesArray label="allowed" name="otoroshiTarget.apikeyCustomization.restrictions.allowed" control={control} />
            <PathesArray label="forbiddden" name="otoroshiTarget.apikeyCustomization.restrictions.forbidden" control={control} />
            <PathesArray label="not found" name="otoroshiTarget.apikeyCustomization.restrictions.notFound" control={control} />

          </>}

        </Collapse>}

        {props.api.visibility !== 'AdminOnly' && <ToggleFormPartButton
          value={quotasDisplayed}
          action={() => setQuotasDisplayed((prev) => !prev)}
          falseLabel={translate("usage.plan.form.quotas.selector.false.label")}
          falseDescription={translate("usage.plan.form.quotas.selector.false.description")}
          trueLabel={translate("usage.plan.form.quotas.selector.true.label")}
          trueDescription={translate("usage.plan.form.quotas.selector.true.description")}
        />}
        {props.api.visibility !== 'AdminOnly' && <ToggleFormPartButton
          value={billingDisplayed}
          action={() => setBillingDisplayed((prev) => !prev)}
          falseLabel={translate("usage.plan.form.pricing.selector.false.label")}
          falseDescription={translate("usage.plan.form.pricing.selector.false.description")}
          trueLabel={translate("usage.plan.form.pricing.selector.true.label")}
          trueDescription={translate("usage.plan.form.pricing.selector.true.description")}
        />}

        {quotasDisplayed && (
          <Collapse label="Quotas" collapsed={false} errored={false}>
            <div className="d-flex gap-2">
              <Controller
                name="maxPerSecond"
                control={control}
                render={({ field }) => (
                  <div className='flex-grow-1'>
                    <label>{translate("usage.plan.form.max.request.second.label")}</label>
                    <input type="number" {...field} className="form-control" />
                  </div>
                )}
              />
              <Controller
                name="maxPerDay"
                control={control}
                render={({ field }) => (
                  <div className='flex-grow-1'>
                    <label>{translate("usage.plan.form.max.request.day.label")}</label>
                    <input type="number" {...field} className="form-control" />
                  </div>
                )}
              />
              <Controller
                name="maxPerMonth"
                control={control}
                render={({ field }) => (
                  <div className='flex-grow-1'>
                    <label>{translate("usage.plan.form.max.request.month.label")}</label>
                    <input type="number" {...field} className="form-control" />
                  </div>
                )}
              />
            </div>
          </Collapse>
        )}

        {billingDisplayed && (
          <Collapse label="Billing" collapsed={false} errored={false}>
            <div className="">
              <div className="accordion-body">
                <Controller
                  name="costPerMonth"
                  control={control}
                  render={({ field }) => (
                    <div>
                      <label>{translate("usage.plan.form.cost.per.period.help")}</label>
                      <input type="number" {...field} className="form-control" />
                    </div>
                  )}
                />
                <Controller
                  name="costPerRequest"
                  control={control}
                  render={({ field }) => (
                    <div>
                      <label>{translate("Cost per request")}</label>
                      <input type="number" {...field} className="form-control" />
                    </div>
                  )}
                />
              </div>
            </div>
          </Collapse>
        )}

        <button type="submit" className="btn btn-outline-success mt-4" onClick={() => console.debug(getValues())}>
          {translate('Save')}
        </button>
      </div>
    </form>
  );
};


const _UsagePlanForm = (props: UsagePlanFormProps) => {
  const { tenant } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  const [plan, setPlan] = useState(props.plan);

  const [quotasDisplayed, setQuotasDisplayed] = useState<boolean>(!!props.plan.maxPerMonth);
  const [billingDisplayed, setBillingDisplayed] = useState<boolean>(!!props.plan.costPerMonth);

  useEffect(() => {
    if (!quotasDisplayed) {
      setPlan((prev) => {
        if (!prev.maxPerSecond) return prev;
        return {
          ...prev,
          maxPerSecond: undefined,
          maxPerDay: undefined,
          maxPerMonth: undefined
        };
      });
    }
  }, [quotasDisplayed]);

  useEffect(() => {
    if (!billingDisplayed) {
      setPlan((prev) => {
        if (!prev.costPerMonth) return prev
        return {
          ...plan,
          costPerMonth: undefined,
          costPerRequest: undefined,
          paymentSettings: undefined,
          currency: undefined,
          trialPeriod: undefined
        }
      })
    }
  }, [billingDisplayed])

  const baseFlow: Flow = [
    "customName",
    "customDescription",
    "visibility",
    "authorizedTeams",
  ]

  const otoroshiFlow: Flow = [
    {
      label: "Otoroshi",
      flow: ["otoroshiTarget"],
      collapsed: true
    }
  ]

  const quotasFlowPart: Flow = [{ label: translate("usage.plan.form.quotas.flow.label"), flow: ["maxPerSecond", "maxPerDay", "maxPerMonth"], collapsed: true }]

  const billingFlow: Flow = [{
    label: translate("usage.plan.form.billing.flow.label"),
    flow: ["paymentSettings", "costPerRequest", "currency", "billingPeriod", "trialPeriod"],
    collapsed: true
  }]
  const customizationFlow: Flow = [{
    label: translate("usage.plan.form.customization.flow.label"),
    flow: ["autoRotation", "allowMultipleKeys", "otoroshiTarget.apikeyCustomization", "integrationProcess"],
    collapsed: true
  }]

  const computedFlow = useMemo(() => {
    return [...baseFlow, ...otoroshiFlow, ...customizationFlow,
    ...(quotasDisplayed ? quotasFlowPart : []),
    ...(billingDisplayed ? billingFlow : [])];
  }, [quotasDisplayed, billingDisplayed]);

  const queryFullTenant = useQuery({
    queryKey: ['full-tenant'],
    queryFn: () => Services.oneTenant(tenant._id),
  });


  const customNameSchemaPart = (plan: IUsagePlan, plans: Array<IUsagePlan>, api: IApi) => {
    if (tenant.display === 'environment' && api.visibility !== 'AdminOnly') {
      const availablePlans = tenant.environments.filter((e) =>
        plans
          .filter((p) => p._id !== plan?._id)
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

  const baseSchema: Schema = {
    ...customNameSchemaPart(props.plan, props.plans, props.api),

    customDescription: {
      type: type.string,
      label: translate('Description'),
      placeholder: translate('usage.plan.form.description.help'),
      format: format.textarea,
    },
    visibility: {
      type: type.string,
      label: translate('Visibility'),
      format: format.buttonsSelect,
      options: [
        { label: 'Public', value: 'Public' },
        { label: 'Private', value: 'Private' },
      ],
    },
    authorizedTeams: {
      type: type.string,
      format: format.select,
      isMulti: true,
      defaultValue: [],
      visible: ({ rawValues }) => rawValues['visibility'] !== 'Public',
      label: translate('Authorized teams'),
      help: translate('usage.plan.form.authorized.teams.help'),
      optionsFrom: '/api/me/teams',
      transformer: (t: any) => ({
        label: t.name,
        value: t._id,
      }),
    },
  };

  const otoroshiSchema: Schema = {
    otoroshiTarget: {
      type: type.object,
      format: format.form,
      label: translate('Otoroshi target'),
      schema: {
        otoroshiSettings: {
          type: type.string,
          format: format.select,
          disabled: !props.creation && !!props.plan?.otoroshiTarget?.otoroshiSettings,
          label: translate('Otoroshi instances'),
          optionsFrom: Services.allSimpleOtoroshis(
            tenant._id,
            props.ownerTeam
          )
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
          render: (p) =>
            OtoroshiEntitiesSelector({ rawValues: p.rawValues!, onChange: p.onChange!, translate, ownerTeam: props.ownerTeam }),
          label: translate('Authorized entities'),
          placeholder: translate('Authorized.entities.placeholder'),
          help: translate('authorized.entities.help'),
        },
      },
    },
    aggregationApiKeysSecurity: {
      type: type.bool,
      format: format.buttonsSelect,
      visible: !!tenant.aggregationApiKeysSecurity,
      label: translate('aggregation api keys security'),
      help: translate('aggregation_apikeys.security.help'),
      onChange: ({ value, setValue }: any) => {
        if (value)
          confirm({
            message: translate('aggregation.api_key.security.notification'),
          }).then((ok) => {
            if (ok) {
              setValue('otoroshiTarget.apikeyCustomizationapikeyCustomization.readOnly', false);
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
  }

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
  const customizationSchema: Schema = {
    autoRotation: {
      type: type.bool,
      format: format.buttonsSelect,
      label: translate('Force apikey auto-rotation'),
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
    "otoroshiTarget.apikeyCustomization": {
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
                rawValues?.otoroshiTarget?.apikeyCustomization
                  ?.restrictions?.enabled,
              deps: [
                'otoroshiTarget.apikeyCustomization.restrictions.enabled',
              ],
              label: translate('Allow at last'),
              help: translate('allow.least.help'),
            },
            allowed: {
              label: translate('Allowed pathes'),
              visible: ({ rawValues }) =>
                rawValues?.otoroshiTarget?.apikeyCustomization
                  ?.restrictions?.enabled,
              deps: [
                'otoroshiTarget.apikeyCustomization.restrictions.enabled',
              ],
              ...pathes,
            },
            forbidden: {
              label: translate('Forbidden pathes'),
              visible: ({ rawValues }) =>
                rawValues?.otoroshiTarget?.apikeyCustomization
                  ?.restrictions?.enabled,
              deps: [
                'otoroshiTarget.apikeyCustomization.restrictions.enabled',
              ],
              ...pathes,
            },
            notFound: {
              label: translate('Not found pathes'),
              visible: ({ rawValues }) =>
                rawValues?.otoroshiTarget?.apikeyCustomization
                  ?.restrictions?.enabled,
              deps: [
                'otoroshiTarget.apikeyCustomization.restrictions.enabled',
              ],
              ...pathes,
            },
          },
        },
      },
    },
  }

  const quotasSchema: Schema = {
    maxPerSecond: {
      type: type.number,
      label: translate('usage.plan.form.max.request.second.label'),
      help: translate('usage.plan.form.max.request.second.help'),
      placeholder: translate('usage.plan.form.max.request.placeholder'),
      constraints: [constraints.min(1, translate('constraints.positive')), constraints.integer(translate('constraints.integer'))],
      onChange: ({ value, setValue }) => setValue("maxPerSecond", Number(value) || null),
      defaultValue: 10
    },
    maxPerDay: {
      type: type.number,
      label: translate('usage.plan.form.max.request.day.label'),
      help: translate('usage.plan.form.max.request.day.help'),
      placeholder: translate('usage.plan.form.max.request.placeholder'),
      constraints: [constraints.min(1, translate('constraints.positive')), constraints.integer(translate('constraints.integer'))],
      onChange: ({ value, setValue }) => setValue("maxPerDay", Number(value) || null),
      defaultValue: 10
    },
    maxPerMonth: {
      type: type.number,
      label: translate('usage.plan.form.max.request.month.label'),
      help: translate('usage.plan.form.max.request.month.help'),
      placeholder: translate('usage.plan.form.max.request.placeholder'),
      constraints: [constraints.min(1, translate('constraints.positive')), constraints.integer(translate('constraints.integer'))],
      onChange: ({ value, setValue }) => setValue("maxPerMonth", Number(value) || null),
      defaultValue: 10
    },
  }

  const billingSchema = {
    paymentSettings: {
      type: type.object,
      format: format.form,
      label: translate('usage.plan.form.payment.settings.label'),
      schema: {
        thirdPartyPaymentSettingsId: {
          type: type.string,
          format: format.select,
          label: translate('usage.plan.form.payment.settings.id.label'),
          help: translate('usage.plan.form.third.party.payment.help'),
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
      help: translate("usage.plan.form.cost.per.period.help"),
      placeholder: translate('Cost per billing period'),
      constraints: [constraints.positive(translate('constraints.positive'))],
    },
    costPerRequest: {
      type: type.number,
      label: translate('Cost per req.'),
      placeholder: translate('Cost per request'),
      help: translate('usage.plan.form.cost.per.request.help'),
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
    billingPeriod: {
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
      help: translate('usage.plan.form.trial.period.help'),
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

  const mergedSchema = useMemo(() => ({
    ...baseSchema,
    ...otoroshiSchema,
    ...customizationSchema,
    ...quotasSchema,
    ...billingSchema
  }), []);

  // const MemoizedForm = React.memo(Form);

  return (
    <div className='usage-plan-form-panel-content'>
      <div className="usage-plan-form">

        <Form
          schema={mergedSchema}
          flow={computedFlow} //@ts-ignore
          onSubmit={setPlan}
          value={plan}
        />

        {/* <MemoizedForm
          schema={baseSchema}
          flow={baseFlow}
          onSubmit={setPlan}
          plan={plan}
        />
        <MemoizedForm
          schema={otoroshiSchema}
          flow={otoroshiFlow}
          onSubmit={setPlan}
          plan={plan}
        />
        <MemoizedForm
          schema={customizationSchema}
          flow={customizationFlow}
          onSubmit={setPlan}
          plan={plan}
        /> */}
        {props.api.visibility !== 'AdminOnly' && <ToggleFormPartButton
          value={quotasDisplayed}
          action={setQuotasDisplayed}
          falseLabel={translate("usage.plan.form.quotas.selector.false.label")}
          falseDescription={translate("usage.plan.form.quotas.selector.false.description")}
          trueLabel={translate("usage.plan.form.quotas.selector.true.label")}
          trueDescription={translate("usage.plan.form.quotas.selector.true.description")}
        />}
        {props.api.visibility !== 'AdminOnly' && <ToggleFormPartButton
          value={billingDisplayed}
          action={setBillingDisplayed}
          falseLabel={translate("usage.plan.form.pricing.selector.false.label")}
          falseDescription={translate("usage.plan.form.pricing.selector.false.description")}
          trueLabel={translate("usage.plan.form.pricing.selector.true.label")}
          trueDescription={translate("usage.plan.form.pricing.selector.true.description")}
        />}
        {/* {quotasDisplayed && props.api.visibility !== 'AdminOnly' &&
          <MemoizedForm
            schema={quotasSchema}
            flow={quotasFlowPart}
            onSubmit={setPlan}
            plan={plan}
          />}
        {billingDisplayed && props.api.visibility !== 'AdminOnly' && <MemoizedForm
          schema={billingSchema}
          flow={billingFlow}
          onSubmit={setPlan}
          plan={plan}
        />} */}
      </div>
      {/* <div className="usage-plan-form--actions">
        <button className='btn btn-outline-success' onClick={() => {
          props.onSubmit(plan)
        }}>{translate('Save')}</button>
      </div> */}
    </div>
  )
}

type ToggleButtonProps = {
  action: (value: boolean) => void
  value: boolean
  trueLabel: string
  trueDescription: string
  falseLabel: string
  falseDescription: string

}

const ToggleFormPartButton = (props: ToggleButtonProps) => {
  return (
    <div className='form-selector mt-4'>
      <button type='button' className={classNames('btn btn-outline-info col-6', { active: props.value })} onClick={() => props.action(true)}>
        <div className='label'>{props.trueLabel}</div>
        <div className='description'>{props.trueDescription}</div>
      </button>
      <button type='button' className={classNames('btn btn-outline-info col-6', { active: !props.value })} onClick={() => props.action(false)}>
        <div className='label'>{props.falseLabel}</div>
        <div className='description'>{props.falseDescription}</div>
      </button>
    </div>
  )
}

export const ApiPricing = (props: ApiPricingProps) => {

  const { openRightPanel, closeRightPanel, openCustomModal, close, openApiSelectModal } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);

  const queryClient = useQueryClient();
  const usagePlansQuery = useQuery({
    queryKey: ['plans', props.api.currentVersion],
    queryFn: () =>
      Services.getVisiblePlans(props.api._id, props.api.currentVersion),
  });

  const match = useMatch('/:team/:api/:version/pricing/:env/:tab');

  const maybeTab = match?.params.tab;
  const maybeEnv = match?.params.env;

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['plans'] });
  }, [props.api]);

  const savePlan = (plan: IUsagePlan, creation: boolean = false) => {
    if (creation) {
      return (
        Services.createPlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, plan)
          .then(() => toast.success(translate({ key: 'create.plan.succesful.toast.label', replacements: [plan.customName] })))
          .then(closeRightPanel)
          .then(() => queryClient.invalidateQueries({ queryKey: ['plans'] }))
      )
    } else {
      return (
        Services.updatePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, plan)
          .then(() => toast.success('update.plan.succesful.toast.label'))
          .then(closeRightPanel)
          .then(() => queryClient.invalidateQueries({ queryKey: ['plans'] }))
      )

    }
  }

  const updatePlan = (plan: IUsagePlan, creation: boolean = false) => {
    return openRightPanel({
      title: creation ? translate("api.home.create.plan.form.title") : translate("api.home.update.plan.form.title"),
      content: <UsagePlanForm
        plan={plan}
        api={props.api}
        creation={creation}
        ownerTeam={props.ownerTeam}
        plans={usagePlansQuery.data as Array<IUsagePlan>}
        onSubmit={(plan: IUsagePlan) => savePlan(plan, creation)}
      />
    })
  }

  const createNewPlan = () => {
    if (props.api.parent) {
      openCustomModal({
        title: translate("api.home.create.plan.modal.title"),
        content: <div className='d-flex flex-column'>
          <span>{translate("api.home.create.plan.modal.description")}</span>
          <div className='d-flex flex-rox justify-content-around'>
            <button className='btn btn-outline-info' onClick={() => Services.fetchNewPlan()
              .then(p => {
                close()
                updatePlan(p, true)
              })}>
              {translate('api.home.create.plan.modal.create.btn.label')}
            </button>
            <button className='btn btn-outline-info' onClick={() => {
              close()
              openApiSelectModal({
                api: props.api,
                teamId: props.ownerTeam._id,
                onClose: (plan) => {
                  updatePlan({
                    ...cloneDeep(plan),
                    _id: nanoid(32),
                    customName: `${plan.customName} (import)`,
                  }, true)
                },
              })
            }}>
              {translate('api.home.create.plan.modal.import.btn.label')}
            </button>
          </div>
        </div>
      })
    } else {
      Services.fetchNewPlan()
        .then((plan) => {
          close()
          updatePlan(plan, true)
        })
    }
  }

  if (usagePlansQuery.isLoading) {
    return <Spinner />;
  } else if (usagePlansQuery.data && !isError(usagePlansQuery.data)) {
    const possibleUsagePlans = (
      usagePlansQuery.data as Array<IUsagePlan>
    ).filter((plan) => {
      return (
        plan.visibility === 'Public' ||
        props.myTeams.some((team) => team._id === props.ownerTeam._id) ||
        props.myTeams.some((team) => plan.authorizedTeams.includes(team._id))
      );
    });

    if (maybeEnv && maybeTab) {
      const plan = usagePlansQuery.data.find((p) => p.customName === maybeEnv)!;
      return (
        <div>
          <div className="d-flex flex-row">
            <Link
              to={`../../${props.api.currentVersion}/pricing`}
              relative="path"
            >
              <i className="fa-regular fa-circle-left fa-lg cursor-pointer a-fake" />
            </Link>
            <h5 className="ms-3">{plan.customName}</h5>
          </div>
          <div className="d-flex flex-row justify-content-around mb-2">
            <Link
              to={`../../${props.api.currentVersion}/pricing/${plan.customName}/swagger`}
              relative="path"
              className={classNames('btn btn-sm btn-outline-primary mb-1', {
                link__disabled: !plan.swagger?.content && !plan.swagger?.url,
                disabled: !plan.swagger?.content && !plan.swagger?.url,
              })}
            >
              swagger
            </Link>
            <Link
              to={`../../${props.api.currentVersion}/pricing/${plan.customName}/testing`}
              relative="path"
              className={classNames('btn btn-sm btn-outline-primary mb-1', {
                link__disabled: !plan.testing || !plan.testing.enabled,
                disabled: !plan.testing || !plan.testing.enabled,
              })}
            >
              test
            </Link>
            <Link
              to={`../../${props.api.currentVersion}/pricing/${plan.customName}/documentation`}
              relative="path"
              className={classNames('btn btn-sm btn-outline-primary', {
                link__disabled:
                  !plan.documentation || !plan.documentation?.pages.length,
                disabled:
                  !plan.documentation || !plan.documentation?.pages.length,
              })}
            >
              Documentation
            </Link>
          </div>
          <div>
            {maybeTab === 'swagger' && (
              <ApiRedoc
                entity={plan}
                save={savePlan}
                ownerTeam={props.ownerTeam}
                swaggerUrl={`/api/teams/${props.api.team}/apis/${props.api._id}/${props.api.currentVersion}/plans/${plan._id}/swagger`}
                swaggerConf={plan.swagger}
              />
            )}
            {maybeTab === 'documentation' && (
              <ApiDocumentation
                entity={plan}
                api={props.api}
                documentation={plan.documentation}
                getDocPage={(pageId) =>
                  Services.getUsagePlanDocPage(props.api._id, plan._id, pageId)
                }
                ownerTeam={props.ownerTeam}
              />
            )}
            {maybeTab === 'testing' && (
              <ApiSwagger
                _id={plan._id}
                testing={plan.testing}
                swagger={plan.swagger}
                swaggerUrl={`/api/teams/${props.api.team}/apis/${props.api._id}/${props.api.currentVersion}/plans/${plan._id}/swagger`}
                callUrl={`/api/teams/${props.api.team}/testing/${props.api._id}/plans/${plan._id}/call`}
                entity={plan}
                ownerTeam={props.ownerTeam}
                save={savePlan}
              />
            )}
          </div>
        </div>
      );
    } else {
      return (
        <div
          className="d-flex flex-row pricing-content flex-wrap"
          id="usage-plans__list"
        >
          {possibleUsagePlans
            .sort((a, b) => a.customName.localeCompare(b.customName))
            .map((plan) => (
              <ApiPricingCard
                api={props.api}
                key={plan._id}
                plan={plan}
                myTeams={props.myTeams}
                ownerTeam={props.ownerTeam}
                subscriptions={props.subscriptions.filter(
                  (subs) =>
                    subs.api === props.api._id && subs.plan === plan._id
                )}
                inProgressDemands={props.inProgressDemands.filter(
                  (demand) => demand.api === props.api._id && demand.plan === plan._id
                )}
                askForApikeys={props.askForApikeys}
                updatePlan={updatePlan}
                plans={possibleUsagePlans}
              />
            ))}
          {props.api.visibility !== 'AdminOnly' && <Can I={manage} a={API} team={props.ownerTeam}>
            <div className='fake-pricing-card col-md-4 card-mb-4 card mb-4 shadow-sm usage-plan__card'
              onClick={createNewPlan} />
          </Can>}
        </div>
      );
    }
  } else {
    return <div></div>;
  }
};
