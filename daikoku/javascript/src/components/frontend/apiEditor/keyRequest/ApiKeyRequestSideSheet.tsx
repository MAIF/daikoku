import { Form, FormRef } from '@maif/react-forms';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Clock, XOctagon } from 'lucide-react';
import { useContext, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Select from 'react-select';

import { I18nContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import { SubscriptionReturn } from '../../../../services';
import {
  IApi,
  isError,
  ISubscription,
  ISubscriptionDemand,
  ITeamSimple,
  IUsagePlan,
  IUsagePlanGQL,
} from '../../../../types';
import { ChoiceChips } from '../../../inputs';
import { InfoCallout, SideSheet, SideSheetActions } from '../../../utils';
import { CmsViewerByPath } from '../../CmsViewer';
import { candidateTeams, teamRestriction, toUsagePlan } from '../environments/planUtils';
import { canAggregate, findCompatibleKeyrings, KeyringApiGQL } from './compatibleKeyrings';

export type AskForApikeys = (request: {
  team: string;
  plan: IUsagePlan;
  keyringId?: string;
  motivation?: object;
  keyringCustomName?: string;
  redirect?: boolean;
}) => Promise<SubscriptionReturn>;

type ApiKeyRequestSideSheetProps = {
  api: IApi;
  ownerTeam: ITeamSimple;
  plans: Array<IUsagePlanGQL>;
  myTeams: Array<ITeamSimple>;
  subscriptions: Array<ISubscription>;
  pendingDemands: Array<ISubscriptionDemand>;
  askForApikeys: AskForApikeys;
  onClose: () => void;
};

type RequestResult = { plan: IUsagePlanGQL; status: SubscriptionReturn };

const keyringIdOf = (subscription: { keyring?: unknown }): string | undefined => {
  const keyring = subscription.keyring as string | { _id: string } | null | undefined;
  return typeof keyring === 'string' ? keyring : keyring?._id;
};

export const ApiKeyRequestSideSheet = (props: ApiKeyRequestSideSheetProps) => {
  const { api, plans } = props;

  const { translate, language } = useContext(I18nContext);
  const { tenant, customGraphQLClient } = useContext(GlobalContext);

  const teamLabelId = useId();
  const keyringLabelId = useId();
  const formRef = useRef<FormRef | undefined>(undefined);

  const [chosenTeamId, setTeamId] = useState<string | null>();
  const [attach, setAttach] = useState<'existing' | 'new'>();
  const [chosenKeyringId, setKeyringId] = useState<string>();
  const [keyringName, setKeyringName] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Array<RequestResult>>();

  const aggregation = canAggregate(tenant, plans);
  const formStep = plans.flatMap((plan) => plan.subscriptionProcess).find((step) => step.type === 'form');
  const defaultKeyringName = plans.length === 1 ? `${api.name} - ${plans[0].customName}` : api.name;

  const context = {
    api,
    ownerTeam: props.ownerTeam,
    tenant,
    myTeams: props.myTeams,
    subscriptions: props.subscriptions,
    pendingDemands: props.pendingDemands,
  };

  const teamOptions = candidateTeams(context).map((team) => {
    const restriction = teamRestriction(team, plans, context);
    return {
      value: team._id,
      label: restriction ? `${team.name} (${translate(restriction)})` : team.name,
      isDisabled: !!restriction,
    };
  });

  const selectableTeams = teamOptions.filter((option) => !option.isDisabled);
  const onlyTeamId = selectableTeams.length === 1 ? selectableTeams[0].value : undefined;
  const teamId = chosenTeamId === undefined ? onlyTeamId : (chosenTeamId ?? undefined);

  const keyringsQuery = useQuery({
    queryKey: ['compatibleKeyrings', teamId, plans.map((p) => p._id)],
    queryFn: () =>
      Services.getAllTeamSubscriptions(teamId!).then((subscriptions) =>
        customGraphQLClient
          .request<{ apis: Array<KeyringApiGQL> }>(Services.graphql.apisByIdsWithPlans, {
            ids: [...new Set(subscriptions.map((s) => s.api))],
          })
          .then(({ apis }) => findCompatibleKeyrings({ plans, tenant, subscriptions, apis }))
      ),
    enabled: !!teamId && aggregation,
  });
  const keyrings = keyringsQuery.data ?? [];
  const keyringId = chosenKeyringId ?? (keyrings.length === 1 ? keyrings[0].keyringId : undefined);
  const canJoinKeyring = aggregation && keyrings.length > 0;
  const joinsKeyring = canJoinKeyring && attach === 'existing';
  const createsKeyring = !canJoinKeyring || attach === 'new';
  const attachChosen = joinsKeyring ? !!keyringId : createsKeyring;

  const hasForm = (plan: IUsagePlanGQL) => plan.subscriptionProcess.some((step) => step.type === 'form');

  const send = (motivation?: object) => {
    const team = teamId!;
    const keyringCustomName = joinsKeyring ? undefined : keyringName || undefined;
    const firstKeyring = joinsKeyring ? keyringId : undefined;

    setSending(true);

    if (plans.length === 1) {
      props
        .askForApikeys({ team, plan: toUsagePlan(plans[0]), keyringId: firstKeyring, keyringCustomName, motivation })
        .then((status) => {
          setSending(false);
          if (!isError(status)) {
            props.onClose();
          }
        });
      return;
    }

    plans
      .reduce<Promise<{ keyring?: string; done: Array<RequestResult> }>>(
        (previous, plan) =>
          previous.then(({ keyring, done }) =>
            props
              .askForApikeys({
                team,
                plan: toUsagePlan(plan),
                keyringId: keyring,
                keyringCustomName: keyring ? undefined : keyringCustomName,
                motivation: hasForm(plan) ? motivation : undefined,
                redirect: false,
              })
              .then((status) => ({
                keyring: keyring ?? (Services.isCreationDone(status) ? keyringIdOf(status.subscription) : undefined),
                done: [...done, { plan, status }],
              }))
          ),
        Promise.resolve({ keyring: firstKeyring, done: [] })
      )
      .then(({ done }) => {
        setSending(false);
        setResults(done);
      });
  };

  const save = () => (formStep ? formRef.current?.handleSubmit() : send());

  if (results) {
    return (
      <SideSheet
        title={translate('api.editor.key.request.title')}
        onClose={props.onClose}
        footer={() => (
          <button type="button" className="btn --primary" onClick={props.onClose}>
            {translate('Close')}
          </button>
        )}
      >
        <RequestResults results={results} api={api} teamId={teamId!} myTeams={props.myTeams} />
      </SideSheet>
    );
  }

  return (
    <SideSheet
      title={translate('api.editor.key.request.title')}
      onClose={props.onClose}
      isDirty={() => !!chosenTeamId || !!keyringName}
      footer={(requestClose) => (
        <SideSheetActions
          onCancel={requestClose}
          onSave={save}
          saveDisabled={sending || !teamId || !attachChosen}
        />
      )}
    >
      {api.state === 'deprecated' && (
        <div className="mb-3">
          <InfoCallout title={translate({ key: 'team.api.state.information.title', replacements: [api.name] })}>
            <CmsViewerByPath
              path={`/apis/${api._humanReadableId}/api-depreciation-warning/${language.toLowerCase()}`}
              fallBack={() => (
                <CmsViewerByPath
                  path={`/api-depreciation-warning/${language.toLowerCase()}`}
                  fallBack={() => (
                    <span>
                      {translate({ key: 'team.api.state.information.message', replacements: [api.name, api.state] })}
                    </span>
                  )}
                />
              )}
            />
          </InfoCallout>
        </div>
      )}

      {plans.length > 1 && (
        <p className="mb-3">
          {translate({
            key: 'api.editor.key.request.plans',
            replacements: [plans.map((plan) => plan.customName).join(', ')],
          })}
        </p>
      )}

      <label id={teamLabelId} className="form-label">
        {translate('api.editor.key.request.team.label')}
      </label>
      <Select
        aria-labelledby={teamLabelId}
        classNamePrefix="reactSelect"
        placeholder={translate('Select')}
        options={teamOptions}
        value={teamOptions.find((option) => option.value === teamId) ?? null}
        onChange={(option) => {
          setTeamId(option?.value ?? null);
          setKeyringId(undefined);
        }}
        isClearable
      />

      {teamId && (
        <>
          <h3>{translate('api.editor.key.request.attach.title')}</h3>

          {canJoinKeyring && (
            <div className="mb-3">
              <ChoiceChips
                label={translate('api.editor.key.request.attach.label')}
                options={[
                  { value: 'existing' as const, label: translate('api.editor.key.request.attach.existing') },
                  { value: 'new' as const, label: translate('api.editor.key.request.attach.new') },
                ]}
                value={attach}
                onChange={setAttach}
              />
            </div>
          )}

          {joinsKeyring && (
            <label id={keyringLabelId} className="form-label">
              {translate('api.editor.key.request.keyring.label')}
            </label>
          )}

          {joinsKeyring && (
            <Select
              aria-labelledby={keyringLabelId}
              classNamePrefix="reactSelect"
              placeholder={translate('Select')}
              options={keyrings.map((keyring) => ({ value: keyring.keyringId, label: keyring.label }))}
              value={
                keyrings
                  .filter((keyring) => keyring.keyringId === keyringId)
                  .map((keyring) => ({ value: keyring.keyringId, label: keyring.label }))[0] ?? null
              }
              onChange={(option) => setKeyringId(option?.value)}
            />
          )}

          {createsKeyring && (
            <>
              <label className="form-label" htmlFor="api-key-request-keyring-name">
                {translate('api.editor.key.request.keyring.name.label')}
              </label>
              <input
                id="api-key-request-keyring-name"
                className="form-control mb-3"
                placeholder={translate({ key: 'api.editor.key.request.keyring.name.placeholder', replacements: [defaultKeyringName] })}
                value={keyringName}
                onChange={(e) => setKeyringName(e.target.value)}
              />
              <InfoCallout>
                {translate({ key: 'api.editor.key.request.keyring.name.help', replacements: [defaultKeyringName] })}
              </InfoCallout>
            </>
          )}

          {formStep && (
            <>
              <h3>{translate('api.editor.key.request.extra.title')}</h3>
              {formStep.info && <div className="mb-3" dangerouslySetInnerHTML={{ __html: formStep.info }} />}
              <Form ref={formRef} schema={formStep.schema} onSubmit={send} footer={() => <></>} />
            </>
          )}
        </>
      )}
    </SideSheet>
  );
};

type RequestResultsProps = {
  results: Array<RequestResult>;
  api: IApi;
  teamId: string;
  myTeams: Array<ITeamSimple>;
};

const RequestResults = ({ results, api, teamId, myTeams }: RequestResultsProps) => {
  const { translate } = useContext(I18nContext);
  const team = myTeams.find((t) => t._id === teamId);

  return (
    <ul className="list-unstyled d-flex flex-column gap-2">
      {results.map(({ plan, status }) => (
        <li key={plan._id} className="d-flex align-items-center gap-2">
          {Services.isCreationDone(status) && <CheckCircle size={16} className="color-success" aria-hidden="true" />}
          {Services.isCreationWaiting(status) && <Clock size={16} aria-hidden="true" />}
          {isError(status) && <XOctagon size={16} className="color-danger" aria-hidden="true" />}
          <span>
            {Services.isCreationDone(status) &&
              translate({ key: 'subscription.plan.accepted', replacements: [plan.customName, team?.name ?? ''] })}
            {Services.isCreationWaiting(status) &&
              translate({ key: 'subscription.plan.waiting', replacements: [plan.customName, team?.name ?? ''] })}
            {isError(status) &&
              translate({ key: 'subscription.plan.failed', replacements: [plan.customName, team?.name ?? ''] })}
          </span>
        </li>
      ))}
      {results.some(({ status }) => Services.isCreationDone(status)) && team && (
        <li>
          <Link to={`/${team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/apikeys?team=${teamId}`}>
            {translate('apikeys.view.api')}
          </Link>
        </li>
      )}
    </ul>
  );
};
