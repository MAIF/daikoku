import { constraints, Flow, Form, format, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import cloneDeep from 'lodash/cloneDeep';
import difference from 'lodash/difference';
import { nanoid } from 'nanoid';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import Edit2 from 'react-feather/dist/icons/edit-2';
import { useMatch, useNavigate } from 'react-router-dom';
import Select, { components, OptionProps, ValueContainerProps } from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { toast } from 'sonner';


import { GraphQLClient } from 'graphql-request';
import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { currencies } from '../../../services/currencies';
import {
  IApi,
  IOtoroshiSettings,
  IOtoroshiTarget,
  isError,
  ISubscription,
  ISubscriptionDemand,
  isValidationStepTeamAdmin,
  ITeamSimple,
  ITenantFull,
  IThirdPartyPaymentSettings,
  IUsagePlan
} from '../../../types';
import { SubscriptionProcessEditor } from '../../backoffice/apis/SubscriptionProcessEditor';
import {
  access,
  api as API,
  apikey,
  Can,
  CanIDoAction,
  isPublish,
  isSubscriptionProcessIsAutomatic,
  manage,
  Option,
  renderPricing,
  Spinner
} from '../../utils';

type Option = {
  label: string;
  value: string;
  enabled: boolean;
};
type ExtraProps = {
  labelKey: string;
  labelKeyAll: string;
  getEnabledValue: (data: string) => number
};
const CustomOption = (props: OptionProps<Option, true> & { selectProps: ExtraProps }) => {
  const { data, innerRef, innerProps } = props;
  const { translate } = useContext(I18nContext);

  return (
    <div ref={innerRef} {...innerProps} className="d-flex align-items-center px-3 py-2 cursor-pointer select-menu-item gap-2">
      <div className="col-1">
        {!data.enabled && (
          <span className="badge badge-custom-danger">
            {translate("Disabled")}
          </span>
        )}
      </div>

      <span>{data.label}</span>

    </div>
  );
};

type OtoroshiEntitiesSelectorProps = {
  rawValues: IOtoroshiTarget
  onChange: (item: any) => void,
  translate: (x: string) => string
  ownerTeam: ITeamSimple
}
type OtoroshiEntity = {
  label: string
  value: string
  type: 'route' | 'group' | 'service'
  enabled: boolean
}
export const OtoroshiEntitiesSelector = ({ rawValues, onChange, translate, ownerTeam }: OtoroshiEntitiesSelectorProps) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [groups, setGroups] = useState<Array<OtoroshiEntity>>([]);
  const [services, setServices] = useState<Array<OtoroshiEntity>>([]);
  const [routes, setRoutes] = useState<Array<OtoroshiEntity>>([]);
  const [disabled, setDisabled] = useState<boolean>(true);
  const [value, setValue] = useState<any>(undefined);

  const { Translation } = useContext(I18nContext);


  useEffect(() => {
    const otoroshiTarget = rawValues;

    if (otoroshiTarget && otoroshiTarget.otoroshiSettings) {
      Promise.all([
        Services.getOtoroshiGroupsAsTeamAdmin(
          ownerTeam._id,
          otoroshiTarget.otoroshiSettings
        ),
        Services.getOtoroshiServicesAsTeamAdmin(
          ownerTeam._id,
          otoroshiTarget.otoroshiSettings
        ),
        Services.getOtoroshiRoutesAsTeamAdmin(
          ownerTeam._id,
          otoroshiTarget.otoroshiSettings
        ),
      ])
        .then(([groups, services, routes]) => {
          console.debug({ routes })
          if (!groups.error)
            setGroups(
              groups.map((g: any) => ({
                label: g.name,
                value: g.id,
                type: 'group',
                enabled: g.enabled
              }))
            );
          else setGroups([]);
          if (!services.error)
            setServices(
              services.map((g: any) => ({
                label: g.name,
                value: g.id,
                type: 'service',
                enabled: g.enabled
              }))
            );
          else setServices([]);
          if (!routes.error)
            setRoutes(
              routes.map((g: any) => ({
                label: g.name,
                value: g.id,
                type: 'route',
                enabled: g.enabled
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
  }, [rawValues.otoroshiSettings]);

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
      !!rawValues.authorizedEntities
    ) {
      setValue(
        [
          ...rawValues.authorizedEntities.groups.map(
            (authGroup: any) =>
              (groups as any).find((g: any) => g.value === authGroup)
          ),
          ...(rawValues.authorizedEntities.services || []).map(
            (authService: any) =>
              (services as any).find((g: any) => g.value === authService)
          ),
          ...(rawValues.authorizedEntities.routes || []).map(
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
                  groups.find((g) => g.value === entitie.value)?.value,
                ],
              };
            case 'service':
              return {
                ...acc,
                services: [
                  ...acc.services,
                  services.find((s) => s.value === entitie.value)?.value,
                ],
              };
            case 'route':
              return {
                ...acc,
                routes: [
                  ...acc.routes,
                  routes.find((s: any) => s.value === entitie.value)?.value,
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
        components={{
          Group: components.Group, //@ts-ignore
          Option: CustomOption
        }}
        formatGroupLabel={formatGroupLabel}
        getEnabledValue={(item: string) => {
          //todo: chelou, certaine route sont disable on sait pas pourquoi ?
          const enabled = [...groups, ...routes, ...services].find(i => i.value === item)?.enabled
          return enabled
        }}
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

const CustomMetadataInput = (props: {
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


const QuotasForm = (props: { ownerTeam: ITeamSimple, plan: IUsagePlan, savePlan: (plan: IUsagePlan) => void }) => {
  const { translate } = useContext(I18nContext);
  const { tenant } = useContext(GlobalContext);

  const [quotasDisplayed, setQuotasDisplayed] = useState(!!props.plan.maxPerDay)


  const quotasSchema = ({
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
  })

  return (
    <>
      <ToggleFormPartButton
        value={quotasDisplayed}
        action={() => setQuotasDisplayed((prev) => !prev)}
        falseLabel={translate("usage.plan.form.quotas.selector.false.label")}
        falseDescription={translate("usage.plan.form.quotas.selector.false.description")}
        trueLabel={translate("usage.plan.form.quotas.selector.true.label")}
        trueDescription={translate("usage.plan.form.quotas.selector.true.description")}
      />
      {quotasDisplayed && <Form
        schema={quotasSchema}
        value={props.plan}
        onSubmit={(data) => props.savePlan({ ...props.plan, ...data })}
      />}
      {!quotasDisplayed && (
        <div className='mrf-flex mrf-jc_end mrf-mt_5'>
          <button className='mrf-btn mrf-btn_green mrf-ml_10'
            type='button'
            onClick={() => props.savePlan({ ...props.plan, maxPerDay: undefined, maxPerSecond: undefined, maxPerMonth: undefined })}>
            Save
          </button>
        </div>
      )}
    </>
  )
}
const BillingForm = (props: { ownerTeam: ITeamSimple, plan: IUsagePlan, savePlan: (plan: IUsagePlan) => void }) => {
  const { translate } = useContext(I18nContext);
  const { tenant } = useContext(GlobalContext);

  const [billingDisplayed, setBillingDisplayed] = useState(!!props.plan.costPerMonth || !!props.plan.costPerRequest)

  const billingSchema = ({
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
          options: tenant.thirdPartyPaymentSettings,
          transformer: (s: IThirdPartyPaymentSettings) => ({
            label: s.name,
            value: s._id,
          }),
          props: { isClearable: true },
          onChange: ({ rawValues, setValue, value }) => {
            const settings = tenant.thirdPartyPaymentSettings;
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
          `Cost per ${rawValues?.billingDuration?.unit?.toLocaleLowerCase() ?? 'month'}`
        ),
      placeholder: translate('Cost per billing period'),
      constraints: [constraints.positive(translate('constraints.positive'))],
    },
    costPerRequest: {
      type: type.number,
      label: translate('Cost per req.'),
      placeholder: translate('Cost per request'),
      props: { step: 0.01 },
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
  })

  return (
    <>
      <ToggleFormPartButton
        value={billingDisplayed}
        action={() => setBillingDisplayed((prev) => !prev)}
        falseLabel={translate("usage.plan.form.pricing.selector.false.label")}
        falseDescription={translate("usage.plan.form.pricing.selector.false.description")}
        trueLabel={translate("usage.plan.form.pricing.selector.true.label")}
        trueDescription={translate("usage.plan.form.pricing.selector.true.description")}
      />
      {billingDisplayed && <Form
        schema={billingSchema}
        value={props.plan}
        onSubmit={(data) => props.savePlan({ ...props.plan, ...data })}
      />}
      {!billingDisplayed && (
        <div className='mrf-flex mrf-jc_end mrf-mt_5'>
          <button className='mrf-btn mrf-btn_green mrf-ml_10'
            type='button'
            onClick={() => props.savePlan({
              ...props.plan,
              costPerMonth: undefined, costPerRequest: undefined,
              trialPeriod: undefined, currency: undefined,
              billingDuration: undefined, paymentSettings: undefined
            })}>
            Save
          </button>
        </div>
      )}
    </>
  )
}

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
  updatePlan: (p: IUsagePlan, creation?: boolean) => void
  savePlan: (p: IUsagePlan) => void
  plans: Array<IUsagePlan>
};
const ApiPricingCard = (props: ApiPricingCardProps) => {
  const { Translation } = useContext(I18nContext);
  const {
    openFormModal,
    openLoginOrRegisterModal,
    openApiKeySelectModal,
    openCustomModal,
    close,
    closeRightPanel,
    openRightPanel
  } = useContext(ModalContext);
  const { connectedUser, tenant } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);

  const queryClient = useQueryClient();

  const graphqlEndpoint = `${window.location.origin}/api/search`;
  const customGraphQLClient = new GraphQLClient(graphqlEndpoint);

  // const abilitedToUpdateAPI = useMemo<boolean>(() => CanIDoAction(connectedUser, manage, API, props.ownerTeam), [connectedUser, props.ownerTeam]);

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

    props.updatePlan(clone, true)

  };

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

  const otoroshiSchema = (planForEdition: IUsagePlan) => ({
    otoroshiSettings: {
      type: type.string,
      format: format.select,
      disabled: !!planForEdition?.otoroshiTarget?.otoroshiSettings,
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
        !!rawValues.otoroshiSettings,
      deps: ['otoroshiSettings'],
      render: (p) =>
        OtoroshiEntitiesSelector({ ...p, translate, ownerTeam: props.ownerTeam }),
      label: translate('Authorized entities'),
      placeholder: translate('Authorized.entities.placeholder'),
      help: translate('authorized.entities.help'),
    },
    apikeyCustomization: {
      type: type.object,
      format: format.form,
      label: null,
      schema: {
        clientIdOnly: {
          type: type.bool,
          label: () => {
            if (plan.aggregationApiKeysSecurity) {
              return `${translate('Read only apikey')} (${translate('disabled.due.to.aggregation.security')})`;
            } else {
              return translate('Apikey with clientId only');
            }
          },
          disabled: () =>
            !!plan.aggregationApiKeysSecurity,
          onChange: ({ setValue, value }) => {
            if (value) {
              setValue('aggregationApiKeysSecurity', false);
            }
          },
        },
        readOnly: {
          type: type.bool,
          label: () => {
            if (plan.aggregationApiKeysSecurity) {
              return `${translate('Read only apikey')} (${translate('disabled.due.to.aggregation.security')})`;
            } else {
              return translate('Read only apikey');
            }
          },
          disabled: () => !!plan.aggregationApiKeysSecurity,
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
                !!rawValues.apikeyCustomization
                  .restrictions.enabled,
              deps: [
                'apikeyCustomization.restrictions.enabled',
              ],
              label: translate('Allow at last'),
              help: translate('allow.least.help'),
            },
            allowed: {
              label: translate('Allowed pathes'),
              visible: ({ rawValues }) =>
                rawValues.apikeyCustomization
                  .restrictions.enabled,
              deps: [
                'apikeyCustomization.restrictions.enabled',
              ],
              ...pathes,
            },
            forbidden: {
              label: translate('Forbidden pathes'),
              visible: ({ rawValues }) =>
                rawValues.apikeyCustomization
                  .restrictions.enabled,
              deps: [
                'apikeyCustomization.restrictions.enabled',
              ],
              ...pathes,
            },
            notFound: {
              label: translate('Not found pathes'),
              visible: ({ rawValues }) =>
                rawValues.apikeyCustomization
                  .restrictions.enabled,
              deps: [
                'apikeyCustomization.restrictions.enabled',
              ],
              ...pathes,
            },
          },
        },
      },
    },
  });

  const editOtoroshiTarget = () => openRightPanel({
    title: translate('api.pricings.otoroshi.target.panel.title'),
    content: <Form
      schema={otoroshiSchema(props.plan)}
      value={plan.otoroshiTarget}
      onSubmit={(otoroshiTarget) => {
        props.savePlan({ ...plan, otoroshiTarget })
      }}
    />
  })

  const setupPayment = (plan: IUsagePlan) => {
    return Services.setupPayment(props.ownerTeam._id, props.api._id, props.api.currentVersion, plan)
      .then((response) => {
        if (isError(response)) {
          toast.error(translate(response.error));
        } else {
          toast.success(translate('plan.payment.setup.successful'));
          closeRightPanel();
          queryClient.invalidateQueries({ queryKey: ['plans'] })
        }
      });
  };

  const editQuotas = () => {
    if (userCanUpadtePlan)
      openRightPanel({
        title: translate("api.pricings.quotas.panel.title"),
        content: <QuotasForm ownerTeam={props.ownerTeam} plan={props.plan} savePlan={props.savePlan} />
      })
  }
  const editPricing = () => {
    if (userCanUpadtePlan)
      openRightPanel({
        title: translate("api.pricings.pricing.panel.title"),
        content: <BillingForm
          ownerTeam={props.ownerTeam}
          plan={props.plan}
          savePlan={setupPayment} />
      })
  }
  const editProcess = () => openRightPanel({
    title: translate("api.pricings.subscription.process.panel.title"),
    content: <SubscriptionProcessEditor
      savePlan={plan => Promise.resolve(props.savePlan(plan))}
      plan={props.plan}
      team={props.ownerTeam}
      tenant={tenant}
    />
  })

  const userCanUpadtePlan = CanIDoAction(connectedUser, manage, API, props.ownerTeam)

  return (
    <div
      className="col-md-3 mb-4 shadow-sm usage-plan__card"
      data-usage-plan={plan.customName}
      role='listitem'
      aria-labelledby={`${plan._id}-title`}
    >
      <div
        className="usage-plan__card__header"
        data-holder-rendered="true"
      >
        <Can I={manage} a={API} team={props.ownerTeam}>
          <div
            className="dropdown"
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              zIndex: '100',
            }}
          >
            <i
              className="fas fa-gear cursor-pointer dropdown-menu-button"
              style={{ fontSize: '20px', fill: 'tomato' }}
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
                  className="dropdown-item cursor-pointer danger"
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
        <div className='overflow-hidden usage-plan__card__title' id={`${plan._id}-title`}>{plan.customName}</div>
        <p className="usage-plan__card__description text-justify flex-grow-1">
          {customDescription && <span>{customDescription}</span>}
        </p>
        <div className="d-flex justify-content-between align-items-center flex-wrap usage-plan__card__subscription">
          {!connectedUser.isGuest && (!otoroshiTargetIsDefined || !otoroshiEntitiesIsDefined || !isPublish(props.api)) && props.api.visibility !== 'AdminOnly' && (
            <button
              type="button"
              className="usage-plan__card__action-button inactive"
            >
              <Translation i18nkey="Get API key" />
            </button>
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
                      className="usage-plan__card__action-button"
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
              className="usage-plan__card__action-button"
              onClick={() => openLoginOrRegisterModal({ tenant })}
            >
              <Translation i18nkey="Get API key" />
            </button>
          )}
        </div>
      </div>
      <div className="usage-plan__card__body d-flex flex-column">
        <span className={classNames("usage-plan__card__feature", {
          "no-decoration": !userCanUpadtePlan
        })} onClick={editQuotas}>
          <div>
            <h4>{translate('Quotas')}</h4>
            <div className='feature__description'>
              {!plan.maxPerMonth && translate('plan.limits.unlimited')}
              {!!plan.maxPerMonth && translate({
                key: 'api.pricings.quotas.value', replacements: [
                  String(plan.maxPerSecond), String(plan.maxPerDay), String(plan.maxPerMonth)
                ]
              })}
            </div>
          </div>
          <Can I={manage} a={API} team={props.ownerTeam}>
            <Edit2 className="edition-icon" />
          </Can>
        </span>
        <span className={classNames("usage-plan__card__feature", {
          "no-decoration": !userCanUpadtePlan
        })} onClick={editPricing}>
          <div>
            <h4>Tarif</h4>
            <span className='feature__description'>
              {pricing}
            </span>
          </div>
          <Can I={manage} a={API} team={props.ownerTeam}>
            <Edit2 className="edition-icon" />
          </Can>

        </span>
        <Can I={manage} a={API} team={props.ownerTeam}>
          <span className="usage-plan__card__feature" onClick={editOtoroshiTarget}>
            <div>
              <h4>{translate("Otoroshi target")}</h4>
              <span className='feature__description'>
                {plan.otoroshiTarget?.otoroshiSettings && (tenant.otoroshiSettings.find(o => o._id === plan.otoroshiTarget?.otoroshiSettings)?.url)}
                {!plan.otoroshiTarget?.otoroshiSettings && translate('api.pricings.otoroshi.target.value.none')}
              </span>
            </div>
            <Edit2 className="edition-icon" />
          </span>
        </Can>
        <Can I={manage} a={API} team={props.ownerTeam}>
          <span className="usage-plan__card__feature" onClick={editProcess}>
            <div>
              <h4>{translate('Process')}</h4>
              <span className='feature__description'>{plan.subscriptionProcess.length ?
                translate({ key: 'api.pricings.process.value', replacements: [String(plan.subscriptionProcess.length)] }) :
                translate('api.pricings.process.value.none')}</span>
            </div>
            <Edit2 className="edition-icon" />
          </span>
        </Can>
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

  const { confirm, openRightPanel, closeRightPanel, openCustomModal, close, openApiSelectModal } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);
  const { tenant } = useContext(GlobalContext);

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
          .then(() => toast.success(translate({ key: 'create.plan.successful.toast.label', replacements: [plan.customName] })))
          .then(closeRightPanel)
          .then(() => queryClient.invalidateQueries({ queryKey: ['plans', props.api.currentVersion] }))
      )
    } else {
      return (
        Services.updatePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, plan)
          .then(() => toast.success(translate('update.plan.successful.toast.label')))
          .then(() => queryClient.invalidateQueries({ queryKey: ['plans', props.api.currentVersion] }))
          .then(closeRightPanel)
      )

    }
  }

  const customNameSchemaPart = (plans: Array<IUsagePlan>, api: IApi, planForEdition: IUsagePlan) => {
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

  const basicInformationSchema = (plan: IUsagePlan) => ({
    ...customNameSchemaPart(usagePlansQuery.data as Array<IUsagePlan>, props.api, plan),
    customDescription: {
      type: type.string,
      format: format.text,
      label: translate('Description'),
      placeholder: translate('Plan description'),
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
      deps: ['visibility'],
      label: translate('Authorized teams'),
      optionsFrom: () => Services.teams(props.ownerTeam)
        .then(r => isError(r) ? [] : r),
      transformer: (t: ITeamSimple) => ({
        label: t.name,
        value: t._id,
      }),
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
      visible: !!tenant.aggregationApiKeysSecurity,
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
      ],
    },
  })

  const basicInformationFlow: Flow = [
    'customName',
    'customDescription',
    'visibility',
    'authorizedTeams',
    {
      label: 'Security',
      collapsed: true,
      flow: [
        'autoRotation',
        'aggregationApiKeysSecurity',
        'allowMultipleKeys',
        'integrationProcess'
      ]
    }
  ]

  const updatePlan = (plan: IUsagePlan, creation: boolean = false) => {
    return openRightPanel({
      title: creation ? translate("api.home.create.plan.form.title") : translate("api.home.update.plan.form.title"),
      content: <Form
        value={plan}
        schema={basicInformationSchema(plan)}
        flow={basicInformationFlow}
        onSubmit={(plan: IUsagePlan) => savePlan(plan, creation)}

        options={{
          actions: {
            cancel: { display: true, label: translate('Cancel'), action: () => closeRightPanel() },
            submit: { label: translate('Save') }
          }
        }}
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

    return (
      <div
        className="d-flex flex-row pricing-content flex-wrap"
        id="usage-plans__list"
        role="list"
        aria-label={translate(`api.pricings.list.${tenant.display === 'default' ? 'plans' : 'environments'}.aria.label`)}
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
              updatePlan={(plan, creation = false) => updatePlan(plan, creation)}
              savePlan={savePlan}
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
};
