import { Form, FormRef } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { useContext, useId, useRef, useState } from 'react';
import Select from 'react-select';
import { toast } from 'sonner';

import { QUERY_KEYS } from '../../../../constants/queryKeys';
import { I18nContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import { SubscriptionReturn } from '../../../../services';
import {
  BatchKeyringGroup,
  buildBatchKeyringSelection,
  groupBatchPlansByKeyring,
} from '../../../../services/subscriptions';
import {
  IApi,
  isError,
  ISubscription,
  ISubscriptionDemand,
  ITeamSimple,
  IUsagePlan,
  IUsagePlanGQL,
} from '../../../../types';
import { InfoCallout, SideSheet, SideSheetActions } from '../../../utils';
import { CmsViewerByPath } from '../../CmsViewer';
import { candidateTeams, teamRestriction, toUsagePlan } from '../environments/planUtils';
import { canAggregate, findCompatibleKeyrings, KeyringApiGQL } from './compatibleKeyrings';
import { KeyringChoice, KeyringChoiceFields, ResolvedKeyringChoice } from './KeyringChoiceFields';

export type AskForApikeys = (request: {
  team: string;
  plan: IUsagePlan;
  keyringId?: string;
  motivation?: object;
  keyringCustomName?: string;
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

type PlanToRequest = {
  api: IApi;
  plan: IUsagePlanGQL;
};

const NO_KEYRING_CHOICE: KeyringChoice = {
  newKeyringName: '',
};

export const ApiKeyRequestSideSheet = (props: ApiKeyRequestSideSheetProps) => {
  const { api, plans } = props;

  const { translate, language } = useContext(I18nContext);
  const { tenant, customGraphQLClient } = useContext(GlobalContext);

  const queryClient = useQueryClient();

  const teamLabelId = useId();
  const formRef = useRef<FormRef | undefined>(undefined);

  const [chosenTeamId, setTeamId] = useState<string | null>();
  const [keyringChoices, setKeyringChoices] = useState<Record<string, KeyringChoice>>({});
  const [sending, setSending] = useState(false);

  const keyringGroups = groupBatchPlansByKeyring(plans.map((plan) => ({ api, plan })));
  const formStep = plans.flatMap((plan) => plan.subscriptionProcess).find((step) => step.type === 'form');

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

  const teamSubscriptionsQuery = useQuery({
    queryKey: QUERY_KEYS.teamSubscriptionsWithApis(teamId),
    queryFn: () =>
      Services.getAllTeamSubscriptions(teamId!).then((subscriptions) =>
        customGraphQLClient
          .request<{ apis: Array<KeyringApiGQL> }>(Services.graphql.apisByIdsWithPlans, {
            ids: [...new Set(subscriptions.map((s) => s.api))],
          })
          .then(({ apis }) => ({
            subscriptions,
            apis,
          }))
      ),
    enabled: !!teamId && !!tenant.aggregationApiKeysSecurity,
  });
  const teamSubscriptions = teamSubscriptionsQuery.data;

  const resolveKeyringChoice = (group: BatchKeyringGroup<PlanToRequest>): ResolvedKeyringChoice => {
    const groupPlans = group.items.map((item) => item.plan);
    const choice = keyringChoices[group.key] ?? NO_KEYRING_CHOICE;

    const compatibleKeyrings =
      teamSubscriptions && canAggregate(tenant, groupPlans)
        ? findCompatibleKeyrings({ plans: groupPlans, tenant, ...teamSubscriptions })
        : [];
    const onlyCompatibleKeyringId = compatibleKeyrings.length === 1 ? compatibleKeyrings[0].keyringId : undefined;

    const canJoinKeyring = compatibleKeyrings.length > 0;
    const joinsKeyring = canJoinKeyring && choice.attach === 'existing';
    const createsKeyring = !canJoinKeyring || choice.attach === 'new';
    const joinedKeyringId = joinsKeyring ? (choice.keyringId ?? onlyCompatibleKeyringId) : undefined;

    return {
      groupKey: group.key,
      title:
        plans.length === 1
          ? translate('api.editor.key.request.attach.title')
          : translate({ key: 'subscription.batch.keyring.group.choice', replacements: [group.name] }),
      choice,
      compatibleKeyrings,
      joinsKeyring,
      createsKeyring,
      joinedKeyringId,
      defaultKeyringName: `${api.name} - ${group.name}`,
      isComplete: joinsKeyring ? !!joinedKeyringId : createsKeyring,
    };
  };

  const resolvedKeyringChoices = keyringGroups.map(resolveKeyringChoice);
  const everyKeyringChosen = resolvedKeyringChoices.every((resolved) => resolved.isComplete);

  const requestSinglePlan = (team: string, motivation?: object) => {
    const [keyringChoice] = resolvedKeyringChoices;
    const newKeyringName = keyringChoice.joinsKeyring ? undefined : keyringChoice.choice.newKeyringName || undefined;

    props
      .askForApikeys({
        team,
        plan: toUsagePlan(plans[0]),
        keyringId: keyringChoice.joinedKeyringId,
        keyringCustomName: newKeyringName,
        motivation,
      })
      .then((status) => {
        setSending(false);

        if (!isError(status)) {
          props.onClose();
        }
      });
  };

  const requestPlansAsBatch = (team: string, motivation?: object) => {
    const teamName = props.myTeams.find((t) => t._id === team)?.name ?? '';
    const joinedKeyringIdByGroup = Object.fromEntries(
      resolvedKeyringChoices
        .filter((resolved) => !!resolved.joinedKeyringId)
        .map((resolved) => [resolved.groupKey, resolved.joinedKeyringId!])
    );
    const newKeyringNameByGroup = Object.fromEntries(
      resolvedKeyringChoices.map((resolved) => [
        resolved.groupKey,
        resolved.choice.newKeyringName || resolved.defaultKeyringName,
      ])
    );
    const keyringSelection = buildBatchKeyringSelection(
      keyringGroups,
      joinedKeyringIdByGroup,
      newKeyringNameByGroup,
      teamName
    );

    Services.submitSubscriptionBatch(team, {
      ...keyringSelection,
      team,
      idempotencyKey: nanoid(),
      motivation,
    }).then((receipt) => {
      setSending(false);

      if (isError(receipt)) {
        toast.error(receipt.error);
        return;
      }

      toast.info(
        translate({
          key: 'subscription.batch.submitted',
          replacements: [String(keyringSelection.items.length), teamName],
        })
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mySubscriptions() });
      props.onClose();
    });
  };

  const send = (motivation?: object) => {
    const team = teamId!;

    setSending(true);

    if (plans.length === 1) {
      requestSinglePlan(team, motivation);
      return;
    }

    requestPlansAsBatch(team, motivation);
  };

  const save = () => (formStep ? formRef.current?.handleSubmit() : send());

  const changeKeyringChoice = (groupKey: string, choice: KeyringChoice) =>
    setKeyringChoices((current) => ({
      ...current,
      [groupKey]: choice,
    }));

  const forgetChosenKeyrings = () =>
    setKeyringChoices((current) =>
      Object.fromEntries(
        Object.entries(current).map(([groupKey, choice]) => [
          groupKey,
          {
            ...choice,
            keyringId: undefined,
          },
        ])
      )
    );

  const hasTypedKeyringName = Object.values(keyringChoices).some((choice) => !!choice.newKeyringName);

  return (
    <SideSheet
      title={translate('api.editor.key.request.title')}
      onClose={props.onClose}
      isDirty={() => !!chosenTeamId || hasTypedKeyringName}
      footer={(requestClose) => (
        <SideSheetActions
          onCancel={requestClose}
          onSave={save}
          saveDisabled={sending || !teamId || !everyKeyringChosen}
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
          forgetChosenKeyrings();
        }}
        isClearable
      />

      {teamId && (
        <>
          {resolvedKeyringChoices.map((resolved) => (
            <KeyringChoiceFields
              key={resolved.groupKey}
              resolved={resolved}
              onChange={(choice) => changeKeyringChoice(resolved.groupKey, choice)}
            />
          ))}

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
