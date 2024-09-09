import { getApolloContext } from '@apollo/client';
import { constraints, format, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import sortBy from 'lodash/sortBy';
import moment from 'moment';
import { useContext, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import {
  I18nContext,
  ModalContext,
  useTeamBackOffice,
} from '../../../contexts';
import * as Services from '../../../services';
import {
  IApi,
  IRotation,
  ISubscription,
  ISubscriptionExtended,
  ITeamSimple,
  IUsagePlan,
  isError
} from '../../../types';
import {
  BeautifulTitle,
  Can,
  PaginatedComponent,
  Spinner,
  apikey,
  formatPlanType,
  read
} from '../../utils';

type ISubscriptionWithChildren = ISubscriptionExtended & {
  children: Array<ISubscriptionExtended>;
};

const DisplayLink = ({ value }: { value: string }) => {
  const [DisplayLink, setDisplayLink] = useState(false)
  const { translate } = useContext(I18nContext);
  return (
    <div>{translate("subscriptions.link.explanation.1")}
      <ol>
        <li>{translate("subscriptions.link.explanation.2")}</li>
        <li>{translate("subscriptions.link.explanation.3")}</li>
        <li>{translate("subscriptions.link.explanation.4")}</li>
      </ol>
      <span className='a-fake' onClick={() => setDisplayLink(!DisplayLink)}>
        <i className={classNames('me-1 fas', {
          'fa-chevron-up': DisplayLink,
          'fa-chevron-down': !DisplayLink,
        })} />
        {DisplayLink ? translate('subscriptions.hide.link'): translate('subscriptions.display.link')}
      </span>
      {DisplayLink && <div className='api-susbcription__display-link'>
        {value}
      </div>}
    </div>
  )
}

export const TeamApiKeysForApi = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice();
  const [searched, setSearched] = useState('');

  const location = useLocation();
  const params = useParams();
  const { client } = useContext(getApolloContext());
  const { translate, Translation } = useContext(I18nContext);
  const { confirm, openFormModal, openCustomModal } = useContext(ModalContext);
  const queryClient = useQueryClient();

  const apiQuery = useQuery({
    queryKey: ['data', 'visibleApi', params.apiId, params.versionId],
    queryFn: () =>
      Services.getTeamVisibleApi(
        (currentTeam as ITeamSimple)._id,
        params.apiId!,
        params.versionId!
      ),
    enabled: !!currentTeam && !isError(currentTeam),
  }); //FIXME: not real IAPI (betterApis with plans & pendingPlans)
  const subsQuery = useQuery({
    queryKey: ['data', 'subscriptions'],
    queryFn: () =>
      Services.getTeamSubscriptions(
        params.apiId!,
        (currentTeam as ITeamSimple)._id,
        params.versionId!
      ),
    enabled: !!currentTeam && !isError(currentTeam),
  });

  const teamQuery = useQuery({
    queryKey: ['data', 'team'],
    queryFn: () => Services.team((apiQuery.data as IApi).team),
    enabled: !!apiQuery.data && !isError(apiQuery.data),
  });

  const subApisQuery = useQuery({
    queryKey: ['data', 'subscriptions', 'apis'],
    queryFn: () => {
      return client?.query<{ apis: IApi[] }>({
        query: Services.graphql.apisByIds,
        variables: {
          ids: [
            ...new Set(
              (subsQuery.data as Array<ISubscription>).map((s) => s.api)
            ),
          ],
        },
      });
    },
    enabled: !!subsQuery.data && !isError(subsQuery.data),
  });

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['data'] });
  }, [location]);

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ApiKeys`;
  }, [currentTeam]);

  if (isLoading) {
    return <Spinner />;
  } else if (currentTeam && !isError(currentTeam)) {
    const updateCustomName = (
      subscription: ISubscription,
      customName: string
    ) => {
      return Services.updateSubscriptionCustomName(
        currentTeam,
        subscription,
        customName
      ).then(() => {
        toast.success(translate("subscription.custom.name.successfuly.updated"))
        queryClient.invalidateQueries({ queryKey: ['data', 'subscriptions'] })
      });
    };

    const toggleApiKey = (subscription: ISubscription) => {
      return Services.archiveApiKey(
        currentTeam._id,
        subscription._id,
        !subscription.enabled
      ).then(() => {
        if (subscription.enabled) {
          toast.success(translate("subscription.successfully.disabled"))
        } else {
          toast.success(translate("subscription.successfully.enabled"))
        }
        queryClient.invalidateQueries({ queryKey: ['data', 'subscriptions'] })
      }
      );
    };

    const makeUniqueApiKey = (subscription: ISubscription) => {
      confirm({
        message: translate('team_apikey_for_api.ask_for_make_unique'),
      }).then((ok) => {
        if (ok)
          Services.makeUniqueApiKey(currentTeam._id, subscription._id).then(
            () => {
              queryClient.invalidateQueries({
                queryKey: ['data', 'subscriptions'],
              });
              toast.success(
                translate(
                  'team_apikey_for_api.ask_for_make_unique.success_message'
                )
              );
            }
          );
      });
    };

    const deleteApiKey = (subscription: ISubscriptionWithChildren) => {
      const afterDeletionFunction = () => {
        queryClient.invalidateQueries({
          queryKey: ["data", "subscriptions"],
        });
        toast.success(
          translate("apikeys.delete.success.message")
        );
      }
      if (subscription.children.length) {
        openFormModal({
          title: translate("apikeys.delete.modal.title"),
          schema: {
            choice: {
              type: type.string,
              format: format.buttonsSelect,
              label: translate("apikeys.delete.choice.label"),
              options: [
                {
                  label: translate("apikeys.delete.choice.promotion"),
                  value: "promotion"
                },
                {
                  label: translate("apikeys.delete.choice.extraction"),
                  value: "extraction"
                },
                {
                  label: translate("apikeys.delete.choice.delete"),
                  value: "delete"
                },
              ]
            },
            childId: {
              type: type.string,
              format: format.select,
              label: translate("apikeys.delete.child.label"),
              options: subscription.children,
              transformer: (s: ISubscriptionExtended) => ({ value: s._id, label: `${s.apiName}/${s.planName}` }),
              visible: (d) => d.rawValues.choice === 'promotion',
            }
          },
          onSubmit: ({ choice, childId }) => openFormModal(
            {
              title: translate("apikeys.delete.confirm.modal.title"),
              schema: {
                validation: {
                  type: type.string,
                  label: translate({ key: "apikeys.delete.confirm.label", replacements: [`${subscription.apiName}/${subscription.customName ?? subscription.planName}`] }),
                  constraints: [
                    constraints.required(translate('constraints.required.value')),
                    constraints.matches(new RegExp(`${subscription.apiName}/${subscription.customName ?? subscription.planName}`), translate('constraints.match.subscription'))
                  ],
                  defaultValue: ""
                }
              },
              actionLabel: translate('Confirm'),
              onSubmit: d => Services.deleteApiSubscription(currentTeam._id, subscription._id, choice, childId)
                .then(afterDeletionFunction)
            }
          ),
          actionLabel: translate('Delete'),
          noClose: true
        })
      } else {
        openFormModal(
          {
            title: translate("apikeys.delete.confirm.modal.title"),
            schema: {
              validation: {
                type: type.string,
                label: translate({ key: "apikeys.delete.confirm.label", replacements: [`${subscription.apiName}/${subscription.customName ?? subscription.planName}`] }),
                constraints: [
                  constraints.required(translate('constraints.required.value')),
                  constraints.matches(new RegExp(`${subscription.apiName}/${subscription.customName ?? subscription.planName}`), translate('constraints.match.subscription'))
                ],
                defaultValue: ""
              }
            },
            actionLabel: translate('Confirm'),
            onSubmit: d => Services.deleteApiSubscription(currentTeam._id, subscription._id, "delete")
              .then(afterDeletionFunction)
          }
        )
      }
    };

    const toggleApiKeyRotation = (
      subscription: ISubscription,
      plan: IUsagePlan,
      enabled: boolean,
      rotationEvery: number,
      gracePeriod: number
    ) => {
      if (plan.autoRotation) {
        toast.error(translate('rotation.error.message'));
        return Promise.resolve();
      }

      return Services.toggleApiKeyRotation(
        currentTeam._id,
        subscription._id,
        enabled,
        rotationEvery,
        gracePeriod
      ).then((r) => {
        toast.success(translate("subscription.rotation.successfully.setup"))
        queryClient.invalidateQueries({ queryKey: ['data', 'subscriptions'] });
      });
    };

    const regenerateApiKeySecret = (subscription: ISubscription) => {
      return confirm({ message: translate('reset.secret.confirm') })
        .then(
          (ok) => {
            if (ok) {
              Services.regenerateApiKeySecret(
                currentTeam._id,
                subscription._id
              ).then(() => {
                queryClient.invalidateQueries({
                  queryKey: ['data', 'subscriptions'],
                });
                toast.success(translate('secret reseted successfully'));
              });
            }
          }
        );
    };

    const transferApiKey = (subscription: ISubscription) => {
      return Services.getSubscriptionTransferLink(currentTeam._id, subscription._id)
        .then((response) => {
          if (isError(response)) {

          } else {
            openCustomModal({
              title: translate("subscriptions.transfer.modal.title"),
              content: <DisplayLink value={response.link} />,
              actions: (close) => <button className='btn btn-outline-info' onClick={() => {
                navigator.clipboard
                  .writeText(response.link)
                  .then(() => {
                    toast.info(translate('credential.copy.success'))
                    close()
                  })
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}><i className='fas fa-link me-1' />{translate("subscriptions.copy.link.button.label")}</button>
            })
          }
        }
        )
    }

    if (
      apiQuery.isLoading &&
      subsQuery.isLoading &&
      teamQuery.isLoading &&
      subApisQuery.isLoading
    ) {
      return <Spinner />;
    } else if (
      apiQuery.data &&
      subsQuery.data &&
      teamQuery.data &&
      subApisQuery.data &&
      !isError(apiQuery.data) &&
      !isError(subsQuery.data) &&
      !isError(teamQuery.data) &&
      !isError(subApisQuery.data)
    ) {
      const api = apiQuery.data;
      const apiTeam = teamQuery.data;
      const subscriptions = subsQuery.data;
      const subscribedApis = subApisQuery.data.data.apis;

      const search = searched.trim().toLowerCase();
      const filteredApiKeys =
        search === ''
          ? subscriptions
          : subscriptions.filter((subs) => {
            if (
              subs.apiKey.clientName
                .replace('-', ' ')
                .toLowerCase()
                .includes(search)
            ) {
              return true;
            } else if (
              subs.customName &&
              subs.customName.toLowerCase().includes(search)
            ) {
              return true;
            } else {
              return formatPlanType(subs.planType, translate)
                .toLowerCase()
                .includes(search);
            }
          });

      const sorted = sortBy(filteredApiKeys, ['plan', 'customName', 'parent']);
      const sortedApiKeys = sorted
        .filter((f) => f.parent)
        .reduce<Array<ISubscriptionWithChildren>>(
          (acc, sub) => {
            return acc.find((a) => a._id === sub.parent)
              ? acc.map((a) => {
                if (a._id === sub.parent) a.children.push(sub);
                return a;
              })
              : [...acc, { ...sub, children: [] }];
          },
          sorted
            .filter((f) => !f.parent)
            .map((sub) => ({ ...sub, children: [] }))
        );

      const apiLink = `/${apiTeam._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/description`;
      return (
        <Can I={read} a={apikey} team={currentTeam} dispatchError>
          {api && apiTeam ? (
            <div className="row">
              <div className="col-12 d-flex align-items-center">
                <h1>
                  <Translation i18nkey="Api keys for">Api keys for</Translation>
                  &nbsp;
                  <Link
                    to={apiLink}
                    className="cursor-pointer"
                  >{api.name}</Link>
                </h1>
              </div>
              <div className="col-12 mt-2 mb-4">
                <input
                  type="text"
                  className="form-control col-5"
                  placeholder={translate('Search your apiKey...')}
                  aria-label="Search your apikey"
                  value={searched}
                  onChange={(e) => setSearched(e.target.value)}
                />
              </div>

              <div className="col-12">
                <PaginatedComponent
                  items={sortedApiKeys}
                  count={5}
                  formatter={(subscription: ISubscriptionWithChildren) => {
                    return (
                      <ApiKeyCard
                        api={api}
                        currentTeam={currentTeam}
                        apiLink={apiLink}
                        statsLink={`/${currentTeam._humanReadableId}/settings/apikeys/${params.apiId}/${params.versionId}/subscription/${subscription._id}/consumptions`}
                        key={subscription.apiKey.clientId}
                        subscription={subscription}
                        subscribedApis={subscribedApis}
                        updateCustomName={(name) =>
                          updateCustomName(subscription, name)
                        }
                        toggle={() => toggleApiKey(subscription)}
                        makeUniqueApiKey={() => makeUniqueApiKey(subscription)}
                        deleteApiKey={() => deleteApiKey(subscription)}
                        toggleRotation={(
                          plan,
                          enabled,
                          rotationEvery,
                          gracePeriod
                        ) =>
                          toggleApiKeyRotation(
                            subscription,
                            plan,
                            enabled,
                            rotationEvery,
                            gracePeriod
                          )
                        }
                        regenerateSecret={() => regenerateApiKeySecret(subscription)}
                        transferKey={() => transferApiKey(subscription)}
                      />
                    );
                  }}
                />
              </div>
            </div>
          ) : null}
        </Can>
      );
    } else {
      return <div>an error occured</div>;
    }
  } else {
    toast.error(error?.message || currentTeam?.error);
  }
};

type ApiKeyCardProps = {
  api: IApi;
  subscription: ISubscriptionWithChildren;
  updateCustomName: (
    name: string
  ) => Promise<void>;
  statsLink: string;
  apiLink: string;
  toggle: () => void;
  makeUniqueApiKey: () => void;
  deleteApiKey: () => void;
  toggleRotation: (
    plan: IUsagePlan,
    enabled: boolean,
    rotationEvery: number,
    graceperiod: number
  ) => Promise<void>;
  regenerateSecret: () => void;
  currentTeam: ITeamSimple;
  subscribedApis: Array<IApi>;
  transferKey: () => void;
};

const ApiKeyCard = ({
  api,
  subscription,
  updateCustomName,
  apiLink,
  statsLink,
  toggle,
  makeUniqueApiKey,
  toggleRotation,
  regenerateSecret,
  deleteApiKey,
  transferKey
}: ApiKeyCardProps) => {
  const apiKeyValues = {
    apikey: `${subscription.apiKey?.clientId}:${subscription.apiKey?.clientSecret}`,
    token: subscription.integrationToken,
    basicAuth: `Basic ${btoa(`${subscription.apiKey?.clientId}:${subscription.apiKey?.clientSecret}`)}`,
  };

  const [showAggregatePlan, setAggregatePlan] = useState(false);

  const { translate, Translation } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext);

  const planQuery = useQuery({
    queryKey: ['plan', subscription.plan],
    queryFn: () =>
      Services.getVisiblePlan(api._id, api.currentVersion, subscription.plan),
  });

  if (planQuery.isLoading) {
    return (
      <div className="col-12 col-sm-6 col-md-4 mb-2">
        <Spinner />
      </div>
    );
  } else if (planQuery.data && !isError(planQuery.data)) {
    const plan = planQuery.data;

    const settingsSchema = {
      enabled: {
        type: type.bool,
        label: translate('Enabled'),
        help: translate('help.apikey.rotation'),
        disabled: plan.autoRotation,
      },
      rotationEvery: {
        type: type.number,
        label: translate('Rotation period'),
        help: translate('help.apikey.rotation.period'),
        disabled: ({ rawValues }: any) => !rawValues.enabled,
        props: { steps: 1, min: 0 },
        constraints: [constraints.positive(translate('constraints.positive'))],
      },
      gracePeriod: {
        type: type.number,
        label: translate('Grace period'),
        help: translate('help.apikey.grace.period'),
        disabled: ({ rawValues }: any) => !rawValues.enabled,
        props: { steps: 1, min: 0 },
        constraints: [
          constraints.positive(translate('constraints.positive')),
          constraints.lessThan(
            constraints.ref<number>('rotationEvery'),
            translate('constraint.apikey.grace.period')
          ),
        ],
      },
    };

    const handleChanges = (rotation: IRotation) => {
      if (subscription.enabled) {
        toggleRotation(
          plan,
          rotation.enabled,
          rotation.rotationEvery,
          rotation.gracePeriod
        )
      }
    };

    const disableRotation =
      api.visibility === 'AdminOnly' || !!plan.autoRotation;


    const _customName = subscription.customName ||
      planQuery.data.customName ||
      planQuery.data.type

    return (
      <div className='api-subscription'>
        <div className="api-subscription__container">
          <div className='api-subscription__icon'>
            <i className={classNames("fa-solid icon", {
              "fa-key": subscription.children.length === 0,
              "fa-box": subscription.children.length > 0
            })} />
            <div className='api-subscription__value__type'>
              {subscription.enabled ? translate("subscription.enable.label") : translate("subscription.disable.label")}
              <div className={classNames('dot', {
                enabled: subscription.enabled,
                disabled: !subscription.enabled,
              })} />
            </div>
          </div>

          <div className='api-subscription__infos'>
            <div className='api-subscription__infos__name'>{_customName}</div>
            <div className='api-subscription__infos__value'>{`${subscription.apiKey.clientId}:${subscription.apiKey.clientSecret}`}</div>
            <div className='d-flex gap-2'>
              <button className='btn btn-sm btn-outline-primary' onClick={() => {
                navigator.clipboard
                  .writeText(`${subscription.apiKey.clientId}:${subscription.apiKey.clientSecret}`)
                  .then(() =>
                    toast.info(translate('credential.copy.success'))
                  )
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}>
                <i className="fa fa-copy me-1" />
                clientId
              </button>
              <button className='btn btn-sm btn-outline-primary' onClick={() => {
                navigator.clipboard
                  .writeText(subscription.integrationToken)
                  .then(() =>
                    toast.info(translate('credential.copy.success'))
                  )
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}>
                <i className="fa fa-copy me-1" />
                token
              </button>
              <button className='btn btn-sm btn-outline-primary' onClick={() => {
                navigator.clipboard
                  .writeText(`Basic ${btoa(`${subscription.apiKey?.clientId}:${subscription.apiKey?.clientSecret}`)}`)
                  .then(() =>
                    toast.info(translate('credential.copy.success'))
                  )
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}>
                <i className="fa fa-copy me-1" />
                basic auth
              </button>
            </div>
            <div className='api-subscription__infos__creation'>{
              translate({
                key: 'subscription.create.at', replacements: [moment(subscription.createdAt).format(translate('moment.date.format.without.hours'))]
              })
            }</div>
          </div>
        </div>
        <div className="api-subscriptions__links">
          {translate("subscription.nota.part.1")}
          <Link className='cursor-pointer underline mx-1' to={apiLink}>{translate("subscription.nota.link.api")}</Link>
          {translate("subscription.nota.part.2")}
          <Link className='cursor-pointer underline mx-1' to={statsLink}>{translate("subscription.nota.link.statistics")}</Link>
        </div>
        <div
          className="dropdown"
          style={{
            position: 'absolute',
            top: '15px',
            right: '15px',
            zIndex: '1000',
          }}
        >
          <i
            className="fa fa-bars cursor-pointer dropdown-menu-button"
            style={{ fontSize: '20px' }}
            data-bs-toggle="dropdown"
            aria-expanded="false"
            id="dropdownMenuButton"
          />
          <div className="dropdown-menu" aria-labelledby="dropdownMenuButton">
            <span
              className="dropdown-item cursor-pointer"
              onClick={() => openFormModal({
                title: translate('Create a new team'),
                actionLabel: translate('Save'),
                schema: {
                  customName: {
                    type: type.string,
                    placeholder: 'custom subscription name',
                    label: 'subscription custom name',
                  }
                },
                onSubmit: (data) => {
                  updateCustomName(data.customName ?? '')
                },
                value: { customName: subscription.customName }
              })}
            >
              {translate("subscription.custom.name.update.label")}
            </span>
            {!subscription.parent && !disableRotation && <span
              className="dropdown-item cursor-pointer"
              onClick={() => openFormModal({
                title: translate("ApiKey rotation"),
                actionLabel: translate('Save'),
                schema: settingsSchema,
                onSubmit: (data) => handleChanges(data),
                value: subscription.rotation
              })}
            >
              {translate("subscription.rotation.update.label")}
            </span>}
            <div className="dropdown-divider" />
            {!subscription.parent && <span
              className="dropdown-item cursor-pointer danger"
              onClick={regenerateSecret}
            >
              {translate("subscription.reset.secret.label")}
            </span>}
            {!subscription.parent && <span
              className="dropdown-item cursor-pointer danger"
              onClick={transferKey}
            >
              transferer la subscription
            </span>}
            <span
              className={classNames("dropdown-item cursor-pointer danger", {
                disabled: subscription.parent && !subscription.parentUp
              })}
              onClick={() => {
                if (subscription.parent && subscription.parentUp) {
                  toggle
                }
              }}
            >
              {subscription.enabled ? translate("subscription.disable.button.label") : translate("subscription.enable.button.label")}
            </span>
            <div className="dropdown-divider" />
            {subscription.parent && <span
              className="dropdown-item cursor-pointer danger"
              onClick={makeUniqueApiKey}
            >
              {translate("subscription.extract.button.label")}
            </span>}
            <span
              className="dropdown-item cursor-pointer danger"
              onClick={deleteApiKey}
            >
              {translate("subscription.delete.button.label")}
            </span>
          </div>
        </div>
      </div>
    )
  } else {
    return <div>Error while fetching usage plan</div>;
  }
};
type HelpProps = {
  message: string;
};
export const Help = ({ message }: HelpProps) => {
  return (
    <BeautifulTitle place="bottom" title={message}>
      <i className="ms-4 far fa-question-circle" />
    </BeautifulTitle>
  );
};
