import { ArrowLeft, KeyRound, Send } from 'lucide-react';
import { useContext } from 'react';

import { I18nContext } from '../../../contexts';
import {
  workspacePlanKey,
  type WorkspaceFolder,
  type WorkspacePlan,
} from '../../../services/keyringWorkspace';

function ReviewPlans({ items }: { items: WorkspacePlan[] }) {
  const { translate } = useContext(I18nContext);
  return (
    <ul className="list-unstyled keyring-workspace__review-plans">
      {items.map((item) => (
        <li key={workspacePlanKey(item)} className="keyring-workspace__plan">
          <span>
            <strong>{item.plan.customName}</strong>
            <small className="d-block text-muted">{item.api.name}</small>
            {item.api.state === 'deprecated' && (
              <span className="badge --warning mt-1">{translate('subscription.workspace.deprecated.badge')}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SubscriptionKeyringReview({
  folders,
  unassigned,
  teamName,
  submitting,
  unavailable,
  error,
  onBack,
  onSubmit,
}: {
  folders: WorkspaceFolder[];
  unassigned: WorkspacePlan[];
  teamName: string;
  submitting: boolean;
  unavailable: boolean;
  error?: string;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { translate } = useContext(I18nContext);
  const requested = folders.filter(({ items }) => items.length > 0);
  const count = requested.reduce((total, folder) => total + folder.items.length, 0);
  const deprecatedApis = [...new Map(
    requested.flatMap(({ items }) => items)
      .filter(({ api }) => api.state === 'deprecated')
      .map(({ api }) => [api._id, api.name])
  ).values()];
  const groups = [
    {
      key: 'subscription.workspace.review.new',
      folders: requested.filter((folder) => !folder.keyring),
    },
    {
      key: 'subscription.workspace.review.existing',
      folders: requested.filter((folder) => folder.keyring),
    },
  ];
  return (
    <>
      <header className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
        <div>
          <h1>{translate('subscription.workspace.review.title')}</h1>
          <p className="text-muted mb-0">
            {translate('Team')}: <strong>{teamName}</strong>
          </p>
        </div>
        <button type="button" className="btn --secondary" disabled={submitting} onClick={onBack}>
          <ArrowLeft size={18} className="me-2" />
          {translate('subscription.workspace.review.back')}
        </button>
      </header>
      <p>{translate('subscription.workspace.review.approvals')}</p>
      {deprecatedApis.length > 0 && (
        <p className="alert alert-warning" role="alert">
          {translate({
            key: 'subscription.workspace.deprecated.warning',
            replacements: [deprecatedApis.join(', ')],
          })}
        </p>
      )}
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      {unavailable && (
        <p className="alert alert-danger" role="alert">
          {translate('subscription.workspace.unavailable')}
        </p>
      )}
      {groups.map((group) => (
        <section key={group.key} className="my-4">
          <h2>{translate({ key: group.key, replacements: [String(group.folders.length)] })}</h2>
          {group.folders.length === 0 && (
            <p className="text-muted">{translate('subscription.workspace.review.none')}</p>
          )}
          {group.folders.map((folder) => (
            <details key={folder.id} className="keyring-workspace__review-key">
              <summary>
                <KeyRound size={18} className="mx-2" aria-hidden="true" />
                <strong>{folder.name}</strong>
                <span className="ms-2 text-muted">
                  {translate({
                    key: 'subscription.workspace.proposal.plans',
                    replacements: [String(folder.items.length)],
                  })}
                </span>
              </summary>
              <ReviewPlans items={folder.items} />
            </details>
          ))}
        </section>
      ))}
      {unassigned.length > 0 && (
        <section className="my-4">
          <details>
            <summary>
              <strong>
                {translate({
                  key: 'subscription.workspace.proposal.excluded',
                  replacements: [String(unassigned.length)],
                })}
              </strong>
            </summary>
            <ReviewPlans items={unassigned} />
          </details>
          <p className="small text-muted mt-2">{translate('subscription.workspace.review.excluded')}</p>
        </section>
      )}
      <footer className="keyring-workspace__footer">
        <strong>
          {translate({
            key: 'subscription.workspace.summary',
            replacements: [String(count), String(requested.length)],
          })}
        </strong>
        <button
          type="button"
          className="btn --primary"
          onClick={onSubmit}
          disabled={submitting || unavailable || count === 0}
        >
          <Send size={18} className="me-2" />
          {submitting ? translate('Loading...') : translate('subscription.batch.submit')}
        </button>
      </footer>
    </>
  );
}