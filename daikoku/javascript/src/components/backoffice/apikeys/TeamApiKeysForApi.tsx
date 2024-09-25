import { getApolloContext } from '@apollo/client';
import { constraints, format, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import sortBy from 'lodash/sortBy';
import moment from 'moment';
import { useContext, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Key } from 'react-feather/dist/icons/key';

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
        {DisplayLink ? translate('subscriptions.hide.link') : translate('subscriptions.display.link')}
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
      console.debug("toggle")
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
                    className="cursor-pointer underline"
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
  transferKey,
  currentTeam,
  subscribedApis
}: ApiKeyCardProps) => {
  const apiKeyValues = {
    apikey: `${subscription.apiKey?.clientId}:${subscription.apiKey?.clientSecret}`,
    token: subscription.integrationToken,
    basicAuth: `Basic ${btoa(`${subscription.apiKey?.clientId}:${subscription.apiKey?.clientSecret}`)}`,
  };

  const [showAggregatePlan, setAggregatePlan] = useState(false);

  const { translate, Translation } = useContext(I18nContext);
  const { openFormModal, openRightPanel } = useContext(ModalContext);

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
        <div className="api-subscription__container flex-column flex-xl-row">
          <div className='api-subscription__icon flex-row flex-xl-column'>
            {subscription.children.length === 0 && !subscription.parent && <i className={"fa-solid icon fa-key"} />}
            {subscription.children.length === 0 && subscription.parent && <div className='d-flex'><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360.58 409.94" style={{ fill: "var(--level2_text-color, #4c4c4d)", marginBottom: '0.375rem', width : '20px', transform: "rotateZ(-20deg), margin-left: '-1px' , margin-top: '-8px'"}}><g><g><path d="M266.75,122.38a73.49,73.49,0,0,1-76.91,109.85l-14.24,8.51a17.46,17.46,0,0,1-23.86-6L148,228.5l-11.33,6.77-16.37,9.6L102.48,239l-5.76,13.19-8.35,5.16-15.3-5.72L63,279.25l-13.29,7.93L0,265.91l4.29-22.08L117,176.53l-3.71-6.21a17.44,17.44,0,0,1,6-23.86l14.24-8.5A73.59,73.59,0,0,1,187,88.45a89.07,89.07,0,0,0,13.63,43.24,90.16,90.16,0,0,0,6,8.38,26.4,26.4,0,1,0,28.5-23.79q-1.41-1.82-2.66-3.73a52.14,52.14,0,0,1-8.12-23,73.17,73.17,0,0,1,42.41,32.84Zm-4.68-12.55a73.5,73.5,0,0,1-63,126.8l-10.93,6.52v3.18a17.44,17.44,0,0,0,17.43,17.37h7.24L213,395l16.78,15,43.71-31.87,0-15.48-18.64-22.77L267.6,329.6l-.17-9.82L259,308.09l14.2-12.32.12-19,0-13.2h7.24A17.46,17.46,0,0,0,298,246.15l0-16.59a73.5,73.5,0,0,0-35.85-119.73Z"/><path  d="M276.58,0c46.39,0,83.56,37.61,84,84,.11,12.73-4,29.23-8.82,37.65a73.1,73.1,0,0,0-19.85-24.92A28.3,28.3,0,0,0,334.77,84a58.2,58.2,0,1,0-81.9,53.16,27.7,27.7,0,0,1-12.62,22.6A84,84,0,0,1,276.58,0Z"/></g></g></svg><i className={"fa-solid icon fa-key"} style={{transform:"rotateZ(-120deg)"}}/></div> }
            {subscription.children.length > 0 && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 479.79 409.94" style={{ fill: "var(--level2_text-color, #4c4c4d)", marginBottom: '0.375rem', width : '50px', transform: "rotateZ(-20deg)"}}><g><g><path d="M266.75,122.38a73.49,73.49,0,0,1-76.91,109.85l-14.24,8.51a17.46,17.46,0,0,1-23.86-6L148,228.5l-11.33,6.77-16.37,9.6L102.48,239l-5.76,13.19-8.35,5.16-15.3-5.72L63,279.25l-13.29,7.93L0,265.91l4.29-22.08L117,176.53l-3.71-6.21a17.44,17.44,0,0,1,6-23.86l14.24-8.5A73.59,73.59,0,0,1,187,88.45a89.07,89.07,0,0,0,13.63,43.24,90.16,90.16,0,0,0,6,8.38,26.4,26.4,0,1,0,28.5-23.79q-1.41-1.82-2.66-3.73a52.14,52.14,0,0,1-8.12-23,73.17,73.17,0,0,1,42.41,32.84Zm-4.68-12.55a73.5,73.5,0,0,1-63,126.8l-10.93,6.52v3.18a17.44,17.44,0,0,0,17.43,17.37h7.24L213,395l16.78,15,43.71-31.87,0-15.48-18.64-22.77L267.6,329.6l-.17-9.82L259,308.09l14.2-12.32.12-19,0-13.2h7.24A17.46,17.46,0,0,0,298,246.15l0-16.59a73.5,73.5,0,0,0-35.85-119.73Zm-19.56-16A72.93,72.93,0,0,1,257,104.08a73.49,73.49,0,0,1,53.41,117.2L311.53,234l2.86,1.38a17.44,17.44,0,0,0,23.23-8.1l3.15-6.52L459,277.79l20.79-8.57L470.18,216l-13.94-6.73-28.62,6.83L424,200.18l-8.9-4.14-14.18,2.45L396,180.34,379,172l-11.89-5.73,3.15-6.52a17.46,17.46,0,0,0-8.11-23.24l-14.93-7.21A73.51,73.51,0,0,0,242.51,93.84Z"/><path d="M276.58,0c46.39,0,83.56,37.61,84,84,.11,12.73-4,29.23-8.82,37.65a73.1,73.1,0,0,0-19.85-24.92A28.3,28.3,0,0,0,334.77,84a58.2,58.2,0,1,0-81.9,53.16,27.7,27.7,0,0,1-12.62,22.6A84,84,0,0,1,276.58,0Z"/></g></g></svg>
            }
            <div className='api-subscription__value__type ms-2 ms-xl-0'>
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
            <div className='d-flex gap-2 flex-column flex-md-row'>
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
            right: '15px'
          }}
        >
          <i
            className="fa fa-bars cursor-pointer dropdown-menu-button"
            style={{ fontSize: '20px' }}
            data-bs-toggle="dropdown"
            aria-expanded="false"
            id="dropdownMenuButton"
          />
          <div className="dropdown-menu" aria-labelledby="dropdownMenuButton" style={{zIndex:1}}>
            <span
              className="dropdown-item cursor-pointer"
              onClick={() => openFormModal({
                title: translate("subscription.custom.name.update.label"),
                actionLabel: translate('Save'),
                schema: {
                  customName: {
                    type: type.string,
                    placeholder: translate('subscription.custom.name.update.placeholder'),
                    label: translate('subscription.custom.name.update.message'),
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
          
            {subscription.children.length > 0 && <span
              className="dropdown-item cursor-pointer"
              onClick={() => openRightPanel({
                title: translate('team_apikey_aggregatePlans_title'), content: <div className="text-center">
                  <div>
                    {subscription.children.map((aggregate) => {
                      const api = subscribedApis.find(
                        (a) => a._id === aggregate.api
                      );
                      return (
                        <div key={aggregate._id}>
                          <Link
                            to={`/${currentTeam._humanReadableId}/settings/apikeys/${aggregate._humanReadableId}/${api!.currentVersion}`}
                          >
                            {`${aggregate.apiName}/${aggregate.planName || aggregate.planType}`}
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              })}
            >
              {translate("subscription.show.aggregate.label")}
            </span>}
            <div className="dropdown-divider" />
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
            {!subscription.parent && <span
              className="dropdown-item cursor-pointer "
              onClick={transferKey}
            >
              {translate("subscription.transfer.label")}
            </span>}
            <span
              className={classNames("dropdown-item cursor-pointer", {
                disabled: subscription.parent && !subscription.parentUp
              })}
              onClick={() => {
                // if (subscription.parent && subscription.parentUp) {
                toggle()
                // }
              }}
            >
              {subscription.enabled ? translate("subscription.disable.button.label") : translate("subscription.enable.button.label")}
            </span>
            <div className="dropdown-divider" />
            {!subscription.parent && <span
              className="dropdown-item cursor-pointer danger"
              onClick={regenerateSecret}
            >
              {translate("subscription.reset.secret.label")}
            </span>}
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
