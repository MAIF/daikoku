import { constraints, Flow, Form, format, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import cloneDeep from 'lodash/cloneDeep';
import difference from 'lodash/difference';
import { nanoid } from 'nanoid';
import { useContext, useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, EllipsisVertical, Trash2, Pencil, CopyPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Select, { components, OptionProps } from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { toast } from 'sonner';
import { GraphQLClient } from 'graphql-request';
import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { currencies } from '../../../services/currencies';
import {
  ApiPricingProps,
  IApi,
  IApiGQL,
  IOtoroshiSettings,
  IPlansWithCount,
  isError,
  ISubscription,
  ISubscriptionWithApiInfo,
  ITeamSelector,
  ITeamSimple,
  ITenant,
  IThirdPartyPaymentSettings,
  IUsagePlan,
  IUsagePlanGQL,
  OtoroshiEntitiesSelectorProps,
  OtoroshiEntity
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
  renderPricing
} from '../../utils';
import { ColumnDef, createColumnHelper, } from "@tanstack/react-table";
import { DynamicTable, FetchData, FetchResult } from "../../inputs";
import { QUERY_KEYS } from "../../../constants/queryKeys";
import { SimpleApiKeyCard } from '../../backoffice/apikeys/TeamApiKeysForApi';

type Option = {
  type: 'group' | 'route';
  label: string;
  value: string;
  enabled: boolean;
};

type ExtraProps = {
  labelKey: string;
  labelKeyAll: string;
  getEnabledValue: (data: string) => number
};

type ToggleButtonProps = {
  action: (value: boolean) => void
  disabledTrue?: boolean
  disabledFalse?: boolean
  value: boolean
  trueLabel: string
  trueDescription: string
  falseLabel: string
  falseDescription: string
}



const CustomOption = (props: OptionProps<Option, true> & { selectProps: ExtraProps }) => {
  const { data, innerRef, innerProps } = props;
  const { translate } = useContext(I18nContext);

  return (
    <div ref={innerRef} {...innerProps}
      className="d-flex align-items-center px-3 py-2 cursor-pointer select-menu-item gap-2">
      <div className="col-1">
        {data.type !== 'group' && !data.enabled && (
          <span className="badge --danger">
            {translate("Disabled")}
          </span>
        )}
      </div>

      <span>{data.label}</span>

    </div>
  );
};

export const OtoroshiEntitiesSelector = ({
  rawValues,
  onChange,
  translate,
  ownerTeam
}: OtoroshiEntitiesSelectorProps) => {
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
          return [...groups, ...routes, ...services].find(i => i.value === item)?.enabled
        }} //@ts-ignore
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
    props.onChange?.(newValues);
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
    props.onChange?.(newValues);
  };

  const addFirst = (e: React.MouseEvent<HTMLElement>) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!props.value || props.value.length === 0) {
      props.onChange?.([{ key: '', possibleValues: [] }]);
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
    props.onChange?.(newValues);
  };

  const remove = (e: React.MouseEvent<HTMLElement>, key: string) => {
    if (e && e.preventDefault) e.preventDefault();

    props.onChange?.((props.value || []).filter((x: any) => x.key !== key));
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
            <Plus />{' '}
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
              <Trash2 />
            </button>
            {idx === (props.value?.length || 0) - 1 && (
              <button
                type="button"
                className="input-group-text btn btn-outline-info"
                onClick={addNext}
              >
                <Plus />{' '}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const QuotasForm = (props: { ownerTeam: ITeamSimple, plan: IUsagePlanGQL, savePlan: (plan: IUsagePlan) => void }) => {
  const { translate } = useContext(I18nContext);
  useContext(GlobalContext);

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
        action={(value) => setQuotasDisplayed(value)}
        falseLabel={translate("usage.plan.form.quotas.selector.false.label")}
        falseDescription={translate("usage.plan.form.quotas.selector.false.description")}
        trueLabel={translate("usage.plan.form.quotas.selector.true.label")}
        trueDescription={translate("usage.plan.form.quotas.selector.true.description")}
      />
      {quotasDisplayed && <Form
        schema={quotasSchema}
        value={props.plan}
        onSubmit={(data) => props.savePlan(convertIUsagePlanGQLToIUsagePlan({ ...props.plan, ...data }))}
      />}
      {!quotasDisplayed && (
        <div className='mrf-flex mrf-jc_end mrf-mt_5'>
          <button className='mrf-btn mrf-btn_green mrf-ml_10'
            type='button'
            onClick={() => props.savePlan(convertIUsagePlanGQLToIUsagePlan({
              ...props.plan,
              maxPerDay: undefined,
              maxPerSecond: undefined,
              maxPerMonth: undefined
            }))}>
            Save
          </button>
        </div>
      )}
    </>
  )
}

const BillingForm = (props: { ownerTeam: ITeamSimple, plan: IUsagePlanGQL, savePlan: (plan: IUsagePlanGQL) => void }) => {
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
          onChange: ({ setValue, value }) => {
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
        disabledTrue={true}
        action={(value) => setBillingDisplayed(value)}
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
              costPerMonth: undefined,
              costPerRequest: undefined,
              trialPeriod: undefined,
              currency: undefined,
              billingDuration: undefined,
              paymentSettings: undefined
            })}>
            Save
          </button>
        </div>
      )}
    </>
  )
}

const SimpleTeamSelector = (props: {
  teams: Array<{ disabledFor: Array<string>, team: ITeamSimple }>;
  showApiKeySelectModal: (teamId: string) => void;
}) => {
  const { translate } = useContext(I18nContext);
  return (
    <div className="modal-body">
      <div>
        <div className="modal-description">
          {translate('team.selection.desc.request')}
        </div>
        <div className="team-selection__container">
          {props.teams.map(({ team, disabledFor }) => {

            return <div
              key={team._id}
              className={classNames('team-selection team-selection__team', {
                selectable: disabledFor.length === 0,
                'cursor-forbidden': disabledFor.length > 0,
              })}
              onClick={() => {
                return disabledFor.length === 0
                  ? props.showApiKeySelectModal(team._id)
                  : () => {
                  };
              }}
            >
              {disabledFor.map((cause) =>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary disabled"
                >
                  {cause}
                </button>
              )}
              {/*displayVerifiedBtn && !team.verified && (
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
              )*/}
              <span className="ms-2">{team.name}</span>
            </div>
          })}
        </div>
      </div>
    </div>
  );
}

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
              (t) => {
                return !!props.allowMultipleDemand || !props.acceptedTeams.includes(t._id)
              })
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
                      ? props.showKeyringSelectModal(team._id)
                      : () => {
                      };
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

const ToggleFormPartButton = (props: ToggleButtonProps) => {
  return (
    <div className='form-selector mt-4'>
      <button type='button' className={classNames('btn btn-outline-info col-6', { active: props.value })}
        onClick={() => props.action(true)}
        disabled={props.disabledTrue}
      >
        <div className='label'>{props.trueLabel}</div>
        <div className='description'>{props.trueDescription}</div>
      </button>
      <button type='button' className={classNames('btn btn-outline-info col-6', { active: !props.value })}
        onClick={() => props.action(false)}
        disabled={props.disabledFalse}>
        <div className='label'>{props.falseLabel}</div>
        <div className='description'>{props.falseDescription}</div>
      </button>
    </div>
  )
}

export const ApiPricing = (props: ApiPricingProps) => {
  const {
    openLoginOrRegisterModal,
    openKeyringSelectModal,
    openCustomModal,
    close,
    openFormModal,
    closeRightPanel,
    openRightPanel,
    openApiSelectModal,
    confirm
  } = useContext(ModalContext);
  const { connectedUser, tenant, customGraphQLClient } = useContext(GlobalContext);

  const [rowSelection, setRowSelection] = useState<{ [planId: string]: boolean }>({});

  const isPlanSelectable = (plan: IUsagePlanGQL, selectedPlans: IUsagePlanGQL[]) => {
    // TODO Vérifier qu'il reste au moins une équipe pour laquelle on a le droit de demander une clé (si le plan n'autorise pas plusieurs souscriptions / équipe)
    if (selectedPlans.length === 0) return true;

    return selectedPlans.some(
      row => {
        // TODO Si un des plans déjà sélectionné et la ligne en cours n'autorise qu'une clé / équipe
        // On veut vérifier qu'il existe une équipe pouvant encore souscrire aux deux
        return plan.subscriptionProcessChecksum === row.subscriptionProcessChecksum;
      }

    );
  };

  const { translate, Translation } = useContext(I18nContext);
  const queryClient = useQueryClient();

  const userCanUpdatePlan = CanIDoAction(connectedUser, manage, API, props.ownerTeam)
  const usagePlansFetchData: FetchData<IUsagePlanGQL> = ({ limit, offset, filters, sorting }) =>
    customGraphQLClient
      .request<{ plansByApi: IPlansWithCount }>(
        Services.graphql.plansByApi, {
        filterTable: JSON.stringify(filters),
        sortingTable: JSON.stringify(sorting),
        limit,
        offset,
        apiId: props.api._id
      })
      .then(({ plansByApi }): FetchResult<IUsagePlanGQL> => {
        return {
          items: plansByApi.plans,
          total: plansByApi.total,
          totalFiltered: plansByApi.totalFiltered,
        }
      })

  const availableEnvQuery = useQuery({
    queryKey: QUERY_KEYS.availableEnvsByApi(props.api._id),
    queryFn: () => Services.getAllAvailableEnvs(props.ownerTeam._id, props.api._id, props.api.currentVersion)
  })

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['plans'] });
  }, [props.api]);


  const customNameSchemaPart = (api: IApi, availableEnvsdata: string[]) => {
    if (tenant.display === 'environment' && api.visibility !== 'AdminOnly') {
      return {
        customName: {
          type: type.string,
          format: format.select,
          label: translate('Name'),
          placeholder: translate('Plan name'),
          options: availableEnvsdata,
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

  const basicInformationSchema = useMemo(() => (availableEnvs: string[]) => ({
    ...customNameSchemaPart(props.api, availableEnvs),
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
    metadata: {
      type: type.object,
      label: translate('Metadata'),
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
      visible: tenant.aggregationApiKeysSecurity,
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
  }), [availableEnvQuery.data, availableEnvQuery.isSuccess])

  const basicInformationFlow: Flow = [
    'customName',
    'customDescription',
    'visibility',
    'authorizedTeams',
    'metadata',
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

  const savePlan = (plan: IUsagePlan, creation: boolean = false) => {
    if (creation) {
      return (
        Services.createPlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, plan)
          .then(() => toast.success(translate({
            key: 'create.plan.successful.toast.label',
            replacements: [plan.customName]
          })))
          .then(closeRightPanel)
          .then(() => queryClient.invalidateQueries({ queryKey: ['plans'] }))
      )
    } else {
      return (
        Services.updatePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, plan)
          .then(() => toast.success(translate('update.plan.successful.toast.label')))
          .then(() => queryClient.invalidateQueries({ queryKey: ['plans'] }))
          .then(closeRightPanel)
      )
    }
  }

  const updatePlan = (plan: IUsagePlan, creation: boolean = false) => {

    // Convertier IUsagePlanGQL en IUsagePlan
    const planToUse = plan
    availableEnvQuery.refetch().then(({ data: availableEnvs = [] }) => {
      openRightPanel({
        title: creation ? translate("api.home.create.plan.form.title") : translate("api.home.update.plan.form.title"),
        content: <Form
          value={planToUse}
          schema={basicInformationSchema(availableEnvs)}
          flow={basicInformationFlow}
          onSubmit={(plan: IUsagePlan) => {
            return savePlan(plan, creation)
          }}
          options={{
            actions: {
              cancel: { display: true, label: translate('Cancel'), action: () => closeRightPanel() },
              submit: { label: translate('Save') }
            }
          }}
        />
      })
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
                updatePlan(convertIUsagePlanGQLToIUsagePlan(p), true)
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
          updatePlan(convertIUsagePlanGQLToIUsagePlan(plan), true)
        })
    }
  }

  const otoroshiTargetColumn = (plan: IUsagePlanGQL) => {
    const isAutomaticProcess = isSubscriptionProcessIsAutomatic(plan);

    const graphqlEndpoint = `${window.location.origin}/api/search`;

    const customGraphQLClient = new GraphQLClient(graphqlEndpoint);

  // const abilitedToUpdateAPI = useMemo<boolean>(() => CanIDoAction(connectedUser, manage, API, props.ownerTeam), [connectedUser, props.ownerTeam]);

  const showKeyringSelectModal = (team: string) => {

    const askForApikeys = (
      team: string,
      plan: IUsagePlan,
      apiKey?: ISubscription
    ) => {
      const formStep = plan.subscriptionProcess.find((s) =>
        s.type === 'form'
      );
      if (formStep) {
        openFormModal({
          title: translate('motivations.modal.title'),
          schema: formStep.schema,
          onSubmit: (motivation) =>
            props.askForApikeys({ team, plan, apiKey, motivation }),
          actionLabel: translate('Send'),
          value: apiKey?.customMetadata,
          description: formStep.info ? <div className='alert alert-info' dangerouslySetInnerHTML={{ __html: formStep.info }} /> : <></>
        });
      } else {
        props.askForApikeys({ team, plan: plan, apiKey }).then(() => close());
      }
    };

    type IUsagePlanGQL = {
      _id: string;
      customName: string;
      otoroshiTarget: {
        otoroshiSettings: string;
        apikeyCustomization?: {
          readOnly?: boolean;
        };
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

          // group every candidate subscription by its keyring : a keyring can
          // be joined only if ALL its members are compatible with the joining
          // plan (mirror of backend controlSubscriptionExtension)
          const byKeyring = new Map<string, typeof int>();
          for (const i of int) {
            const id = i.subscription.keyring?._id;
            if (!i.plan || !id) continue;
            if (!byKeyring.has(id)) byKeyring.set(id, []);
            byKeyring.get(id)!.push(i);
          }

          const joiningOtoroshi = plan?.otoroshiTarget?.otoroshiSettings;
          const joiningReadOnly = !!plan?.otoroshiTarget?.apikeyCustomization?.readOnly;
          const envSecurity = tenant.environmentAggregationApiKeysSecurity;
          const effectiveReadOnly = (i: (typeof int)[number]) =>
            i.subscription.customReadOnly ??
            !!i.plan?.otoroshiTarget?.apikeyCustomization?.readOnly;

          const keyrings = [...byKeyring.entries()]
            .filter(([, members]) =>
              members.every(
                (m) =>
                  // same Otoroshi instance
                  m.plan?.otoroshiTarget?.otoroshiSettings === joiningOtoroshi &&
                  // environment aggregation security : same plan name
                  (!envSecurity || m.subscription.planName === plan.customName) &&
                  // uniform readOnly across the keyring
                  effectiveReadOnly(m) === joiningReadOnly
              )
            )
            .map(([id, members]) => {
              const rep = members[0].subscription;
              return {
                keyringId: id,
                apiName: rep.apiName,
                planName: rep.planName,
                customName: rep.customName,
                count: members.length,
                aggregated: members.length > 1,
                subscription: rep,
              };
            });

          if (
            !tenant.aggregationApiKeysSecurity || !plan.aggregationApiKeysSecurity ||
            keyrings.length <= 0
          ) {
            askForApikeys(team, plan);
          } else {
            openKeyringSelectModal({
              plan,
              keyrings,
              onSubscribe: () => askForApikeys(team, plan),
              onSelectKeyring: (subscription: ISubscription) =>
                askForApikeys(team, plan, subscription),
            });
          }
        }
      );
  };

  const authorizedTeams = props.myTeams
    .filter((t) => !tenant.subscriptionSecurity || t.type !== 'Personal')
    .filter(
      (t) =>
        props.api.visibility === 'Public' ||
        props.api.authorizedTeams.includes(t._id) ||
        t._id === props.ownerTeam._id
    )
    .filter(
      (t) =>
        plan.visibility === 'Public' ||
        plan.authorizedTeams.map(team => team._id).includes(t._id) ||
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

  const openTeamSelectorModal = (plan: IUsagePlanGQL) => {
    openCustomModal({
      title: translate('team.selection.title'),
      content: <TeamSelector
        teams={authorizedTeams
          .filter((t) => t.type !== 'Admin' || props.api.visibility === 'AdminOnly')
          .filter((team) => plan.visibility === 'Public' || team._id === props.ownerTeam._id || plan.authorizedTeams.some(at => at._id === team._id))
          .filter((t) => !tenant.subscriptionSecurity || t.type !== 'Personal')}
        pendingTeams={props.inProgressDemands.map((s) => s.team)}
        acceptedTeams={props.subscriptions
          .filter((f) => !f._deleted)
          .filter(s => s.plan === plan._id)
          .map((subs) => subs.team)}
        allowMultipleDemand={plan.allowMultipleKeys}
        showKeyringSelectModal={showKeyringSelectModal}
        plan={plan}
      />
    })
  }

    return ({
      otoroshiTargetIsDefined, otoroshiEntitiesIsDefined,
      isAccepted,
      authorizedTeams,
      openTeamSelectorModal,
      isAutomaticProcess
    })
  }


  const actions = (plan: IUsagePlanGQL) => {
    const setupPayment = (plan: IUsagePlanGQL) => {
      return Services.setupPayment(props.ownerTeam._id, props.api._id, props.api.currentVersion, convertIUsagePlanGQLToIUsagePlan(plan))
        .then((response) => {
          if (isError(response)) {
            toast.error(translate(response.error));
          } else {
            toast.success(translate('plan.payment.setup.successful'));
            closeRightPanel();
            queryClient.invalidateQueries({ queryKey: ['plans'] })
          }
        });
    }
    const paths = {
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
    }
    const otoroshiSchema = (planForEdition: IUsagePlanGQL) => ({
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
              if (planForEdition.aggregationApiKeysSecurity) {
                return `${translate('Read only apikey')} (${translate('disabled.due.to.aggregation.security')})`;
              } else {
                return translate('Apikey with clientId only');
              }
            },
            disabled: () =>
              !!planForEdition.aggregationApiKeysSecurity,
            onChange: ({ setValue, value }) => {
              if (value) {
                setValue('aggregationApiKeysSecurity', false);
              }
            },
          },
          readOnly: {
            type: type.bool,
            label: () => {
              if (planForEdition.aggregationApiKeysSecurity) {
                return `${translate('Read only apikey')} (${translate('disabled.due.to.aggregation.security')})`;
              } else {
                return translate('Read only apikey');
              }
            },
            disabled: () => !!planForEdition.aggregationApiKeysSecurity,
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
                ...paths,
              },
              forbidden: {
                label: translate('Forbidden pathes'),
                visible: ({ rawValues }) =>
                  rawValues.apikeyCustomization
                    .restrictions.enabled,
                deps: [
                  'apikeyCustomization.restrictions.enabled',
                ],
                ...paths,
              },
              notFound: {
                label: translate('Not found pathes'),
                visible: ({ rawValues }) =>
                  rawValues.apikeyCustomization
                    .restrictions.enabled,
                deps: [
                  'apikeyCustomization.restrictions.enabled',
                ],
                ...paths,
              },
            },
          },
        },
      },
    })
    return {
      duplicatePlan: () => {
        const clone: IUsagePlanGQL = {
          ...cloneDeep(plan),
          _id: nanoid(32),
          customName: `${plan.customName} (copy)`,
          paymentSettings: undefined,
        };
        updatePlan(convertIUsagePlanGQLToIUsagePlan(clone), true)
      },
      deleteWithConfirm: () => {
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
          onSubmit: () => Services.deletePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, convertIUsagePlanGQLToIUsagePlan(plan))
            .then(() => queryClient.invalidateQueries({ queryKey: ["plans"] }))
            .then(() => toast.success(translate({
              key: `delete.${displayType}.successful.toast.label`,
              replacements: [plan.customName]
            })))
            .then(() => closeRightPanel()),
          actionLabel: translate('Confirm')
        })
      },
      editPlan: () => {
        updatePlan(convertIUsagePlanGQLToIUsagePlan(plan))
      },
      editQuotas: () => {
        if (userCanUpdatePlan)
          openRightPanel({
            title: translate("api.pricings.quotas.table.title"),
            content: <QuotasForm ownerTeam={props.ownerTeam} plan={plan} savePlan={savePlan} />
          })
      },
      editPricing: () => {
        if (userCanUpdatePlan)
          openRightPanel({
            title: translate("api.pricings.pricing.table.title"),
            content: <BillingForm
              ownerTeam={props.ownerTeam}
              plan={plan}
              savePlan={setupPayment} />
          })
      },
      editOtoroshiTarget: () => openRightPanel({
        title: translate('api.pricings.otoroshi.target.table.title'),
        content: <Form
          schema={otoroshiSchema(plan)}
          value={plan.otoroshiTarget}
          onSubmit={(otoroshiTarget) => {
            savePlan(convertIUsagePlanGQLToIUsagePlan({ ...plan, otoroshiTarget }))
          }}
        />
      }),
      editProcess: () => {
        openRightPanel({
          title: translate("api.pricings.subscription.process.table.title"),
          content: <SubscriptionProcessEditor
            save={updatedProcess => {
              return Promise.resolve(savePlan(convertIUsagePlanGQLToIUsagePlan({ ...plan, subscriptionProcess: updatedProcess })))
            }}
            process={plan.subscriptionProcess}
            team={props.ownerTeam._id}
            tenant={tenant}
          />
        })
      }
    }
  }

  const columnHelper = createColumnHelper<IUsagePlanGQL>();
  const columns: ((ColumnDef<IUsagePlanGQL, any>))[] = useMemo((): ((ColumnDef<IUsagePlanGQL, any>))[] => {

    return [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      }),
      columnHelper.display({
        id: 'plan',
        meta: {
          className: "plan-cell",
          title: tenant.display === 'environment'
                          ? translate('api.pricings.name.table.env')
                          : translate('api.pricings.name.table.title'),
          size: 6 },
        cell: (info) => {
          const plan: IUsagePlanGQL = info.cell.row.original
          return (
            <div>
              {plan.customName}
            </div>
          )
        }
      }),
      columnHelper.display({
        id: 'description',
        meta: { className: "description-cell", title: translate('api.pricings.description.table.title'), size: 10 },
        cell: (info) => {
          const plan: IUsagePlanGQL = info.cell.row.original
          return (
            <div>
              {plan.customDescription}
            </div>
          )
        }
      }),
      columnHelper.display({
        id: 'quotas',
        meta: { className: "quotas-cell", title: translate('api.pricings.quotas.table.title'), size: 5 },
        cell: (info) => {
          const plan: IUsagePlanGQL = info.cell.row.original
          return (
            <div className='feature__description'>
              {!plan.maxPerMonth && translate('plan.limits.unlimited')}
              {!!plan.maxPerMonth && translate({
                key: 'api.pricings.quotas.value', replacements: [
                  String(plan.maxPerSecond), String(plan.maxPerDay), String(plan.maxPerMonth)
                ]
              })}
            </div>
          )
        }
      }),
      columnHelper.display({
        id: 'tarifs',
        meta: { className: "tarifs-cell", title: translate('api.pricings.pricing.table.title'), size: 5 },
        cell: (info) => {
          const plan: IUsagePlanGQL = info.cell.row.original
          return (
            <span className='feature__description'>
              {renderPricing(plan, translate)}
            </span>
          )
        }
      }),
      columnHelper.display({
        id: 'otoroshi-cible',
        meta: { className: "otoroshi-cible-cell", title: translate('api.pricings.otoroshi.target.table.title'), size: 7 },
        cell: (info) => {
          const plan: IUsagePlanGQL = info.cell.row.original

          return (
            <Can I={manage} a={API} team={props.ownerTeam}>
              <span className='feature__description'>
                {plan.otoroshiTarget?.otoroshiSettings && (tenant.otoroshiSettings.find(o => o._id === plan.otoroshiTarget?.otoroshiSettings)?.url)}
                {!plan.otoroshiTarget?.otoroshiSettings && translate('api.pricings.otoroshi.target.value.none')}
              </span>
            </Can>
          )
        }
      }),
      columnHelper.display({
        id: 'process',
        meta: { className: "process-cell", title: translate('api.pricings.subscription.process.table.title'), size: 5 },
        cell: (info) => {
          const plan: IUsagePlanGQL = info.cell.row.original
          return (
            <Can I={manage} a={API} team={props.ownerTeam}>
              <span className='feature__description'>{plan.subscriptionProcess.length ?
                translate({
                  key: 'api.pricings.process.value',
                  replacements: [String(plan.subscriptionProcess.length)]
                }) :
                translate('api.pricings.process.value.none')}</span>
            </Can>
          )
        }
      }),
      columnHelper.display({
        id: 'action',
        meta: { className: "action-cell", title: translate('api.pricings.name.table.actions'), size: 4 },
        cell: (info) => {

          const plan: IUsagePlanGQL = info.cell.row.original
          const {
            otoroshiTargetIsDefined,
            otoroshiEntitiesIsDefined,
            isAccepted,
            authorizedTeams,
            openTeamSelectorModal,
            isAutomaticProcess
          } = otoroshiTargetColumn(plan)

          return (
            <div className="d-flex flex-row align-items-center">

              <div className="p-2">
              {
                !connectedUser.isGuest &&
                (!otoroshiTargetIsDefined || !otoroshiEntitiesIsDefined || !isPublish(props.api)) &&
                props.api.visibility !== 'AdminOnly' &&
                (
                  <button
                    type="button"
                    aria-label={translate("Get API key")}
                    className="btn btn-outline-secondary btn-square-sm"
                  >
                    <KeyRound size={16}/>
                  </button>
                )
              }
              {
                ((otoroshiTargetIsDefined && otoroshiEntitiesIsDefined) ||
                  props.api.visibility === 'AdminOnly') &&
                (!isAccepted || props.api.visibility === 'AdminOnly') &&
                isPublish(props.api) &&
                (
                  <Can
                    I={access}
                    a={apikey}
                    teams={authorizedTeams.filter(
                      (team) =>
                        plan.visibility === 'Public' ||
                        team._id === props.ownerTeam._id ||
                        plan.authorizedTeams.some((t) => t._id === team._id)
                    )}
                  >
                    {
                      (props.api.visibility === 'AdminOnly' ||
                        (plan.otoroshiTarget && !isAccepted)) && (
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-square-sm"
                          aria-label={isAutomaticProcess ? translate("Get API key") : translate('Request API key') }
                          onClick={() => openTeamSelectorModal(plan)}
                        >
                          <KeyRound size={16}/>
                        </button>
                      )
                    }
                  </Can>
                )
              }
              {
                connectedUser.isGuest && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-square-sm"
                    aria-label={translate("Get API key")}
                    onClick={() => openLoginOrRegisterModal({ tenant })}
                  >
                    <KeyRound size={16} />
                  </button>
                )
              }
            </div>
              <div className="p-2">
                <Can I={manage} a={API} team={props.ownerTeam}>
                    <div>
                      <button
                        className="btn btn-outline-secondary btn-square-sm"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                        id={`${plan._id}-dropdownMenuButton`}
                      >
                        <EllipsisVertical size={16} />
                      </button>
                    <div className="dropdown-menu" aria-labelledby={`${plan._id}-dropdownMenuButton`}>
                      <span className="dropdown-item cursor-pointer  .ms-1"
                        onClick={() => actions(plan).editPlan()}>
                        <Pencil size={16} />
                        {tenant.display === 'environment'
                          ? translate('pricing.edit.env.btn.label')
                          : translate('Edit plan')}
                      </span>
                      <Can I={manage} a={API} team={props.ownerTeam}>
                        <span className='dropdown-item cursor-pointer'
                          onClick={() => actions(plan).editProcess()}>
                        <Pencil size={16}  />
                          {translate('pricing.edit.process.btn.label')}
                          </span>
                      </Can>
                      {props.api.visibility !== 'AdminOnly' && <>
                        <span
                          className="dropdown-item cursor-pointer"
                          onClick={() => actions(plan).duplicatePlan()}>
                          <CopyPlus size={16}  />
                          {tenant.display === 'environment'
                            ? translate('pricing.clone.env.btn.label')
                            : translate('Duplicate plan')}
                        </span>
                        <span
                          className="dropdown-item cursor-pointer"
                          onClick={() => actions(plan).deleteWithConfirm()}
                        >
                          <Trash2 size={16}  />
                          {tenant.display === 'environment'
                            ? translate('pricing.delete.env.btn.label')
                            : translate('Delete plan')}
                        </span>

                      </>}
                    </div>
                  </div>
                </Can>
              </div>
            </div>
          )
        }
      })
    ] as ColumnDef<IUsagePlanGQL, any>[]
  }, [])

  const displayResponseForSavingApikey = (promises) => {
    Promise.all(promises).then((results) => {
      const alteredApiKeys = results.filter((r) => r !== undefined && r !== null);
      openRightPanel({
        title: translate('api.pricing.created.subscription.panel.title'),
        content: (
          <div>
            {alteredApiKeys.map((alteredApiKey) => {
              if (alteredApiKey.status === 'waiting') {
                return (
                  <div key={alteredApiKey.teamName}>
                    {translate({ key: 'subscription.plan.waiting', replacements: [alteredApiKey.plan.customName, alteredApiKey.teamName] })}
                  </div>
                );
              } else {
                return (
                  <SimpleApiKeyCard
                    key={alteredApiKey.subscription._id}
                    api={alteredApiKey.api}
                    plan={alteredApiKey.plan}
                    apiTeam={alteredApiKey.apiTeam}
                    subscription={alteredApiKey.subscription}
                  />
                );
              }
            })}
          </div>
        )
      });
    });
  }

  return (
    <>
      <DynamicTable<IUsagePlanGQL>
        queryKey={["plans"]}
        columns={columns}
        fetchData={usagePlansFetchData}
        getRowId={plan => plan._id}
        getRowAriaLabel={plan => plan.customName}
        tableClassName="col-12 api_list_container"
        dataClassName="api-table table-rows"
        countLabelKey="Plan"
        isRowSelectable={isPlanSelectable}
        enableRowSelection={true}
        rowSelection={rowSelection}
        setRowSelection={setRowSelection}
        bulkActions={[
          {
            label: translate('mail.apikey.demand.title'),
            onClick: async (plans, selectAll, ctx) => {
              const teamsToDisplay = props.myTeams
                .map(team => {
                  // TODO : display impossible team with an explanation
                  // for instance indicate that a subscription already exist / is pending for a plan
                  const planWithPayment = plans.filter(plan => {
                    plan.subscriptionProcess.some(p => p.type === "payment")
                  });
                  const isTeamAllowedForPaymentPlan = team.verified;

                  const plansNotAllowingMoreSubscriptions = plans.filter(p => {
                    if (p.allowMultipleDemand) {
                      return false;
                    }
                    const existSubscriptionForThisPlan = props.subscriptions.some(s => s.plan === p._id && s.team === team._id);
                    return existSubscriptionForThisPlan;
                  });

                  const plansNotAllowingTeam = plans.filter(plan => {
                    return plan.visibility !== "Public" && plan.authorizedTeams.every(aTeam => aTeam._id !== team._id)
                  });

                  const plansWithPendingDemands = plans.filter(p => !p.allowMultipleDemand)
                    .filter(plan => {
                      props.inProgressDemands.some(demand => demand.plan === plan._id && demand.team === team._id)
                    });

                  let disableCauses: Array<string> = []

                  if (planWithPayment.length > 0 && !isTeamAllowedForPaymentPlan) {
                    disableCauses.push(`Team is not verified, paying plan(s) ${planWithPayment.map((p) => p.customName).join(",")} require verifed team`)
                  }

                  if (props.api.team !== team._id && plansNotAllowingTeam.length > 0) {
                    disableCauses.push(`Plan(s) ${plansNotAllowingTeam.map((p) => p.customName).join(",")} don't allow subscription from team`)
                  }

                  if (plansNotAllowingMoreSubscriptions.length > 0) {
                    disableCauses.push(`Plan(s) ${plansNotAllowingMoreSubscriptions.map((p) => p.customName).join(",")} don't allow more subscription from team`)
                  }

                  if (plansWithPendingDemands.length > 0) {
                    disableCauses.push(`Plan(s) ${plansWithPendingDemands.map((p) => p.customName).join(",")} already have pending key demand for this team`)
                  }

                  return {
                    team: team, disabledFor: disableCauses
                  }
                })

              openCustomModal({
                title: translate('team.selection.title'),
                content: <SimpleTeamSelector
                  teams={teamsToDisplay}
                  showApiKeySelectModal={(teamId) => {
                    Services.getAllTeamSubscriptions(teamId)
                      .then((subscriptions) =>
                        customGraphQLClient.request<{ apis: Array<IApiGQL> }>(Services.graphql.apisByIdsWithPlans,
                          { ids: [...new Set(subscriptions.map((s) => s.api))] },
                        )
                          .then(({ apis }) => ({ apis, subscriptions }))
                      ).then(subscriptionsWithApis => {
                        return findCompatibleSubscriptionForMultiPlanRequest({
                          plans: plans,
                          tenant: tenant,
                          teamApiSubscriptions: subscriptionsWithApis
                        })
                      }).then(compatibleSubscriptionsByPlan => {
                        openFormModal({
                          title: translate("apikey_select_modal.title"),
                          onSubmit: (selectedApiKeyByPlanId) => {
                            const formStep = compatibleSubscriptionsByPlan.at(0)?.plan.subscriptionProcess.find((s) =>
                              s.type === 'form'
                            );
                            if (formStep) {
                              openFormModal({
                                title: translate('motivations.modal.title'),
                                schema: formStep.schema,
                                actionLabel: translate('Send'),
                                value: undefined,
                                description: formStep.info ?
                                  <div className='alert alert-info' dangerouslySetInnerHTML={{ __html: formStep.info }} /> : <></>,
                                onSubmit: (motivation) => {
                                  const promises = compatibleSubscriptionsByPlan.map(({ plan, subscriptions }) => {
                                    const subscriptionId = selectedApiKeyByPlanId[plan._id];
                                    const sub = subscriptions.find((sub) => sub._id === subscriptionId);
                                    return props.askForApikeys({
                                      team: teamId,
                                      plan: convertIUsagePlanGQLToIUsagePlan(plan),
                                      apiKey: sub,
                                      motivation
                                    });
                                  });
                                  displayResponseForSavingApikey(promises)
                                }
                              })
                            } else {
                              const promises = compatibleSubscriptionsByPlan.map(
                                ({ plan, subscriptions }) => {
                                  const subscriptionId = selectedApiKeyByPlanId[plan._id];
                                  const sub = subscriptions.find((sub) => sub._id === subscriptionId)
                                  return props.askForApikeys({ team: teamId, plan: convertIUsagePlanGQLToIUsagePlan(plan), apiKey: sub })
                                }
                              )
                              displayResponseForSavingApikey(promises)
                              close()
                            }
                          }
                          ,
                          actionLabel: translate('Confirm'),
                          noClose: true,
                          schema: compatibleSubscriptionsByPlan.reduce((acc, { plan, subscriptions }) => {
                            acc[plan._id] = {
                              type: "string",
                              label: plan.customName,
                              format: "select",
                              defaultValue: "----",
                              options:
                                [{ label: translate("aggregation.button.subscription.usual.label"), value: "----" },
                                ...(subscriptions.map((s) =>
                                  ({ label: `${s.apiKey.clientName} : ${s._id}`, value: s._id })
                                ))
                                ]
                            }
                            return acc;
                          }
                            , {}
                          )
                        })
                      });
                  }}
                />
              })
            },
          },
        ]}
        toolbar={
          <>
                <button
                  type='button'
                  onClick={() => createNewPlan()}
                  className="btn btn-outline-primary d-flex align-items-center gap-2">
                  <Plus />
                  <p className="m-0">{translate('api.pricings.creation.button.label')}</p>
                </button>

          </>
        }
      />
    </>
  );
};


function convertIUsagePlanGQLToIUsagePlan(plan: IUsagePlanGQL): IUsagePlan {
  return { ...plan, authorizedTeams: plan.authorizedTeams.map(team => team._id) };
}

function findCompatibleSubscriptionForMultiPlanRequest(
  { plans,
    tenant,
    teamApiSubscriptions }:
    {
      plans: IUsagePlanGQL[],
      tenant: ITenant,
      teamApiSubscriptions: { apis: IApiGQL[], subscriptions: ISubscriptionWithApiInfo[] }
    }
): { plan: IUsagePlanGQL, subscriptions: ISubscriptionWithApiInfo[] }[] {

  const { apis, subscriptions } = teamApiSubscriptions;

  const int = subscriptions.map((subscription) => {
    const api = apis.find((a) => a._id === subscription.api);
    const plan = Option(api?.possibleUsagePlans)
      .flatMap((plans) =>
        Option(plans.find((plan) => plan._id === subscription.plan))
      )
      .getOrNull();
    return { subscription, api, plan };
  });

  const possibleKeysByPlanId = plans.map(plan => {
    const filteredApiKeys = int
      .filter(
        (infos) =>
          infos.plan?.otoroshiTarget?.otoroshiSettings === plan?.otoroshiTarget?.otoroshiSettings &&
          (infos.plan?.aggregationApiKeysSecurity)
      )
      .filter(s => !tenant.environmentAggregationApiKeysSecurity || s.subscription.planName === plan.customName)
      .filter(s => !s.subscription.parent)
      .map((infos) => infos.subscription);

    return { plan: plan, subscriptions: filteredApiKeys };
  })
  return possibleKeysByPlanId;
}
