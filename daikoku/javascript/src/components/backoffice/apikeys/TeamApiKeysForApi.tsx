import { constraints, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import { isBefore } from 'date-fns';
import sortBy from 'lodash/sortBy';
import { ChevronDown, ChevronUp, CircleQuestionMark, Copy, Eye, Key, Link as LucideLink, Menu, Terminal, UserRoundKey } from "lucide-react";
import { useContext, useEffect, useState, type ReactNode } from 'react';
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
  IRotation,
  ISubscription,
  ITeamSimple,
  IUsagePlan,
  isError
} from '../../../types';
import {
  BeautifulTitle,
  Can,
  PaginatedComponent,
  Placeholder,
  Spinner,
  apikey,
  escapeRegExp,
  formatDate,
  manage,
  read
} from '../../utils';

const DisplayLink = ({ value }: { value: string }) => {
  const [displayLink, setDisplayLink] = useState(false)
  const { translate } = useContext(I18nContext);
  return (
    <div>{translate("subscriptions.link.explanation.1")}
      <ol>
        <li>{translate("subscriptions.link.explanation.2")}</li>
        <li>{translate("subscriptions.link.explanation.3")}</li>
        <li>{translate("subscriptions.link.explanation.4")}</li>
      </ol>
      <span className='a-fake' onClick={() => setDisplayLink(!DisplayLink)}>
        {!!displayLink && <ChevronUp className='me-1' />}
        {!displayLink && <ChevronDown className='me-1' />}
        {displayLink ? translate('subscriptions.hide.link') : translate('subscriptions.display.link')}
      </span>
      {displayLink && <div className='api-susbcription__display-link'>
        {value}
      </div>}
    </div>
  )
}

export const TeamApiKeysForApi = () => {
  const { currentTeam } = useTeamBackOffice();
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

type ApiKeysListForApiProps = {
  team: ITeamSimple
  api: IApi
  ownerTeam: ITeamSimple,
  linkToChildren?: (api: IApi, teamHrId: string) => string
}

export interface IKeyringSubscriptionGql {
  _id: string;
  customName: string | null;
  adminCustomName?: string;
  enabled: boolean;
  createdAt: number;
  validUntil?: number;
  tags: Array<string>;
  lastUsage?: number;
  plan: { _id: string; customName: string; autoRotation?: boolean };
  api: { _id: string; _humanReadableId: string; name: string; currentVersion: string };
}

export interface IKeyringForApiGql {
  _id: string;
  customName: string | null;
  integrationToken: string;
  bearerToken?: string;
  subscriptionsCount: number;
  apiKey: { clientId: string; clientSecret: string; clientName: string };
  rotation?: IRotation;
  subscriptions: Array<IKeyringSubscriptionGql>;
}

export const ApiKeysListForApi = (props: ApiKeysListForApiProps) => {
  const [searched, setSearched] = useState('');

  const { customGraphQLClient } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);
  const { confirm, openFormModal, openCustomModal } = useContext(ModalContext);
  const queryClient = useQueryClient();

  const keyringsQuery = useQuery({
    queryKey: ['data', 'keyrings', props.team._id, props.api._id],
    queryFn: () =>
      customGraphQLClient.request<{
        keyrings: { keyrings: Array<IKeyringForApiGql>; total: number };
      }>(Services.graphql.getApiKeyrings, {
        apiId: props.api._id,
        teamId: props.team._id,
        version: props.api.currentVersion,
        filterTable: JSON.stringify([]),
        sortingTable: JSON.stringify([]),
        limit: 100,
        offset: 0,
      }),
    select: (d) => d.keyrings.keyrings,
  });

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['data'] });
  }, [queryClient]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['data', 'keyrings'] });

  const updateCustomName = (subscriptionId: string, customName: string) =>
    Services.updateSubscriptionCustomName(
      props.team,
      { _id: subscriptionId } as ISubscription,
      customName
    ).then(() => {
      toast.success(translate('subscription.custom.name.successfuly.updated'));
      invalidate();
    });

  const updateKeyringName = (keyringId: string, customName: string) =>
    Services.updateKeyringCustomName(props.team._id, keyringId, customName).then(
      () => {
        toast.success(translate('keyring.custom.name.success'));
        invalidate();
      }
    );

  const toggleApiKey = (subscription: IKeyringSubscriptionGql) =>
    Services.archiveApiKey(
      props.team._id,
      subscription._id,
      !subscription.enabled
    ).then(() => {
      toast.success(
        subscription.enabled
          ? translate('subscription.successfully.disabled')
          : translate('subscription.successfully.enabled')
      );
      invalidate();
    });

  const toggleApiKeyRotation = (
    subscription: IKeyringSubscriptionGql,
    enabled: boolean,
    rotationEvery: number,
    gracePeriod: number
  ) => {
    if (subscription.plan.autoRotation) {
      toast.error(translate('rotation.error.message'));
      return Promise.resolve();
    }
    return Services.toggleApiKeyRotation(
      props.team._id,
      subscription._id,
      enabled,
      rotationEvery,
      gracePeriod
    ).then(() => {
      toast.success(translate('subscription.rotation.successfully.setup'));
      invalidate();
    });
  };

  const regenerateSecret = (keyring: IKeyringForApiGql) =>
    confirm({ message: translate('reset.secret.confirm') }).then((ok) => {
      if (ok) {
        Services.regenerateApiKeySecret(props.team._id, keyring._id).then(() => {
          invalidate();
          toast.success(translate('secret reseted successfully'));
        });
      }
    });

  const transferApiKey = (subscription: IKeyringSubscriptionGql) =>
    Services.getSubscriptionTransferLink(props.team._id, subscription._id).then(
      (response) => {
        if (!isError(response)) {
          openCustomModal({
            title: translate('subscriptions.transfer.modal.title'),
            content: <DisplayLink value={response.link} />,
            actions: (close) => (
              <button
                className='btn --primary'
                onClick={() => {
                  navigator.clipboard
                    .writeText(response.link)
                    .then(() => {
                      toast.info(translate('credential.copy.success'));
                      close();
                    })
                    .catch(() =>
                      toast.warning(translate('credential.copy.error'))
                    );
                }}
              >
                <LucideLink className='me-1' />
                {translate('subscriptions.copy.link.button.label')}
              </button>
            ),
          });
        }
      }
    );

  const deleteKeyring = (keyring: IKeyringForApiGql) =>
    confirm({
      message: translate({
        key: 'keyring.delete.confirm',
        replacements: [keyring.customName ?? keyring.apiKey.clientName],
      }),
    }).then((ok) => {
      if (ok) {
        Services.deleteKeyring(props.team._id, keyring._id).then((r) => {
          if (!isError(r)) {
            invalidate();
            toast.success(translate('keyring.delete.success'));
          }
        });
      }
    });

  const confirmationSchema = (subscription: IKeyringSubscriptionGql) => ({
    validation: {
      type: type.string,
      label: translate({
        key: 'apikeys.delete.confirm.label',
        replacements: [
          `${subscription.api.name}/${subscription.customName ?? subscription.plan.customName}`,
        ],
      }),
      constraints: [
        constraints.required(translate('constraints.required.value')),
        constraints.matches(
          new RegExp(
            `${escapeRegExp(subscription.api.name)}/${escapeRegExp(subscription.customName ?? subscription.plan.customName)}`
          ),
          translate('constraints.match.subscription')
        ),
      ],
      defaultValue: '',
    },
  });

  const deleteApiKey = (
    subscription: IKeyringSubscriptionGql,
    keyring: IKeyringForApiGql
  ) => {
    openFormModal({
      title: translate('apikeys.delete.confirm.modal.title'),
      description: (
        <div className='alert alert-danger' role='alert'>
          <h4 className='alert-heading'>{translate('Warning')}</h4>
          <p>{translate('delete.subscription.confirm.modal.description.1')}</p>
          {keyring.subscriptionsCount > 1 && (
            <p
              dangerouslySetInnerHTML={{
                __html: translate({
                  key: 'delete.subscription.confirm.modal.description.keyring',
                  replacements: [
                    `<strong>${keyring.customName ?? keyring.apiKey.clientName}</strong>`,
                  ],
                }),
              }}
            />
          )}
        </div>
      ),
      schema: confirmationSchema(subscription),
      actionLabel: translate('Confirm'),
      onSubmit: () =>
        Services.deleteApiSubscription(props.team._id, subscription._id).then(
          () => {
            invalidate();
            toast.success(translate('apikeys.delete.success.message'));
          }
        ),
    });
  };

  const makeUniqueApiKey = (
    subscription: IKeyringSubscriptionGql,
    keyring: IKeyringForApiGql
  ) => {
    openFormModal({
      title: translate('apikeys.delete.confirm.modal.title'),
      description: (
        <div className='alert alert-danger' role='alert'>
          <h4 className='alert-heading'>{translate('Warning')}</h4>
          <p>{translate('team_apikey_for_api.ask_for_make_unique')}</p>
          <ul>
            <li
              dangerouslySetInnerHTML={{
                __html: translate({
                  key: 'team_apikey_for_api.ask_for_make_unique.2',
                  replacements: [
                    `<strong>${keyring.customName ?? keyring.apiKey.clientName}</strong>`,
                  ],
                }),
              }}
            />
          </ul>
        </div>
      ),
      schema: confirmationSchema(subscription),
      actionLabel: translate('Confirm'),
      onSubmit: () =>
        Services.makeUniqueApiKey(props.team._id, subscription._id).then(() => {
          invalidate();
          toast.success(
            translate('team_apikey_for_api.ask_for_make_unique.success_message')
          );
        }),
    });
  };

  if (keyringsQuery.isLoading) {
    return <Spinner />;
  } else if (keyringsQuery.data && !isError(keyringsQuery.data)) {
    const keyrings = keyringsQuery.data;
    const search = searched.trim().toLowerCase();

    const filtered =
      search === ''
        ? keyrings
        : keyrings.filter(
          (k) =>
            k.apiKey.clientName.toLowerCase().includes(search) ||
            k.apiKey.clientId.toLowerCase() === search ||
            (k.customName ?? '').toLowerCase().includes(search) ||
            k.subscriptions.some(
              (s) =>
                (s.customName ?? '').toLowerCase().includes(search) ||
                s.plan.customName.toLowerCase().includes(search) ||
                s.tags.some((t) => t.toLowerCase().includes(search))
            )
        );

    const sorted = sortBy(filtered, [
      (k) => (k.customName ?? k.apiKey.clientName).toLowerCase(),
    ]);

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
            items={sorted}
            count={5}
            formatter={(keyring: IKeyringForApiGql) => (
              <KeyringCard
                key={keyring._id}
                api={props.api}
                currentTeam={props.team}
                apiLink={apiLink}
                keyring={keyring}
                updateCustomName={updateCustomName}
                updateKeyringName={(name) => updateKeyringName(keyring._id, name)}
                toggle={toggleApiKey}
                toggleRotation={toggleApiKeyRotation}
                regenerateSecret={() => regenerateSecret(keyring)}
                deleteKeyring={() => deleteKeyring(keyring)}
                transferKey={transferApiKey}
                deleteApiKey={(sub) => deleteApiKey(sub, keyring)}
                makeUniqueApiKey={(sub) => makeUniqueApiKey(sub, keyring)}
                handleTagClick={(tag) => setSearched(tag)}
              />
            )}
          />
        </div>
      </Can>
    );
  } else {
    return <div>an error occured</div>;
  }
};

type KeyringCardProps = {
  api: IApi;
  keyring: IKeyringForApiGql;
  currentTeam?: ITeamSimple;
  apiLink: string;
  updateCustomName: (subscriptionId: string, name: string) => Promise<void>;
  updateKeyringName: (name: string) => Promise<void>;
  toggle: (subscription: IKeyringSubscriptionGql) => Promise<void>;
  toggleRotation: (
    subscription: IKeyringSubscriptionGql,
    enabled: boolean,
    rotationEvery: number,
    gracePeriod: number
  ) => Promise<void>;
  regenerateSecret: () => void;
  deleteKeyring: () => void;
  transferKey: (subscription: IKeyringSubscriptionGql) => void;
  deleteApiKey: (subscription: IKeyringSubscriptionGql) => void;
  makeUniqueApiKey: (subscription: IKeyringSubscriptionGql) => void;
  handleTagClick: (tag: string) => void;
};

const AggregatedIcon = () => (
  <svg
    width="32"
    viewBox="-18.91 0 122.88 122.88"
    version="1.1"
    style={{ fill: 'var(--level2_text-color, #4c4c4d)', marginBottom: '0.375rem' }}
  >
    <path
      d="M60.78,43.44c-1.49,0.81-3.35,0.26-4.15-1.22c-0.81-1.49-0.26-3.35,1.23-4.15c7.04-3.82,10.32-8.76,10.98-13.59 c0.35-2.58-0.05-5.17-1.02-7.57c-0.99-2.43-2.56-4.64-4.55-6.42c-3.87-3.46-9.3-5.28-14.97-3.87c-2.3,0.57-4.29,1.72-6.03,3.34 c-1.85,1.72-3.45,3.97-4.85,6.63c-0.79,1.5-2.64,2.07-4.13,1.29c-1.5-0.79-2.07-2.64-1.29-4.13c1.72-3.26,3.73-6.06,6.11-8.28 c2.49-2.31,5.38-3.97,8.74-4.8c7.8-1.93,15.23,0.53,20.51,5.25c2.68,2.4,4.81,5.39,6.15,8.69c1.35,3.33,1.9,6.99,1.39,10.7 C73.99,31.93,69.75,38.57,60.78,43.44L60.78,43.44z M37.32,67.61c-11.6-15.58-11.88-30.34,2.2-44.06l-10.14-5.6 C21.26,14.79,6.36,38.08,12.12,44.3l7.9,11.72l-1.63,3.4c-0.45,1.01-0.01,1.72,1.09,2.21l1.07,0.29L0,102.59l4.16,8.87l8.32-2.45 l2.14-4.16l-2.05-3.84l4.52-0.97L18.14,98l-2.36-3.6l1.55-3.01l4.51-0.57l1.47-2.85l-2.52-3.29l1.61-3.12l4.6-0.75l6.26-11.95 l1.06,0.58C36.16,70.56,37.11,69.84,37.32,67.61L37.32,67.61z M59.15,77.38l-3.06,11.42l-4.25,1.68l-0.89,3.33l3.1,2.63l-0.81,3.03 l-4.2,1.48l-0.86,3.2l3.01,2.95l-0.58,2.17l-4.13,1.87l2.76,3.25l-1.19,4.43l-7.45,4.07l-5.82-7.63l11.1-41.43l-2.69-0.72 c-0.55-0.15-0.89-0.72-0.74-1.28l1.13-4.21c-8.14-6.17-12.17-16.85-9.37-27.32c3.6-13.45,17.18-21.57,30.64-18.55 c0.06,0.72,0.05,1.45-0.05,2.18c-0.25,1.82-1.04,3.69-2.5,5.5c-0.2,0.24-0.41,0.49-0.63,0.73c-4.3-0.28-8.33,2.5-9.49,6.82 c-0.5,1.86-0.39,3.74,0.2,5.43c0.14,0.6,0.37,1.18,0.67,1.75c0.71,1.3,1.75,2.29,2.97,2.92c0.8,0.53,1.7,0.93,2.67,1.2 c4.83,1.29,9.78-1.49,11.22-6.24c1.46-1.29,2.73-2.65,3.82-4.05c2.12-2.73,3.57-5.63,4.43-8.58c5.84,6.3,8.41,15.37,6.02,24.29 c-2.8,10.47-11.65,17.71-21.77,18.98l-1.13,4.21c-0.15,0.55-0.72,0.89-1.28,0.74L59.15,77.38L59.15,77.38z" />
  </svg>
);

export const KeyringCard = ({
  api,
  keyring,
  currentTeam,
  apiLink,
  updateCustomName,
  updateKeyringName,
  toggle,
  toggleRotation,
  regenerateSecret,
  deleteKeyring,
  transferKey,
  deleteApiKey,
  makeUniqueApiKey,
  handleTagClick,
}: KeyringCardProps) => {
  const { translate } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext);

  const [isPending, setIsPending] = useState(false);

  const withLoader = (fn: () => Promise<any> | void) => {
    setIsPending(true);
    const result = fn();
    if (result && typeof result.finally === 'function') {
      return result.finally(() => setIsPending(false));
    }
    setIsPending(false);
    return result;
  };

  const aggregated = keyring.subscriptionsCount > 1;
  const isApiCMS =
    api.visibility === 'AdminOnly' && api.name.includes('cms');
  const title = keyring.customName ?? keyring.apiKey.clientName;
  // rotation is a keyring-level concern ; it is only offered when the keyring
  // is not aggregated (a single subscription carries it)
  const rotationTarget = keyring.subscriptions[0];
  const disableRotation =
    api.visibility === 'AdminOnly' || !!rotationTarget?.plan.autoRotation;

  const settingsSchema = {
    enabled: {
      type: type.bool,
      label: translate('Enabled'),
      help: translate('help.apikey.rotation'),
      disabled: rotationTarget?.plan.autoRotation,
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

  const copy = (value: string) =>
    navigator.clipboard
      .writeText(value)
      .then(() => toast.info(translate('credential.copy.success')))
      .catch(() => toast.warning(translate('credential.copy.error')));

  const credentialButton = (
    title: string,
    ariaLabel: string,
    icon: ReactNode,
    value: string
  ) => (
    <BeautifulTitle title={title}>
      <button
        className="btn btn-sm btn-outline-info"
        aria-label={ariaLabel}
        onClick={() => copy(value)}
      >
        <i className={`fa ${icon}`} />
      </button>
    </BeautifulTitle>
  );

  return (
    <div
      className="api-subscription keyring-card mb-3 p-3"
      style={{ position: 'relative', width: '100%' }}
    >
      {isPending && <Placeholder />}

      {/* Keyring header : credentials are shared by every subscription below */}
      <div className="d-flex align-items-center gap-3 flex-wrap">
        <div className="api-subscription__icon">
          {!aggregated && <Key />}
          {aggregated && <AggregatedIcon />}
        </div>
        <div className="d-flex flex-column">
          <span className="api-subscription__infos__name">{title}</span>
          <small className="text-muted">
            {keyring.subscriptionsCount} {translate('Subscriptions')}
          </small>
        </div>

        <div className="d-flex gap-2 flex-wrap ms-auto align-items-center">
          {!isApiCMS &&
            credentialButton(
              translate('subscription.copy.apikey.help'),
              translate('subscription.copy.apikey.aria.label'),
              <Copy />,
              `${keyring.apiKey.clientId}:${keyring.apiKey.clientSecret}`
            )}
          {!isApiCMS &&
            credentialButton(
              translate('subscription.copy.token.help'),
              translate('subscription.copy.tokan.aria.label'),
              <Copy />,
              keyring.integrationToken
            )}
          {!isApiCMS &&
            credentialButton(
              translate('subscription.copy.bearer.token.help'),
              translate('subscription.copy.bearer.token.aria.label'),
              <Copy />,
              keyring.bearerToken ?? ''
            )}
          {!isApiCMS &&
            credentialButton(
              translate('subscription.copy.basic.auth.help'),
              translate('subscription.copy.basic.auth.aria.label'),
              <Copy />,
              `Basic ${btoa(`${keyring.apiKey.clientId}:${keyring.apiKey.clientSecret}`)}`
            )}
          {isApiCMS &&
            credentialButton(
              translate('subscription.copy.cli.auth.help'),
              translate('subscription.copy.cli.auth.aria.label'),
              <Terminal />,
              `${btoa(`${keyring.apiKey.clientId}:${keyring.apiKey.clientSecret}`)}`
            )}

          {/* Keyring-level menu : refresh secret / rotation */}
          <div className="dropdown">
            <Menu
              className="dropdown-menu-button"
              style={{ fontSize: '20px' }}
              data-bs-toggle="dropdown"
              aria-expanded="false"
              aria-label={translate('keyring.actions.aria.label')}
              id={`keyring-dropdown-${keyring._id}`}
            />
            <div
              className="dropdown-menu dropdown-menu-end"
              aria-labelledby={`keyring-dropdown-${keyring._id}`}
              style={{ zIndex: 1 }}
            >
              <span
                className="dropdown-item cursor-pointer"
                onClick={() =>
                  openFormModal({
                    title: translate('keyring.rename.modal.title'),
                    actionLabel: translate('Save'),
                    schema: {
                      customName: {
                        type: type.string,
                        label: translate('keyring.custom.name.label'),
                        placeholder: translate('keyring.custom.name.placeholder'),
                      },
                    },
                    onSubmit: (data) =>
                      withLoader(() => updateKeyringName(data.customName ?? '')),
                    value: { customName: keyring.customName },
                  })
                }
              >
                {translate('keyring.rename.label')}
              </span>
              {!aggregated && !disableRotation && (
                <span
                  className="dropdown-item cursor-pointer"
                  onClick={() =>
                    openFormModal({
                      title: translate('ApiKey rotation'),
                      actionLabel: translate('Save'),
                      schema: settingsSchema,
                      onSubmit: (data: IRotation) => {
                        if (rotationTarget?.enabled) {
                          withLoader(() =>
                            toggleRotation(
                              rotationTarget,
                              data.enabled,
                              data.rotationEvery,
                              data.gracePeriod
                            )
                          );
                        }
                      },
                      value: keyring.rotation,
                    })
                  }
                >
                  {translate('subscription.rotation.update.label')}
                </span>
              )}
              <span
                className="dropdown-item cursor-pointer danger"
                onClick={() => withLoader(regenerateSecret)}
              >
                {translate('subscription.reset.secret.label')}
              </span>
              <span
                className="dropdown-item cursor-pointer danger"
                onClick={() => withLoader(deleteKeyring)}
              >
                {translate('keyring.delete.label')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Subscriptions sharing this keyring, as a compact table */}
      <table className="table table-sm align-middle mb-0 mt-3 keyring-card__subscriptions">
        <thead>
          <tr>
            <th>{translate('Enabled')}</th>
            <th>{translate('Subscription')}</th>
            <th>{translate('Created at')}</th>
            <th>{translate('Valid until')}</th>
            <th>{translate('Tags')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {keyring.subscriptions.map((sub) => {
            const subName = sub.customName || sub.plan.customName;
            const statsLink = `/${currentTeam?._humanReadableId}/settings/apikeys/${api._id}/${api.currentVersion}/subscription/${sub._id}/consumptions`;
            return (
              <tr key={sub._id}>
                <td>
                  <div className="api-subscription__value__type d-flex align-items-center gap-1">
                    <div
                      className={classNames('dot', {
                        enabled: sub.enabled,
                        disabled: !sub.enabled,
                      })}
                    />
                    <span className="api-subscription__value__label">
                      {sub.enabled
                        ? translate('subscription.enable.label')
                        : translate('subscription.disable.label')}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="d-flex flex-column">
                    <strong>{subName}</strong>
                    <Link className="underline" to={statsLink}>
                      {sub.api.name}:{sub.api.currentVersion}/
                      {sub.plan.customName}
                    </Link>
                  </div>
                </td>
                <td>
                  {formatDate(
                    sub.createdAt,
                    translate('date.locale'),
                    translate('date.format.without.hours')
                  )}
                </td>
                <td>
                  <span
                    className={classNames({
                      'danger-color':
                        sub.validUntil &&
                        isBefore(new Date(sub.validUntil), new Date()),
                    })}
                  >
                    {sub.validUntil
                      ? formatDate(
                        sub.validUntil,
                        translate('date.locale'),
                        translate('date.format.without.hours')
                      )
                      : '-'}
                  </span>
                </td>
                <td>
                  {sub.tags.map((t) => (
                    <span
                      key={t}
                      className="badge badge-custom me-1 cursor-pointer"
                      onClick={() => handleTagClick(t)}
                    >
                      {t}
                    </span>
                  ))}
                </td>
                <td className="text-end">
                  <Can I={manage} a={apikey} team={currentTeam}>
                    <div className="dropdown">
                      <Menu
                        className="cursor-pointer dropdown-menu-button"
                        style={{ fontSize: '18px' }}
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                        aria-label={translate('subscription.actions.aria.label')}
                        id={`dropdown-${sub._id}`}
                      />
                      <div
                        className="dropdown-menu dropdown-menu-end"
                        aria-labelledby={`dropdown-${sub._id}`}
                        style={{ zIndex: 1 }}
                      >
                        <span
                          className="dropdown-item cursor-pointer"
                          onClick={() =>
                            openFormModal({
                              title: translate(
                                'subscription.custom.name.update.label'
                              ),
                              actionLabel: translate('Save'),
                              schema: {
                                customName: {
                                  type: type.string,
                                  placeholder: translate(
                                    'subscription.custom.name.update.placeholder'
                                  ),
                                  label: translate(
                                    'subscription.custom.name.update.message'
                                  ),
                                },
                              },
                              onSubmit: (data) =>
                                updateCustomName(sub._id, data.customName ?? ''),
                              value: { customName: sub.customName },
                            })
                          }
                        >
                          {translate('subscription.custom.name.update.label')}
                        </span>
                        <span
                          className="dropdown-item cursor-pointer"
                          onClick={() => withLoader(() => transferKey(sub))}
                        >
                          {translate('subscription.transfer.label')}
                        </span>
                        <span
                          className="dropdown-item cursor-pointer"
                          onClick={() => withLoader(() => toggle(sub))}
                        >
                          {sub.enabled
                            ? translate('subscription.disable.button.label')
                            : translate('subscription.enable.button.label')}
                        </span>
                        {aggregated && (
                          <span
                            className="dropdown-item cursor-pointer danger"
                            onClick={() => withLoader(() => makeUniqueApiKey(sub))}
                          >
                            {translate('subscription.extract.button.label')}
                          </span>
                        )}
                        <div className="dropdown-divider" />
                        <span
                          className="dropdown-item cursor-pointer danger"
                          onClick={() => withLoader(() => deleteApiKey(sub))}
                        >
                          {translate('subscription.delete.button.label')}
                        </span>
                      </div>
                    </div>
                  </Can>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="api-subscriptions__links mt-2">
        {translate('subscription.nota.part.1')}
        <Link className="cursor-pointer underline mx-1" to={apiLink}>
          {translate('subscription.nota.link.api')}
        </Link>
        {translate('subscription.nota.part.2')}
      </div>
    </div>
  );
};

type HelpProps = {
  message: string;
};
export const Help = ({ message }: HelpProps) => {
  return (
    <BeautifulTitle place="bottom" title={message}>
      <CircleQuestionMark />
    </BeautifulTitle>
  );
}

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
              <button className='btn --secondary --small' onClick={() => {
                navigator.clipboard
                  .writeText(`${props.subscription.keyring?.apiKey.clientId}:${props.subscription.keyring?.apiKey.clientSecret}`)
                  .then(() =>
                    toast.info(translate('credential.copy.success'))
                  )
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}>
                <Copy className="me-1" />
                {translate("subscription.copy.apikey.label")}
              </button>
            </BeautifulTitle>}
            {!isApiCMS && <BeautifulTitle title={translate("subscription.copy.token.help")}>
              <button className='btn --secondary --small' onClick={() => {
                navigator.clipboard
                  .writeText(props.subscription.keyring?.integrationToken ?? '')
                  .then(() =>
                    toast.info(translate('credential.copy.success'))
                  )
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}>
                <Copy className="me-1" />
                {translate("subscription.copy.token.label")}
              </button>
            </BeautifulTitle>}
            {!isApiCMS && <BeautifulTitle title={translate("subscription.copy.basic.auth.help")}>
              <button className='btn --secondary --small' onClick={() => {
                navigator.clipboard
                  .writeText(`Basic ${btoa(`${props.subscription.keyring?.apiKey?.clientId}:${props.subscription.keyring?.apiKey?.clientSecret}`)}`)
                  .then(() =>
                    toast.info(translate('credential.copy.success'))
                  )
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}>
                <Copy className="me-1" />
                {translate("subscription.copy.basic.auth.label")}
              </button>
            </BeautifulTitle>}
            {!!isApiCMS && <BeautifulTitle title={translate("subscription.copy.cli.auth.help")}>
              <button className='btn --secondary --small'
                aria-label={translate("subscription.copy.cli.auth.aria.label")}
                onClick={() => {
                  navigator.clipboard
                    .writeText(`Basic ${btoa(`${props.subscription.keyring?.apiKey?.clientId}:${props.subscription.keyring?.apiKey?.clientSecret}`)}`)
                    .then(() =>
                      toast.info(translate('credential.copy.success'))
                    )
                    .catch(() =>
                      toast.warning(translate('credential.copy.error'))
                    );
                }}>
                <Copy className="me-1" />
                {translate("subscription.copy.cli.auth.label")}
              </button>
            </BeautifulTitle>}
          </div>
          <div className='api-subscription__infos__creation'>{
            translate("subscription.for")}
            <span className='ms-1 underline'>{props.api.name}</span>/<span
              className='me-1 underline'>{props.plan.customName}</span>
            {translate({
              key: 'subscription.created.at',
              replacements: [formatDate(props.subscription.createdAt, translate('date.locale'), translate('date.format.without.hours'))]
            })}
            <span className={classNames('ms-1', {
              "danger-color": props.subscription.validUntil && isBefore(new Date(props.subscription.validUntil), new Date())
            })}>
              {props.subscription.validUntil && translate({
                key: 'subscription.valid.until',
                replacements: [formatDate(props.subscription.validUntil, translate('date.locale'), translate('date.format.without.hours'))]
              })}</span></div>
        </div>
      </div>
    </div>
  )
}
