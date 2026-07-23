import { constraints, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import { isBefore } from 'date-fns';
import sortBy from 'lodash/sortBy';
import { ChevronDown, ChevronUp, CircleQuestionMark, Copy, Eye, FileKey, Key, Link as LucideLink, Menu, Terminal, UserRoundKey } from "lucide-react";
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
  enabled: boolean;
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

  const toggleKeyring = (keyringId: string, enabled: boolean) =>
    Services.toggleKeyring(props.team._id, keyringId, enabled).then(() => {
      toast.success(
        translate(
          enabled
            ? 'keyring.successfully.enabled'
            : 'keyring.successfully.disabled'
        )
      );
      invalidate();
    });

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
    openFormModal({
      title: translate('apikeys.delete.confirm.modal.title'),
      description: (
        <div className='alert alert-danger' role='alert'>
          <h4 className='alert-heading'>{translate('Warning')}</h4>
          <p>
            {translate({
              key: 'keyring.delete.confirm',
              replacements: [keyring.customName ?? keyring.apiKey.clientName],
            })}
          </p>
        </div>
      ),
      schema: {
        validation: {
          type: type.string,
          label: translate({
            key: 'keyring.delete.confirm.label',
            replacements: [keyring.customName ?? keyring.apiKey.clientName],
          }),
          constraints: [
            constraints.required(translate('constraints.required.value')),
            constraints.matches(
              new RegExp(
                `^${escapeRegExp(keyring.customName ?? keyring.apiKey.clientName)}$`
              ),
              translate('constraints.match.keyring')
            ),
          ],
        },
      },
      actionLabel: translate('Confirm'),
      onSubmit: () =>
        Services.deleteKeyring(props.team._id, keyring._id).then((r) => {
          if (!isError(r)) {
            invalidate();
            toast.success(translate('keyring.delete.success'));
          }
        }),
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
                toggleKeyring={(enabled) => toggleKeyring(keyring._id, enabled)}
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
  toggleKeyring: (enabled: boolean) => Promise<void>;
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

export const KeyringCard = ({
  api,
  keyring,
  currentTeam,
  apiLink,
  updateCustomName,
  updateKeyringName,
  toggleKeyring,
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
        className="btn --tertiary --small --icon-only"
        aria-label={ariaLabel}
        onClick={() => copy(value)}
      >
        {icon}
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
          {aggregated && <FileKey />}
        </div>
        <span className={classNames("badge --state d-flex align-items-center gap-2", {
          "--success": keyring.enabled,
          "--danger": !keyring.enabled,
        })}>
          {keyring.enabled
            ? translate('subscription.enable.label')
            : translate('subscription.disable.label')}
        </span>
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
          <Can I={manage} a={apikey} team={currentTeam}>
            <button className="btn --ghost --icon-only dropdown" aria-label={translate('keyring.actions.aria.label')}>
              <Menu
                className="dropdown-menu-button cursor-pointer"
                style={{ fontSize: '20px' }}
                data-bs-toggle="dropdown"
                aria-expanded="false"
                id={`keyring-dropdown-${keyring._id}`}
              />
              <div
                className="dropdown-menu dropdown-menu-end"
                aria-labelledby={`keyring-dropdown-${keyring._id}`}
                style={{ zIndex: 1 }}
              >
                <button
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
                </button>
                {/* TODO: better label */}
                <button className={classNames('dropdown-item cursor-pointer')}
                  onClick={() => toggleKeyring(!keyring.enabled)}
                >
                  {translate(
                    keyring.enabled
                      ? 'keyring.disable.action.label'
                      : 'keyring.enable.action.label'
                  )}
                </button>
                {!aggregated && !disableRotation && (
                  <button
                    className={classNames('dropdown-item cursor-pointer', {
                      disabled: !keyring.enabled,
                    })}
                    onClick={() => {
                      if (!keyring.enabled) return;
                      openFormModal({
                        title: translate('ApiKey rotation'),
                        actionLabel: translate('Save'),
                        schema: settingsSchema,
                        onSubmit: (data: IRotation) => {
                          if (keyring.enabled) {
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
                      });
                    }}
                  >
                    {translate('subscription.rotation.update.label')}
                  </button>
                )}
                <div className="dropdown-divider" />
                <button
                  className={classNames('dropdown-item cursor-pointer danger', {
                    disabled: !keyring.enabled,
                  })}
                  onClick={() => {
                    if (keyring.enabled) withLoader(regenerateSecret);
                  }}
                >
                  {translate('subscription.reset.secret.label')}
                </button>
                <button
                  className="dropdown-item cursor-pointer danger"
                  onClick={() => withLoader(deleteKeyring)}
                >
                  {translate('keyring.delete.label')}
                </button>
              </div>
            </button>
          </Can>
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
                    <span className={classNames("badge --state d-flex align-items-center gap-2", {
                      "--success": sub.enabled,
                      "--danger": !sub.enabled,
                    })}>
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
                <td className='d-flex gap-1'>
                  {sub.tags.map((t) => (
                    <span
                      key={t}
                      className="badge --primary cursor-pointer"
                      onClick={() => handleTagClick(t)}
                    >
                      {t}
                    </span>
                  ))}
                </td>
                <td className="text-end">
                  <Can I={manage} a={apikey} team={currentTeam}>
                    <button className="btn --ghost --small --icon-only dropdown" aria-label={translate('subscription.actions.aria.label')}>
                      <Menu
                        className="cursor-pointer dropdown-menu-button"
                        style={{ fontSize: '18px' }}
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                        id={`dropdown-${sub._id}`}
                      />
                      <div
                        className="dropdown-menu dropdown-menu-end"
                        aria-labelledby={`dropdown-${sub._id}`}
                        style={{ zIndex: 1 }}
                      >
                        <button
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
                        </button>
                        {!aggregated && <span
                          className="dropdown-item cursor-pointer"
                          onClick={() => withLoader(() => transferKey(sub))}
                        >
                          {translate('subscription.transfer.label')}
                        </span>}
                        <button
                          className="dropdown-item cursor-pointer"
                          onClick={() => withLoader(() => toggle(sub))}
                        >
                          {sub.enabled
                            ? translate('subscription.disable.button.label')
                            : translate('subscription.enable.button.label')}
                        </button>
                        {aggregated && (
                          <button
                            className="dropdown-item cursor-pointer danger"
                            onClick={() => withLoader(() => makeUniqueApiKey(sub))}
                          >
                            {translate('subscription.extract.button.label')}
                          </button>
                        )}
                        <div className="dropdown-divider" />
                        <button
                          className="dropdown-item cursor-pointer danger"
                          onClick={() => withLoader(() => deleteApiKey(sub))}
                        >
                          {translate('subscription.delete.button.label')}
                        </button>
                      </div>
                    </button>
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
