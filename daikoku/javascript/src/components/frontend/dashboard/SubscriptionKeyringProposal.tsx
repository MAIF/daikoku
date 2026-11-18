import { Check, X } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';

import { I18nContext } from '../../../contexts';
import {
  buildWorkspaceProposalDraft,
  proposeWorkspaceKeyrings,
  workspacePlanKey,
  type TeamApiSubscriptions,
  type WorkspaceFolder,
  type WorkspacePlan,
  type WorkspaceProposalGroup,
  type WorkspaceTenant,
} from '../../../services/keyringWorkspace';
import { isPlanSelectableForBatch } from '../../../services/subscriptions';

function ProposalPlans({ items }: { items: WorkspacePlan[] }) {
  return (
    <ul className="list-unstyled keyring-workspace__proposal-plans">
      {items.map((item) => (
        <li key={workspacePlanKey(item)} className="keyring-workspace__plan">
          <span>
            <strong>{item.plan.customName}</strong>
            <small className="d-block text-muted">{item.api.name}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SubscriptionKeyringProposal({
  plans,
  folders,
  tenant,
  subscriptions,
  onCancel,
  onApply,
}: {
  plans: WorkspacePlan[];
  folders: WorkspaceFolder[];
  tenant: WorkspaceTenant;
  subscriptions: TeamApiSubscriptions;
  onCancel: () => void;
  onApply: (next: WorkspaceFolder[]) => void;
}) {
  const { translate } = useContext(I18nContext);
  const heading = useRef<HTMLHeadingElement>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [processChoice, setProcessChoice] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => heading.current?.focus(), []);

  const assigned = folders.flatMap(({ items }) => items);
  const assignedKeys = new Set(assigned.map(workspacePlanKey));
  const unassigned = plans.filter((item) => !assignedKeys.has(workspacePlanKey(item)));
  const initial = proposeWorkspaceKeyrings(plans, folders, tenant, subscriptions);
  const processOptions = new Map<string, WorkspacePlan[]>();
  if (
    initial.errors.some(({ reason }) => reason === 'subscription.workspace.incompatible.process')
  ) {
    for (const candidate of unassigned) {
      const checksum = candidate.plan.subscriptionBatchProcessChecksum;
      if (!candidate.plan.subscriptionProcess.length || !checksum || processOptions.has(checksum))
        continue;
      const reference = [...assigned.map(({ plan }) => plan), candidate.plan];
      if (!isPlanSelectableForBatch(candidate.plan, reference)) continue;
      processOptions.set(
        checksum,
        unassigned.filter(({ plan }) => isPlanSelectableForBatch(plan, reference))
      );
    }
    if (processOptions.size === 0) {
      const neutral = unassigned.filter(
        ({ plan }) =>
          plan.subscriptionProcess.length === 0 &&
          isPlanSelectableForBatch(
            plan,
            assigned.map(({ plan }) => plan)
          )
      );
      if (neutral.length > 0) processOptions.set('', neutral);
    }
  }
  const included = processChoice !== undefined ? (processOptions.get(processChoice) ?? []) : plans;
  const proposal =
    processChoice === undefined && Object.keys(choices).length === 0
      ? initial
      : proposeWorkspaceKeyrings(included, folders, tenant, subscriptions, choices);
  const includedKeys = new Set(included.map(workspacePlanKey));
  const excluded = unassigned.filter((item) => !includedKeys.has(workspacePlanKey(item)));
  const incomplete = proposal.groups.some(({ destination }) => destination.type === 'choice');
  const canApply = proposal.groups.length > 0 && !proposal.errors.length && !incomplete;

  const candidateIds = (group: WorkspaceProposalGroup): string[] => {
    if (group.destination.type === 'choice') return group.destination.folderIds;
    if (group.destination.type !== 'folder') return [];
    if (choices[group.key] === undefined) return [group.destination.folderId];
    const alternatives = { ...choices };
    delete alternatives[group.key];
    const alternative = proposeWorkspaceKeyrings(
      included,
      folders,
      tenant,
      subscriptions,
      alternatives
    ).groups.find(({ key }) => key === group.key)?.destination;
    return alternative?.type === 'choice' ? alternative.folderIds : [group.destination.folderId];
  };
  const apply = () => {
    if (!canApply) return;
    try {
      onApply(buildWorkspaceProposalDraft(proposal, folders, tenant, subscriptions));
    } catch (failure) {
      setError(
        translate(failure instanceof Error ? failure.message : 'subscription.workspace.invalid')
      );
    }
  };

  return (
    <section
      className="keyring-workspace__resolution mb-3"
      aria-label={translate('subscription.workspace.proposal.title')}
    >
      <header className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <h2 ref={heading} tabIndex={-1}>
          {translate('subscription.workspace.proposal.title')}
        </h2>
        <button type="button" className="btn --secondary" onClick={onCancel}>
          <X size={18} className="me-2" />
          {translate('subscription.workspace.proposal.cancel')}
        </button>
      </header>
      {processOptions.size > 0 && (
        <fieldset className="mb-4">
          <legend className="h6">
            {translate('subscription.workspace.proposal.process.choose')}
          </legend>
          {[...processOptions].map(([key, items], index) => (
            <div key={key} className="mb-3">
              <label className="d-flex align-items-center gap-2">
                <input
                  type="radio"
                  name="workspace-proposal-process"
                  checked={processChoice === key}
                  onChange={() => {
                    setProcessChoice(key);
                    setChoices({});
                    setError(undefined);
                  }}
                />
                {translate({
                  key: 'subscription.workspace.proposal.process.option',
                  replacements: [String(index + 1), String(items.length)],
                })}
              </label>
              <details>
                <summary>
                  {translate({
                    key: 'subscription.workspace.proposal.plans',
                    replacements: [String(items.length)],
                  })}
                </summary>
                <ProposalPlans items={items} />
              </details>
            </div>
          ))}
        </fieldset>
      )}
      {proposal.errors.map((failure, index) => (
        <p key={index} className="alert alert-danger" role="alert">
          {translate(failure.reason)}
        </p>
      ))}
      {error && (
        <p className="alert alert-danger" role="alert">
          {error}
        </p>
      )}
      {incomplete && <p role="status">{translate('subscription.workspace.proposal.incomplete')}</p>}
      {proposal.groups.length === 0 && proposal.errors.length === 0 && (
        <p>{translate('subscription.workspace.proposal.empty')}</p>
      )}
      {proposal.groups
        .filter((group) => group.destination.type === 'choice' || choices[group.key] !== undefined)
        .map((group) => {
          const options = candidateIds(group);
          return (
            <div
              key={group.key}
              className="keyring-workspace__proposal-group"
              data-testid="workspace-proposal-group"
            >
              <h3 className="h6 mb-0">{group.environment}</h3>
              <div>
                <label className="d-block mb-2">
                  <span className="d-block mb-1">
                    {translate('subscription.workspace.destination')}
                  </span>
                  <select
                    className="form-select"
                    value={choices[group.key] ?? ''}
                    aria-label={translate({
                      key: 'subscription.workspace.proposal.destination',
                      replacements: [group.environment],
                    })}
                    onChange={(event) => {
                      const value = event.target.value;
                      setChoices((current) => {
                        const next = { ...current };
                        if (value) next[group.key] = value;
                        else delete next[group.key];
                        return next;
                      });
                      setError(undefined);
                    }}
                  >
                    <option value="">{translate('subscription.workspace.proposal.choose')}</option>
                    {options.map((id) => (
                      <option key={id} value={id}>
                        {folders.find((folder) => folder.id === id)?.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <details>
                <summary>
                  {translate({
                    key: 'subscription.workspace.proposal.plans',
                    replacements: [String(group.items.length)],
                  })}
                </summary>
                <ProposalPlans items={group.items} />
              </details>
            </div>
          );
        })}
      {excluded.length > 0 && (
        <details className="my-3">
          <summary>
            {translate({
              key: 'subscription.workspace.proposal.excluded',
              replacements: [String(excluded.length)],
            })}
          </summary>
          <ProposalPlans items={excluded} />
        </details>
      )}
      <div className="d-flex justify-content-end mt-3">
        <button type="button" className="btn --primary" disabled={!canApply} onClick={apply}>
          <Check size={18} className="me-2" />
          {translate('subscription.workspace.proposal.apply')}
        </button>
      </div>
    </section>
  );
}
