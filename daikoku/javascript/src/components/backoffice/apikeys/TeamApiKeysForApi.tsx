import { constraints, format, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import { isBefore } from 'date-fns';
import sortBy from 'lodash/sortBy';
import { useContext, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import {
  I18nContext,
  ModalContext,
  useTeamBackOffice,
} from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import {
  IApi,
  IApiGQL,
  IApiSubscriptionDetails,
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
  escapeRegExp,
  formatDate,
  read
} from '../../utils';
import { apiGQLToLegitApi } from '../../utils/apiUtils';

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

///###########################
///###########################
///###########################
///###########################

export const TeamApiKeysForApi = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice();
  const { Translation } = useContext(I18nContext);

  const params = useParams();

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ApiKeys`;
  }, [currentTeam]);

  const apiQuery = useQuery({
    queryKey: ['data', 'visibleApi', params.apiId, params.versionId],
    queryFn: () =>
      Services.getTeamVisibleApi(
        (currentTeam as ITeamSimple)._id,
        params.apiId!,
        params.versionId!
      ),
    enabled: !!currentTeam && !isError(currentTeam),
  });

  const teamQuery = useQuery({
    queryKey: ['data', 'team'],
    queryFn: () => Services.team((apiQuery.data as IApi).team),
    enabled: !!apiQuery.data && !isError(apiQuery.data),
  });


  if (apiQuery.isLoading || teamQuery.isLoading) {
    return <Spinner />
  } else if (apiQuery.data && !isError(apiQuery.data) && teamQuery.data && !isError(teamQuery.data)) {
    const apiLink = `/${teamQuery.data._humanReadableId}/${apiQuery.data._humanReadableId}/${apiQuery.data.currentVersion}/description`;

    return (
      <div>
        <div className="col-12 d-flex align-items-center">
          <h1>
            <Translation i18nkey="Api keys for">Api keys for</Translation>
            &nbsp;
            <Link
              to={apiLink}
              className="cursor-pointer underline"
            >{apiQuery.data!.name}</Link>
          </h1>
        </div>
        <ApiKeysListForApi
          api={apiQuery.data!}
          team={(currentTeam as ITeamSimple)}
          ownerTeam={teamQuery.data}
        />
      </div>
    )
  }

}

//  ####################################
//  ####################################
//  ####################################
//  ####################################

type ApiKeysListForApiProps = {
  team: ITeamSimple
  api: IApi
  ownerTeam: ITeamSimple,
  linkToChildren?: (api: IApi, teamHrId: string) => string
}
export const ApiKeysListForApi = (props: ApiKeysListForApiProps) => {
  const [searched, setSearched] = useState('');

  const { customGraphQLClient } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);
  const { confirm, openFormModal, openCustomModal } = useContext(ModalContext);
  const queryClient = useQueryClient();


  const subsQuery = useQuery({
    queryKey: ['data', 'subscriptions', props.team, props.api],
    queryFn: () =>
      Services.getTeamSubscriptions(
        props.api._humanReadableId,
        props.team._id,
        props.api.currentVersion
      ),
  });

  const subApisQuery = useQuery({
    queryKey: ['data', 'subscriptions', 'apis'],
    queryFn: () => {
      return customGraphQLClient.request<{ apis: IApiGQL[] }>(
        Services.graphql.apisByIds,
        {
          ids: [
            ...new Set(
              (subsQuery.data as Array<ISubscription>).map((s) => s.api)
            ),
          ],
        })
    },
    enabled: !!subsQuery.data && !isError(subsQuery.data),
  });

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['data'] });
  }, [location]);

  const updateCustomName = (
    subscription: ISubscription,
    customName: string
  ) => {
    return Services.updateSubscriptionCustomName(
      props.team,
      subscription,
      customName
    ).then(() => {
      toast.success(translate("subscription.custom.name.successfuly.updated"))
      queryClient.invalidateQueries({ queryKey: ['data', 'subscriptions'] })
    });
  };

  const toggleApiKey = (subscription: ISubscription) => {
    return Services.archiveApiKey(
      props.team._id,
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

  const makeUniqueApiKey = (subscription: ISubscription, details: IApiSubscriptionDetails) => {

    openFormModal(
      {
        title: translate("apikeys.delete.confirm.modal.title"),
        description: <div className="alert alert-danger" role="alert">
          <h4 className="alert-heading">{translate('Warning')}</h4>
          <p>{translate('team_apikey_for_api.ask_for_make_unique')}</p>
          <ul>
            <li dangerouslySetInnerHTML={{
              __html: translate({
                key: 'team_apikey_for_api.ask_for_make_unique.2', replacements: [
                  `<strong>${details.parentSubscription?.api.name}/${details.parentSubscription?.plan.customName}</strong>`
                ]
              })
            }}></li>
            <li dangerouslySetInnerHTML={{
              __html: translate({
                key: 'team_apikey_for_api.ask_for_make_unique.3', replacements: [
                  `<strong>${details.apiSubscription.api.name}/${details.apiSubscription.plan.customName}</strong>`
                ]
              })
            }}></li>
          </ul>
        </div>,
        schema: {
          validation: {
            type: type.string,
            label: translate({ key: "apikeys.delete.confirm.label", replacements: [`${details.apiSubscription.api.name}/${subscription.customName ?? details.apiSubscription.plan.customName}`] }),
            constraints: [
              constraints.required(translate('constraints.required.value')),
              constraints.matches(new RegExp(`${escapeRegExp(details.apiSubscription.api.name)}/${escapeRegExp(subscription.customName) ?? escapeRegExp(details.apiSubscription.plan.customName)}`), translate('constraints.match.subscription'))
            ],
            defaultValue: ""
          }
        },
        actionLabel: translate('Confirm'),
        onSubmit: () => Services.makeUniqueApiKey(props.team._id, subscription._id)
          .then(
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
          )
      }
    )
  };

  const deleteApiKey = (subscription: ISubscriptionWithChildren, details: IApiSubscriptionDetails) => {
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
            description: <div className="alert alert-danger" role="alert">
              <h4 className="alert-heading">{translate('Warning')}</h4>
              <p>{translate("delete.subscription.confirm.modal.description.1")}</p>
              {!details.parentSubscription && choice === 'delete' && <>
                <p>{translate("delete.subscription.confirm.modal.description.parent.deleteAll")}</p>
                <p>{translate("delete.subscription.confirm.modal.description.parent.deleteAll.list")}</p>
                <ul>
                  {details.accessibleResources.map(resource => (<li>{resource.apiSubscription.api.name}/{resource.apiSubscription.plan.customName}</li>))}
                </ul>
              </>}

              {!details.parentSubscription && choice === 'extraction' && <>
                <p>{translate("delete.subscription.confirm.modal.description.parent.splitChildren")}</p>
                <p>{translate("delete.subscription.confirm.modal.description.parent.splitChildren.list")}</p>
                <ul>
                  {details.accessibleResources.map(resource => (<li>{resource.apiSubscription.api.name}/{resource.apiSubscription.plan.customName}</li>))}
                </ul>
              </>}

              {!details.parentSubscription && choice === 'promotion' &&
                <p dangerouslySetInnerHTML={{
                  __html: translate({
                    key: "delete.subscription.confirm.modal.description.parent.promoteChild",
                    replacements: [
                      `<strong>${details.accessibleResources.find(r => r.apiSubscription._id === childId)?.apiSubscription.api.name}/${details.accessibleResources.find(r => r.apiSubscription._id === childId)?.apiSubscription.plan.customName}</strong>`,
                      `<strong>${details.apiSubscription.api.name}/${details.apiSubscription.plan.customName}</strong>`
                    ]
                  })
                }}></p>}
            </div>,
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
            onSubmit: d => Services.deleteApiSubscription(props.team._id, subscription._id, choice, childId)
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
          description: <div className="alert alert-danger" role="alert">
            <h4 className="alert-heading">{translate('Warning')}</h4>
            <p>{translate("delete.subscription.confirm.modal.description.1")}</p>
            <ul>
              {!details.parentSubscription && <p>{translate("delete.subscription.confirm.modal.description.single")}</p>}
              {!!details.parentSubscription &&
                <li dangerouslySetInnerHTML={{
                  __html:
                    translate({
                      key: "delete.subscription.confirm.modal.description.child",
                      replacements: [
                        `<strong>${details.parentSubscription.api.name
                        } / ${details.parentSubscription.plan.customName}</strong>`,
                        `<strong>${details.apiSubscription.api.name}/${details.apiSubscription.plan.customName}</strong>`,
                      ]
                    })
                }}></li>}
            </ul>
          </div>,
          schema: {
            validation: {
              type: type.string,
              label: translate({ key: "apikeys.delete.confirm.label", replacements: [`${subscription.apiName}/${subscription.customName ?? subscription.planName}`] }),
              constraints: [
                constraints.required(translate('constraints.required.value')),
                constraints.matches(new RegExp(`${escapeRegExp(subscription.apiName)}/${escapeRegExp(subscription.customName) ?? escapeRegExp(subscription.planName)}`), translate('constraints.match.subscription'))
              ],
              defaultValue: ""
            }
          },
          actionLabel: translate('Confirm'),
          onSubmit: d => Services.deleteApiSubscription(props.team._id, subscription._id, "delete")
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
      props.team._id,
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
              props.team._id,
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
    return Services.getSubscriptionTransferLink(props.team._id, subscription._id)
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
    subsQuery.isLoading ||
    subApisQuery.isLoading
  ) {
    return <Spinner />;
  } else if (
    subsQuery.data &&
    subApisQuery.data &&
    !isError(subsQuery.data) &&
    !isError(subApisQuery.data)
  ) {
    const subscriptions = subsQuery.data;
    const subscribedApis = subApisQuery.data.apis;

    const search = searched.trim();

    const filteredApiKeys =
      search === ''
        ? subscriptions
        : subscriptions.filter((subs) => {
          return subs.apiKey.clientName === search ||
            subs.apiKey.clientId === search ||
            subs.customName?.toLocaleLowerCase() === search.toLocaleLowerCase() ||
            subs.planName.toLowerCase().includes(search.toLocaleLowerCase()) ||
            subs.tags.map(t => t.toLocaleLowerCase()).includes(search.toLocaleLowerCase())
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

    const apiLink = `/${props.ownerTeam._humanReadableId}/${props.api._humanReadableId}/${props.api.currentVersion}/description`;
    return (
      <Can I={read} a={apikey} team={props.team} dispatchError>
        <div className="col-6 mt-4 mb-2">
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
                  api={props.api}
                  currentTeam={props.team}
                  apiLink={apiLink}
                  statsLink={`/${props.team._humanReadableId}/settings/apikeys/${props.api._id}/${props.api.currentVersion}/subscription/${subscription._id}/consumptions`}
                  key={subscription._id}
                  subscription={subscription}
                  subscribedApis={subscribedApis}
                  updateCustomName={(name) =>
                    updateCustomName(subscription, name)
                  }
                  toggle={() => toggleApiKey(subscription)}
                  makeUniqueApiKey={(details: IApiSubscriptionDetails) => makeUniqueApiKey(subscription, details)}
                  deleteApiKey={(detail: IApiSubscriptionDetails) => deleteApiKey(subscription, detail)}
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
                  handleTagClick={(tag) => setSearched(tag)}
                  linkToChildren={props.linkToChildren}
                />
              );
            }}
          />
        </div>
      </Can>
    );
  } else {
    return <div>an error occured</div>;
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
  makeUniqueApiKey: (details: IApiSubscriptionDetails) => void;
  deleteApiKey: (details: IApiSubscriptionDetails) => void;
  toggleRotation: (
    plan: IUsagePlan,
    enabled: boolean,
    rotationEvery: number,
    graceperiod: number
  ) => Promise<void>;
  regenerateSecret: () => void;
  currentTeam?: ITeamSimple;
  subscribedApis: Array<IApiGQL>;
  transferKey: () => void;
  handleTagClick: (tag: string) => void
  linkToChildren?: (api: IApi, teamHrId: string) => string
};

export const ApiKeyCard = ({
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
  subscribedApis,
  handleTagClick,
  linkToChildren
}: ApiKeyCardProps) => {
  const { translate } = useContext(I18nContext);
  const { customGraphQLClient } = useContext(GlobalContext);
  const { openFormModal, closeRightPanel, openCustomModal } = useContext(ModalContext);
  const { tenant } = useContext(GlobalContext);

  const [more, setMore] = useState(false)

  const API_SUBSCRIPTION_DETAIL_QUERY = `
    query getApiSubscriptionDetails ($subscriptionId: String!, $teamId: String!) {
      apiSubscriptionDetails (subscriptionId: $subscriptionId, teamId: $teamId) {
        apiSubscription {
          _id
          api { name }
          plan { 
            customName
            autoRotation
          }
          parent { _id }
          customName
        }
        parentSubscription {
          _id
          customName
          api {
            _id
            _humanReadableId
            name
            tenant {
              id
            }
            team {
              _id
              _humanReadableId
            }
            currentVersion
          }
          plan {
            customName
          }
        }
        accessibleResources {
          api {
            _id
            _humanReadableId
            name
            tenant { 
              id 
            }
            team { 
              _id
              _humanReadableId
            }
            currentVersion
          }
          apiSubscription {
            _id
            customName
            api { 
              _id
              name
            }
            tenant {
              id
            }
            team {
              _id
              _humanReadableId
            }
            plan { 
              _id  
              customName 
            }
          }
          usagePlan {
            _id
            customName
          }
        }
      }
    }
    `;

  const detailQuery = useQuery({
    queryKey: ['parent', subscription._id, currentTeam?._id ?? 'no-team'],
    queryFn: () => customGraphQLClient.request<{ apiSubscriptionDetails: IApiSubscriptionDetails }>(API_SUBSCRIPTION_DETAIL_QUERY, {
      subscriptionId: subscription._id, teamId: currentTeam?._id ?? 'no-team'
    }),
    select: d => d.apiSubscriptionDetails,
  })

  if (detailQuery.isLoading) {
    return (
      <div className="col-12 col-sm-6 col-md-4 mb-2">
        <Spinner />
      </div>
    );
  } else if (detailQuery.data) {
    const plan = detailQuery.data.apiSubscription.plan;

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

    const disableRotation = api.visibility === 'AdminOnly' || !!plan.autoRotation;

    const _customName = subscription.customName || plan.customName

    const nbChildsDisplay = 2;
    const getPartOfChildren = (start: number, end: number) => [...detailQuery.data.accessibleResources]
      .splice(start, end)
      .map((detail) => {
        return (
          <Link
            key={`${subscription._id}-${detail.apiSubscription._id}`}
            className='ms-1'
            onClick={closeRightPanel}
            to={linkToChildren ?
              linkToChildren(apiGQLToLegitApi(detail.api, tenant), detail.api.team._humanReadableId) :
              `/${currentTeam?._humanReadableId}/settings/apikeys/${detail.api._humanReadableId}/${api!.currentVersion}`}
          >
            {`${detail.api.name}/${detail.usagePlan.customName}`}
          </Link>
        );
      })

    const isApiCMS = api.visibility === "AdminOnly" && api.name.includes("cms");

    return (
      <div className='api-subscription'>
        <div className="api-subscription__container flex-column flex-xl-row gap-3">
          <div className='api-subscription__icon flex-row flex-xl-column'>
            {subscription.children.length === 0 && <i className={"fa-solid icon fa-key"} />}
            {subscription.children.length > 0 && <svg
              width="32"
              viewBox="-18.91 0 122.88 122.88"
              version="1.1"
              style={{ fill: "var(--level2_text-color, #4c4c4d)", marginBottom: '0.375rem' }}
            >
              <path d="M60.78,43.44c-1.49,0.81-3.35,0.26-4.15-1.22c-0.81-1.49-0.26-3.35,1.23-4.15c7.04-3.82,10.32-8.76,10.98-13.59 c0.35-2.58-0.05-5.17-1.02-7.57c-0.99-2.43-2.56-4.64-4.55-6.42c-3.87-3.46-9.3-5.28-14.97-3.87c-2.3,0.57-4.29,1.72-6.03,3.34 c-1.85,1.72-3.45,3.97-4.85,6.63c-0.79,1.5-2.64,2.07-4.13,1.29c-1.5-0.79-2.07-2.64-1.29-4.13c1.72-3.26,3.73-6.06,6.11-8.28 c2.49-2.31,5.38-3.97,8.74-4.8c7.8-1.93,15.23,0.53,20.51,5.25c2.68,2.4,4.81,5.39,6.15,8.69c1.35,3.33,1.9,6.99,1.39,10.7 C73.99,31.93,69.75,38.57,60.78,43.44L60.78,43.44z M37.32,67.61c-11.6-15.58-11.88-30.34,2.2-44.06l-10.14-5.6 C21.26,14.79,6.36,38.08,12.12,44.3l7.9,11.72l-1.63,3.4c-0.45,1.01-0.01,1.72,1.09,2.21l1.07,0.29L0,102.59l4.16,8.87l8.32-2.45 l2.14-4.16l-2.05-3.84l4.52-0.97L18.14,98l-2.36-3.6l1.55-3.01l4.51-0.57l1.47-2.85l-2.52-3.29l1.61-3.12l4.6-0.75l6.26-11.95 l1.06,0.58C36.16,70.56,37.11,69.84,37.32,67.61L37.32,67.61z M59.15,77.38l-3.06,11.42l-4.25,1.68l-0.89,3.33l3.1,2.63l-0.81,3.03 l-4.2,1.48l-0.86,3.2l3.01,2.95l-0.58,2.17l-4.13,1.87l2.76,3.25l-1.19,4.43l-7.45,4.07l-5.82-7.63l11.1-41.43l-2.69-0.72 c-0.55-0.15-0.89-0.72-0.74-1.28l1.13-4.21c-8.14-6.17-12.17-16.85-9.37-27.32c3.6-13.45,17.18-21.57,30.64-18.55 c0.06,0.72,0.05,1.45-0.05,2.18c-0.25,1.82-1.04,3.69-2.5,5.5c-0.2,0.24-0.41,0.49-0.63,0.73c-4.3-0.28-8.33,2.5-9.49,6.82 c-0.5,1.86-0.39,3.74,0.2,5.43c0.14,0.6,0.37,1.18,0.67,1.75c0.71,1.3,1.75,2.29,2.97,2.92c0.8,0.53,1.7,0.93,2.67,1.2 c4.83,1.29,9.78-1.49,11.22-6.24c1.46-1.29,2.73-2.65,3.82-4.05c2.12-2.73,3.57-5.63,4.43-8.58c5.84,6.3,8.41,15.37,6.02,24.29 c-2.8,10.47-11.65,17.71-21.77,18.98l-1.13,4.21c-0.15,0.55-0.72,0.89-1.28,0.74L59.15,77.38L59.15,77.38z" />
            </svg>}
            <div className='api-subscription__value__type ms-2 ms-xl-0'>
              <span className='api-subscription__value__label'>
                {subscription.enabled ? translate("subscription.enable.label") : translate("subscription.disable.label")}
              </span>
              <div className={classNames('dot', {
                enabled: subscription.enabled,
                disabled: !subscription.enabled,
              })} />
            </div>
          </div>

          <div className='api-subscription__infos'>
            <div className='api-subscription__infos__name'>{_customName}</div>
            <div className='d-flex gap-2'>
              {!isApiCMS && <BeautifulTitle title={translate("subscription.copy.apikey.help")}>
                <button className='btn btn-sm btn-outline-info'
                  aria-label={translate("subscription.copy.apikey.aria.label")}
                  onClick={() => {
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
                  {translate("subscription.copy.apikey.label")}
                </button>
              </BeautifulTitle>}
              {!isApiCMS && <BeautifulTitle title={translate("subscription.copy.token.help")}>
                <button className='btn btn-sm btn-outline-info'
                  aria-label={translate("subscription.copy.tokan.aria-label")}
                  onClick={() => {
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
                  {translate("subscription.copy.token.label")}
                </button>
              </BeautifulTitle>}
              {!isApiCMS && <BeautifulTitle title={translate("subscription.copy.basic.auth.help")}>
                <button className='btn btn-sm btn-outline-info'
                  aria-label={translate("subscription.copy.basic.auth.aria-label")}
                  onClick={() => {
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
                  {translate("subscription.copy.basic.auth.label")}
                </button>
              </BeautifulTitle>}
              {isApiCMS && <BeautifulTitle title={translate("subscription.copy.cli.auth.help")}>
                <button className='btn btn-sm btn-outline-info'
                  aria-label={translate("subscription.copy.cli.auth.aria-label")}
                  onClick={() => {
                    navigator.clipboard
                      .writeText(`${btoa(`${subscription.apiKey?.clientId}:${subscription.apiKey?.clientSecret}`)}`)
                      .then(() =>
                        toast.info(translate('credential.copy.success'))
                      )
                      .catch(() =>
                        toast.warning(translate('credential.copy.error'))
                      );
                  }}>
                  <i className="fa fa-copy me-1" />
                  {translate("subscription.copy.cli.auth.label")}
                </button>
              </BeautifulTitle>}
              {!isApiCMS && <BeautifulTitle title={translate("subscription.display.credentials")}>
                <button className='btn btn-sm btn-outline-info'
                  aria-label={translate("subscription.display.credentials")}
                  onClick={() => openCustomModal({
                    title: _customName,
                    content: <ul>
                      <li><strong>{translate("clientId")}</strong>: {subscription.apiKey.clientId}</li>
                      <li><strong>Client Secret</strong>: {subscription.apiKey.clientSecret}</li>
                    </ul>
                  })}>
                  <i className="fa fa-eye" />
                </button>
              </BeautifulTitle>}
            </div>
            <div className='api-subscription__infos__creation'>{
              translate("subscription.for")}
              <Link to={subscription.apiLink} className='ms-1 underline'>{subscription.apiName}</Link>/<Link to={subscription.planLink} className='me-1 underline'>{subscription.planName}</Link>
              {translate({
                key: 'subscription.created.at', replacements: [formatDate(subscription.createdAt, translate('date.locale'), translate('date.format.without.hours'))]
              })}
              <span className={classNames('ms-1', {
                "danger-color": subscription.validUntil && isBefore(new Date(subscription.validUntil), new Date())
              })}>
                {subscription.validUntil && translate({
                  key: 'subscription.valid.until', replacements: [formatDate(subscription.validUntil, translate('date.locale'), translate('date.format.without.hours'))]
                })}</span>
            </div>
            <div className='api-subscription__infos__creation'>
              {!!detailQuery.data.accessibleResources.length && <span>{translate('subscription.extra.resources.label')} : {getPartOfChildren(0, nbChildsDisplay)}</span>}
              {detailQuery.data.accessibleResources.length > nbChildsDisplay && (<i className={classNames("ms-1 fas cursor-pointer a-fake", {
                "fa-chevron-down": !more,
                "fa-chevron-up": more,
              })} onClick={() => setMore(!more)} />)}
              {more && (<div className='ms-4'>{getPartOfChildren(nbChildsDisplay, detailQuery.data.accessibleResources.length)}</div>)}
            </div>
            <div>
              {subscription.tags.map(t => (<span className='badge badge-custom me-1 cursor-pointer' onClick={() => handleTagClick(t)}>{t}</span>))}
            </div>
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
          <div className="dropdown-menu" aria-labelledby="dropdownMenuButton" style={{ zIndex: 1 }}>
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
              onClick={() => makeUniqueApiKey(detailQuery.data)}
            >
              {translate("subscription.extract.button.label")}
            </span>}
            <span
              className="dropdown-item cursor-pointer danger"
              onClick={() => deleteApiKey(detailQuery.data)}
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

type SimpleApiKeyCardProps = {
  subscription: ISubscription,
  plan: IUsagePlan,
  api: IApi
  apiTeam: ITeamSimple
}

export const SimpleApiKeyCard = (props: SimpleApiKeyCardProps) => {
  const { translate } = useContext(I18nContext);

  const _customName = props.subscription.customName || props.plan.customName
  const isApiCMS = props.api.visibility === "AdminOnly" && props.api.name.includes("cms");

  return (
    <div className='api-subscription'>
      <div className="api-subscription__container flex-column flex-xl-row gap-3">
        <div className='api-subscription__infos'>
          <div className='api-subscription__infos__name'>{_customName}</div>
          <div className='d-flex gap-2'>
            {!isApiCMS && <BeautifulTitle title={translate("subscription.copy.apikey.help")}>
              <button className='btn btn-sm btn-outline-info' onClick={() => {
                navigator.clipboard
                  .writeText(`${props.subscription.apiKey.clientId}:${props.subscription.apiKey.clientSecret}`)
                  .then(() =>
                    toast.info(translate('credential.copy.success'))
                  )
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}>
                <i className="fa fa-copy me-1" />
                {translate("subscription.copy.apikey.label")}
              </button>
            </BeautifulTitle>}
            {!isApiCMS && <BeautifulTitle title={translate("subscription.copy.token.help")}>
              <button className='btn btn-sm btn-outline-info' onClick={() => {
                navigator.clipboard
                  .writeText(props.subscription.integrationToken)
                  .then(() =>
                    toast.info(translate('credential.copy.success'))
                  )
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}>
                <i className="fa fa-copy me-1" />
                {translate("subscription.copy.token.label")}
              </button>
            </BeautifulTitle>}
            {!isApiCMS && <BeautifulTitle title={translate("subscription.copy.basic.auth.help")}>
              <button className='btn btn-sm btn-outline-info' onClick={() => {
                navigator.clipboard
                  .writeText(`Basic ${btoa(`${props.subscription.apiKey?.clientId}:${props.subscription.apiKey?.clientSecret}`)}`)
                  .then(() =>
                    toast.info(translate('credential.copy.success'))
                  )
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}>
                <i className="fa fa-copy me-1" />
                {translate("subscription.copy.basic.auth.label")}
              </button>
            </BeautifulTitle>}
            {!!isApiCMS && <BeautifulTitle title={translate("subscription.copy.cli.auth.help")}>
              <button className='btn btn-sm btn-outline-info'
                aria-label={translate("subscription.copy.cli.auth.aria-label")}
                onClick={() => {
                  navigator.clipboard
                    .writeText(`Basic ${btoa(`${props.subscription.apiKey?.clientId}:${props.subscription.apiKey?.clientSecret}`)}`)
                    .then(() =>
                      toast.info(translate('credential.copy.success'))
                    )
                    .catch(() =>
                      toast.warning(translate('credential.copy.error'))
                    );
                }}>
                <i className="fa fa-copy me-1" />
                {translate("subscription.copy.cli.auth.label")}
              </button>
            </BeautifulTitle>}
          </div>
          <div className='api-subscription__infos__creation'>{
            translate("subscription.for")}
            <span className='ms-1 underline'>{props.api.name}</span>/<span className='me-1 underline'>{props.plan.customName}</span>
            {translate({
              key: 'subscription.created.at', replacements: [formatDate(props.subscription.createdAt, translate('date.locale'),translate('date.format.without.hours'))]
            })}
            <span className={classNames('ms-1', {
              "danger-color": props.subscription.validUntil && isBefore(new Date(props.subscription.validUntil), new Date())
            })}>
              {props.subscription.validUntil && translate({
                key: 'subscription.valid.until', replacements: [formatDate(props.subscription.validUntil, translate('date.locale'), translate('date.format.without.hours'))]
              })}</span></div>
        </div>
      </div>
    </div>
  )
}
