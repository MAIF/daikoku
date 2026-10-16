import { constraints, type } from '@maif/react-forms';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronUp,
  CircleQuestionMark, Copy,
  EllipsisVertical, KeyRound,
  Loader,
  Link as LucideLink,
  Terminal,
  Users
} from "lucide-react";
import { useContext, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { QUERY_KEYS } from "../../../constants/queryKeys";
import {
  I18nContext,
  ModalContext,
} from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import {
  IApi,
  IKeyringForApiGql,
  IKeyringSubscriptionGql,
  IKeyringSubscriptionsWithCount,
  IRotation,
  ITeamSimple,
  isError
} from '../../../types';
import {
  DynamicTable,
  DynamicTableColumnCtx,
  DynamicTableFeatures,
  FetchData,
  FetchResult
} from "../../inputs";
import {
  BeautifulTitle,
  Can,
  apikey,
  escapeRegExp,
  formatDate,
  manage,
} from '../../utils';
import classNames from 'classnames';

interface KeyringCardProps {
  api: IApi;
  keyring: IKeyringForApiGql;
  currentTeam?: ITeamSimple;
};

export const KeyringCard = ({
  api,
  keyring,
  currentTeam
}: KeyringCardProps) => {
  const { translate } = useContext(I18nContext);
  const { customGraphQLClient, tenant } = useContext(GlobalContext);
  const displayType = tenant.display === 'environment' ? 'environment' : 'plan'

  const { confirm, openFormModal, openCustomModal } = useContext(ModalContext);
  const queryClient = useQueryClient();
  const actionsInFlight = useRef(new Set<string>());
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());



  const errorMessage = (error: unknown) =>
    error && typeof error === 'object' && 'error' in error && typeof error.error === 'string'
      ? error.error
      : 'Oops something went wrong';

  const withPendingAction = async (
    targetId: string,
    action: () => Promise<unknown>
  ) => {
    if (actionsInFlight.current.has(targetId)) return;
    actionsInFlight.current.add(targetId);
    setPendingActions(new Set(actionsInFlight.current));

    try {
      return await action();
    } catch (error) {
      toast.error(translate(errorMessage(error)));
    } finally {
      actionsInFlight.current.delete(targetId);
      setPendingActions(new Set(actionsInFlight.current));
    }
  };

  const guardedToggle = (
    targetId: string,
    needsConfirm: boolean,
    confirmMessage: string,
    action: () => Promise<unknown>
  ) => {
    if (api.state === 'blocked') return;
    return withPendingAction(targetId, async () => {
      const confirmed = needsConfirm
        ? await confirm({ message: confirmMessage })
        : true;
      if (confirmed) return action();
    });
  };

  const toggleKeyringState = (keyring: IKeyringForApiGql) =>
    guardedToggle(`keyring:${keyring._id}`, keyring.enabled, translate('keyring.disable.confirm'), () =>
      toggleKeyring.mutateAsync({ keyringId: keyring._id, enabled: !keyring.enabled })
    );

  const toggleSubscriptionState = (sub: IKeyringSubscriptionGql) =>
    guardedToggle(`subscription:${sub._id}`, sub.enabled, translate('subscription.disable.confirm'), () =>
      toggleApiKey.mutateAsync({ sub, keyringId: keyring._id })
    );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.apiKeyrings(currentTeam?._id as string, api._id) });
    queryClient.invalidateQueries({ queryKey: ['mySubscription'] });
  }

  const updateKeyringName = (keyringId: string, customName: string) =>
    Services.updateKeyringCustomName(currentTeam?._id as string, keyringId, customName).then(
      () => {
        toast.success(translate('keyring.custom.name.success'));
        invalidate();
      }
    );

  const toggleKeyring = useMutation({
    mutationFn: ({ keyringId, enabled }: { keyringId: string; enabled: boolean }) =>
      Services.toggleKeyring(currentTeam?._id as string, keyringId, enabled),
    onSuccess: (_result, { enabled }) => {
      toast.success(
        translate(
          enabled
            ? 'keyring.successfully.enabled'
            : 'keyring.successfully.disabled'
        )
      );
      return invalidate()
    },
  });

  const toggleApiKey = useMutation({
    mutationFn: ({ sub }: { sub: IKeyringSubscriptionGql; keyringId: string }) =>
      Services.archiveApiKey(currentTeam?._id as string, sub._id, !sub.enabled),
    onSuccess: (_result, { sub, keyringId }) => {
      // `sub` = variables passées à mutate : l'état *avant* le toggle
      toast.success(
        sub.enabled
          ? translate('subscription.successfully.disabled')
          : translate('subscription.successfully.enabled')
      );
      return invalidateSubscriptions()
    },
  });

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
        <span className='a-fake' onClick={() => setDisplayLink(!displayLink)}>
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

  const toggleApiKeyRotation = (
    keyringId: string,
    enabled: boolean,
    rotationEvery: number,
    gracePeriod: number,
    isRotationLocked: boolean
  ) => {
    if (isRotationLocked) {
      toast.error(translate('rotation.error.message'));
      return Promise.resolve();
    }
    return withPendingAction(`keyring:${keyringId}`, () => Services.toggleKeyringRotation(
      currentTeam?._id as string,
      keyringId,
      enabled,
      rotationEvery,
      gracePeriod
    ).then(() => {
      toast.success(translate('subscription.rotation.successfully.setup'));
      invalidate();
    }));
  };

  const regenerateSecret = (keyring: IKeyringForApiGql) =>
    withPendingAction(`keyring:${keyring._id}`, () => confirm({ message: translate('reset.secret.confirm') }).then((ok) => {
      if (!ok) return;

      return Services.regenerateApiKeySecret(currentTeam?._id as string, keyring._id).then(() => {
        invalidate();
        toast.success(translate('secret reseted successfully'));
      });
    }));

  const transferApiKey = (
    subscription: IKeyringSubscriptionGql,
  ) =>
    Services.getSubscriptionTransferLink(currentTeam?._id as string, subscription._id).then(
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
        withPendingAction(`keyring:${keyring._id}`, () => Services.deleteKeyring(currentTeam?._id as string, keyring._id).then((r) => {
          if (!isError(r)) {
            invalidate();
            toast.success(translate('keyring.delete.success'));
          }
        })),
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
    keyring: IKeyringForApiGql,
    callback: () => void
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
        withPendingAction(`subscription:${subscription._id}`, () => Services.deleteApiSubscription(currentTeam?._id as string, subscription._id).then(
          () => {
            invalidate();
            callback();
            toast.success(translate('apikeys.delete.success.message'));
          }
        )),
    });
  };

  const makeUniqueApiKey = (
    subscription: IKeyringSubscriptionGql,
    keyring: IKeyringForApiGql,
    callback: () => void
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
        withPendingAction(`subscription:${subscription._id}`, () => Services.makeUniqueApiKey(currentTeam?._id as string, subscription._id).then(() => {
          invalidate();
          callback();
          toast.success(
            translate('team_apikey_for_api.ask_for_make_unique.success_message')
          );
        })),
    });
  };



  const aggregated = keyring.subscriptionsCount > 1;
  const isApiCMS =
    api.visibility === 'AdminOnly' && api.name.includes('cms');
  // rotation is a keyring-level concern ; it is only offered when the keyring
  // is not aggregated (a single subscription carries it)
  const disableRotation =
    api.visibility === 'AdminOnly' || !!keyring.isRotationLocked;

  const settingsSchema = {
    enabled: {
      type: type.bool,
      label: translate('Enabled'),
      help: translate('help.apikey.rotation'),
      disabled: keyring.isRotationLocked,
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

  const columnHelper = createColumnHelper<DynamicTableFeatures, IKeyringSubscriptionGql>();
  const fetchData: FetchData<IKeyringSubscriptionGql> = ({ limit, offset, filters, sorting }) =>
    customGraphQLClient
      .request<{
        keyringSubscriptions: IKeyringSubscriptionsWithCount
      }>(Services.graphql.getKeyringSubscriptions, {
        keyringId: keyring._id,
        teamId: currentTeam?._id,
        filterTable: JSON.stringify(filters),
        sortingTable: JSON.stringify(sorting),
        limit: limit,
        offset: offset,
      })
      .then(({ keyringSubscriptions }): FetchResult<IKeyringSubscriptionGql> => ({
        items: keyringSubscriptions.subscriptions,
        total: keyringSubscriptions.total
      }
      )
      );


  const { clientId, clientSecret } = keyring.apiKey;
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  type Credential = {
    id: string;
    label: string;
    value: string;
    icon?: ReactNode;
  };


  const credentials: Credential[] = isApiCMS
    ? [
      { id: 'cli.auth', label: 'CLI Auth.', icon: <Terminal />, value: basicAuth },
    ]
    : [
      { id: 'apikey', label: translate('subscription.copy.apikey.label'), value: `${clientId}:${clientSecret}` },
      { id: 'token', label: translate('subscription.copy.token.label'), value: keyring.integrationToken },
      { id: 'bearer.token', label: 'Bearer', value: keyring.bearerToken ?? '' },
      { id: 'basic.auth', label: translate('Basic auth.'), value: `Basic ${basicAuth}` },
    ];

  const buildColumns = ({ setColumnFilters, selectAll, seedFilterLabels }: DynamicTableColumnCtx) => [
    columnHelper.display({
      id: 'api',
      meta: { className: 'api-cell', title: translate('notifications.page.table.header.label.api'), size: 20 },
      cell: (info) => {
        const sub = info.cell.row.original
        const statsLink = `/${currentTeam?._humanReadableId}/settings/apikeys/${sub.api._id}/${sub.api.currentVersion}/subscription/${sub._id}/consumptions`;
        return (
          <div className="d-flex flex-column">
            <Link className="underline" to={statsLink}>
              {sub.api.name}
            </Link>
          </div>
        );
      }
    }),
    columnHelper.display({
      id: 'state',
      meta: { className: 'state-cell', title: translate('State'), size: 15 },
      cell: (info) => {
        const sub = info.cell.row.original;
        const stateClass = !sub.enabled || sub.state === 'blocked'
          ? '--danger'
          : sub.state === 'active'
            ? '--success'
            : '';
        return (
          <div
            className="api-subscription__value__type d-flex align-items-center gap-1"
            aria-label={translate('State')}>
            <div
              className={`dot ${sub.enabled ? 'enabled' : 'disabled'}`}
            />
            <span className={`badge --state d-flex align-items-center gap-2 ${stateClass}`}>
              {(sub.enabled && sub.state === "active") && translate('subscription.enable.label')}
              {(sub.state === "blocked") && translate('subscription.blocked.label')}
              {(!sub.enabled && sub.state === "active") && translate('subscription.disable.label')}
            </span>
          </div>
        );
      }
    }),
    columnHelper.display({
      id: 'env',
      meta: { className: 'env-cell', title: translate('display.environment.label'), size: 20 },
      cell: (info) => {
        const sub = info.cell.row.original
        return (
          <span>
            {sub.plan.customName}
          </span>
        );
      }
    }),
    columnHelper.display({
      id: 'creationDate',
      meta: { className: 'creationDate-cell', title: translate('display.creation.label'), size: 10 },
      cell: (info) => {
        const sub = info.cell.row.original
        return (
          <span>
            {formatDate(
              sub.createdAt,
              translate('date.locale'),
              translate('date.format.without.hours')
            )}
          </span>
        );
      }
    }),
    columnHelper.display({
      id: 'action',
      meta: { className: 'action-cell', size: 5 },
      cell: (info) => {
        const sub = info.cell.row.original
        const rowPending = pendingActions.has(`subscription:${sub._id}`);

        return (
          <span>
            <Can I={manage} a={apikey} team={currentTeam}>
              <div className="dropdown">
                <button
                  className="btn --ghost --small --icon-only dropdown dropdown-menu-button"
                  aria-label={translate('subscription.actions')}
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                  aria-busy={rowPending}
                  disabled={rowPending}
                  id={`dropdown-${sub._id}`}
                >
                  {rowPending ? <Loader className="--rotate" size={24} /> : <EllipsisVertical
                    style={{ fontSize: '18px' }}
                  />}
                </button>
                <div
                  className="dropdown-menu dropdown-menu-end"
                  aria-labelledby={`dropdown-${sub._id}`}
                  style={{ zIndex: 1 }}
                >
                  {!aggregated && (
                    <span
                      className="dropdown-item cursor-pointer"
                      onClick={() => transferApiKey(sub)}
                    >
                      {translate('subscription.transfer.label')}
                    </span>
                  )}
                  {sub.state !== 'blocked' && (
                    <button
                      className="dropdown-item cursor-pointer"
                      onClick={() => toggleSubscriptionState(sub)}
                    >
                      {sub.enabled
                        ? translate('subscription.disable.button.label')
                        : translate('subscription.enable.button.label')}
                    </button>
                  )}
                  {aggregated && (
                    <button
                      className="dropdown-item cursor-pointer danger"
                      onClick={() => makeUniqueApiKey(
                        sub,
                        keyring,
                        () => invalidateSubscriptions()
                      )}
                    >
                      {translate('subscription.extract.button.label')}
                    </button>
                  )}
                  <div className="dropdown-divider" />
                  <button
                    className="dropdown-item cursor-pointer danger"
                    onClick={() => deleteApiKey(
                      sub,
                      keyring,
                      () => invalidateSubscriptions()
                    )}
                  >
                    {translate('subscription.delete.button.label')}
                  </button>
                </div>
              </div>
            </Can>
          </span>
        );
      }
    })
  ];

  const [folding, setFolding] = useState(false);

  const keyringPending = pendingActions.has(`keyring:${keyring._id}`);
  const invalidateSubscriptions = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.keyringSubscriptions(keyring._id) });

  return (
    <div
      className={`keyring-card-new ${folding ? 'folded' : ''}`}
      role='listitem'
      aria-label={translate({
        key: 'keyring.card',
        replacements: [keyring.customName]
      })}
    >
      <div className="keyring-card-ico">
        <div className="keyring-card-ico--icon">
          <KeyRound />
        </div>
      </div>
      <div className="keyring-card-name">
        <h4 title={keyring.customName}>{keyring.customName}</h4>
        <span className={`badge --state d-flex align-items-center gap-2 ${keyring.enabled ? '--success' : '--danger'}`}>
          {keyring.enabled
            ? translate('subscription.enable.label')
            : translate('subscription.disable.label')}
        </span>
      </div>
      <div className="keyring-card-count-env d-flex gap-2">
        <small className="keyring-card-count">
          {keyring.subscriptionsCount}
        </small>
        <small className="keyring-card-env d-flex gap-2">
          <Users size={16} color="var(--primary-color)" />
          {keyring.team.name}
        </small>
        <small className="keyring-card-env d-flex gap-2">
          <Users size={16} color="var(--primary-color)" />
          {keyring.environments.length > 1 ? translate(`keyring.card.${displayType}`) : keyring.environments}
        </small>
      </div>
      <div className="keyring-card-ico-folding">
        <button
          className="btn --ghost --icon-only"
          aria-label={translate('keyring.details')}
          aria-expanded={!folding}
          onClick={() => setFolding(!folding)}>
          {folding ? <ChevronUp /> : <ChevronDown />}
        </button>
      </div>

      {folding &&
        <div className="keyring-card-subscriptions">
          <DynamicTable<IKeyringSubscriptionGql>
            queryKey={QUERY_KEYS.keyringSubscriptions(keyring._id)}
            columns={buildColumns}
            fetchData={fetchData}
            pageSize={6}
            getRowId={row => row._id}
          />
        </div>
      }

      <div className="keyring-card-actions d-flex gap-3">
        {credentials.map(({ id, label, icon, value }) => (
          <span key={id}>
            {label}
            {credentialButton(
              translate(`subscription.copy.${id}.help`),
              translate(`subscription.copy.${id}.aria.label`),
              icon ?? <Copy />,
              value
            )}
          </span>
        ))}
        <Can I={manage} a={apikey} team={currentTeam}>
          <div className="dropdown ms-auto">
            <button
              className={classNames("btn --secondary --small --icon-only dropdown-menu-button", {
                "--ghost": keyringPending,
                "--secondary": !keyringPending,
              })}
              aria-label={translate('keyring.actions')}
              data-bs-toggle="dropdown"
              aria-expanded="false"
              aria-busy={keyringPending}
              disabled={keyringPending}
              id={`keyring-dropdown-${keyring._id}`}
            >
              {keyringPending ? <Loader className="--rotate" size={24} /> : <EllipsisVertical
                style={{ fontSize: '18px' }}
              />}
            </button>
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
                    onSubmit: (data) => () => updateKeyringName(keyring._id, data.customName ?? ''),
                    value: { customName: keyring.customName },
                  })
                }
              >
                {translate('keyring.rename.label')}
              </button>
              {/* TODO: better label */}
              <button className="dropdown-item cursor-pointer"
                onClick={() => toggleKeyringState(keyring)}
              >
                {translate(
                  keyring.enabled
                    ? 'keyring.disable.action.label'
                    : 'keyring.enable.action.label'
                )}
              </button>
              {!aggregated && !disableRotation && (
                <button
                  className={`dropdown-item cursor-pointer${keyring.enabled ? '' : ' disabled'}`}
                  onClick={() => {
                    if (!keyring.enabled) return;
                    openFormModal({
                      title: translate('ApiKey rotation'),
                      actionLabel: translate('Save'),
                      schema: settingsSchema,
                      onSubmit: (data: IRotation) => {
                        if (keyring.enabled) {
                          return toggleApiKeyRotation(
                            keyring._id,
                            data.enabled,
                            data.rotationEvery,
                            data.gracePeriod,
                            keyring.isRotationLocked
                          )
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
                className={`dropdown-item cursor-pointer danger${keyring.enabled ? '' : ' disabled'}`}
                onClick={() => {
                  if (keyring.enabled) regenerateSecret(keyring);
                }}
              >
                {translate('subscription.reset.secret.label')}
              </button>
              <button
                className="dropdown-item cursor-pointer danger"
                onClick={() => deleteKeyring(keyring)}
              >
                {translate('keyring.delete.label')}
              </button>
            </div>
          </div>
        </Can>
      </div>
    </div>
  )
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
