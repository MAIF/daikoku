import { getApolloContext } from '@apollo/client';
import { constraints, format, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import cloneDeep from 'lodash/cloneDeep';
import difference from 'lodash/difference';
import find from 'lodash/find';
import { nanoid } from 'nanoid';
import { useContext, useEffect, useState } from 'react';
import More from 'react-feather/dist/icons/more-vertical';
import { Link, useMatch, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { currencies } from '../../../services/currencies';
import {
  IApi,
  IBaseUsagePlan,
  IOtoroshiSettings,
  ISubscription,
  ISubscriptionDemand,
  ISubscriptionWithApiInfo,
  ITeamSimple,
  IUsagePlan,
  UsagePlanVisibility,
  isError,
  isMiniFreeWithQuotas,
  isValidationStepTeamAdmin,
} from '../../../types';
import { CustomMetadataInput, OtoroshiEntitiesSelector } from '../../backoffice/apis/TeamApiPricings';
import {
  api as API,
  Can,
  IMultistepsformStep,
  MultiStepForm,
  Option,
  Spinner,
  access,
  apikey,
  isPublish,
  isSubscriptionProcessIsAutomatic,
  manage,
  renderPlanInfo,
  renderPricing
} from '../../utils';
import { formatPlanType } from '../../utils/formatters';
import { ApiDocumentation } from './ApiDocumentation';
import { ApiRedoc } from './ApiRedoc';
import { ApiSwagger } from './ApiSwagger';

export const currency = (plan?: IBaseUsagePlan) => {
  if (!plan) {
    return ''; //todo: return undefined
  }
  const cur = find(currencies, (c) => c.code === plan.currency.code);
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
};

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
  const { client } = useContext(getApolloContext());

  const { connectedUser, tenant } = useContext(GlobalContext);
  const queryClient = useQueryClient();

  const showApiKeySelectModal = (team: string) => {
    const { plan } = props;

    //FIXME: not bwaaagh !!
    if (!client) {
      return;
    }

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
        client
          .query({
            query: Services.graphql.apisByIdsWithPlans,
            variables: { ids: [...new Set(subscriptions.map((s) => s.api))] },
          })
          .then(({ data }) => ({ apis: data.apis, subscriptions }))
      )
      .then(
        ({
          apis,
          subscriptions,
        }: {
          apis: Array<IApiGQL>;
          subscriptions: Array<ISubscriptionWithApiInfo>;
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

  //   const displaySubscription = () => {
  //     Services.getMySubscriptions(props.api._id, props.api.currentVersion)
  //       .then(r => {
  //         openRightPanel({
  //           title: "test",
  //           content: <div>
  //             {r.subscriptions.map(subscription => {
  //               return (
  //                 <ApiKeyCard
  //                   api={props.api}
  //                   apiLink={""}
  //                   statsLink={`/`}
  //                   key={subscription.apiKey.clientId}
  //                   subscription={{
  //                     ...subscription, 
  //                     parentUp: false,
  //                     planType: "",
  //                     planName: "planname",
  //                     apiName: "apiName",
  //                     _humanReadableId: "hrid",
  //                     children: []
  // }}
  //                   subscribedApis={[]}
  //                   updateCustomName={() => Promise.resolve()}
  //                   toggle={console.debug}
  //                   makeUniqueApiKey={console.debug}
  //                   deleteApiKey={console.debug}
  //                   toggleRotation={(
  //                     plan,
  //                     enabled,
  //                     rotationEvery,
  //                     gracePeriod
  //                   ) =>
  //                     Promise.resolve()
  //                   }
  //                   regenerateSecret={console.debug}
  //                   transferKey={console.debug}
  //                 />
  //               )
  //             })}
  //           </div>
  //         })
  //       })
  //   }

  const isDefault = plan._id === props.api.defaultUsagePlan

  const editPlan = () => props.updatePlan(props.plan)
  const deleteWithConfirm = () => confirm({
    message: "ok ?"
  }).then(ok => {
    if (ok) {
      Services.deletePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, props.plan)
        .then(() => queryClient.invalidateQueries({ queryKey: ["plans"]}))
        .then(() => toast.success(translate('delete.plan.sucessful')))
    }
  })
    .then(closeRightPanel)


  const toggleVisibility = () => {
    if (props.api.defaultUsagePlan !== plan._id) {
      const originalVisibility = plan.visibility;
      const visibility = originalVisibility === UsagePlanVisibility.public ? UsagePlanVisibility.private : UsagePlanVisibility.public;
      const updatedPlan = { ...plan, visibility };
      // savePlan(updatedPlan);
      console.debug("save plan", { updatedPlan })
    }
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
            {!isDefault && (
              <span
                onClick={toggleVisibility}
                className="dropdown-item cursor-pointer"
              >
                {plan.visibility === UsagePlanVisibility.public && (
                  <Translation i18nkey="Make it private">
                    Make it private
                  </Translation>
                )}
                {plan.visibility === UsagePlanVisibility.private && (
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
        {/* <div
          className="dropdown"
          style={{
            position: 'absolute',
            top: '0',
            right: '15px',
            zIndex: '100',
          }}
        >
          <i
            className="fa fa-ellipsis-vertical cursor-pointer dropdown-menu-button"
            style={{ fontSize: '20px' }}
            data-bs-toggle="dropdown"
            aria-expanded="false"
            id="dropdownMenuButton"
          />
          <div className="dropdown-menu" aria-labelledby="dropdownMenuButton">
            <span
              className="dropdown-item cursor-pointer"
              onClick={() => displaySubscription()}
            >
              voir mes clés d'apis
            </span>
          </div>
        </div> */}
        <span>{plan.customName || formatPlanType(plan, translate)}</span>
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
            {!isMiniFreeWithQuotas(plan) && translate('plan.limits.unlimited')}
            {isMiniFreeWithQuotas(plan) && (
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

export const ApiPricing = (props: ApiPricingProps) => {

  const { openRightPanel, closeRightPanel, openCustomModal, close, openApiSelectModal } = useContext(ModalContext);
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
          .then(() => toast.success('create.plan.succesful.toast.label'))
      )
    } else {
      return (
        Services.updatePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, plan)
          .then(() => toast.success('update.plan.succesful.toast.label'))
      )

    }
  }

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
  const planTypes = [
    'FreeWithoutQuotas',
    'FreeWithQuotas',
    'QuotasWithLimits',
    'QuotasWithoutLimits',
    'PayPerUse',
  ];
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
  const steps = (
    planForEdition: IUsagePlan,
    plans: IUsagePlan[],
    api: IApi,
    creation: boolean = false
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
          ...customNameSchemaPart(planForEdition, plans, props.api),
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
                disabled: !creation && !!planForEdition?.otoroshiTarget?.otoroshiSettings,
                label: translate('Otoroshi instances'),
                optionsFrom: Services.allSimpleOtoroshis(
                  tenant._id,
                  props.ownerTeam
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

  const updatePlan = (plan: IUsagePlan, creation: boolean = false) => {
    return openRightPanel({
      title: creation ? translate("api.home.create.plan.form.title") : translate("api.home.update.plan.form.title"),
      content: <MultiStepForm<IUsagePlan>
        value={plan}
        steps={steps(
          plan,
          [],
          props.api
        )}
        initial="info"
        creation={creation}
        save={data => savePlan(data, creation)
          .then(closeRightPanel)
          .then(() => queryClient.invalidateQueries({ queryKey: ["plans"] }))
        }
        currentTeam={props.ownerTeam}
        labels={{
          previous: translate('Previous'),
          skip: translate('Skip'),
          next: translate('Next'),
          save: translate('Save'),
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
            <button className='btn btn-outline-info' onClick={() => Services.fetchNewPlan('FreeWithQuotas')
              .then(p => updatePlan(p, true))
              .then(close)}>
              {translate('api.home.create.plan.modal.create.btn.label')}
            </button>
            <button className='btn btn-outline-info' onClick={() =>
              Promise.resolve(() => close())
                .then(() => {
                  openApiSelectModal({
                    api: props.api,
                    teamId: props.ownerTeam._id,
                    onClose: (plan) => {
                      updatePlan({
                        ...cloneDeep(plan),
                        _id: nanoid(32),
                        customName: `${plan.customName} (import)`,
                      })
                    },
                  })
                })}>
              {translate('api.home.create.plan.modal.import.btn.label')}
            </button>
          </div>
        </div>
      })
    } else {
      Services.fetchNewPlan('FreeWithQuotas')
        .then(updatePlan)
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
            .sort((a, b) =>
              (a.customName || a.type).localeCompare(
                b.customDescription || b.type
              )
            )
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
                  (demand) =>
                    demand.api === props.api._id && demand.plan === plan._id
                )}
                askForApikeys={props.askForApikeys}
                updatePlan={updatePlan}
              />
            ))}
          <Can I={manage} a={API} team={props.ownerTeam}>
            <div className='fake-pricing-card col-md-4 card-mb-4 card mb-4 shadow-sm usage-plan__card'
              onClick={createNewPlan} />
          </Can>
        </div>
      );
    }
  } else {
    return <div></div>;
  }
};
