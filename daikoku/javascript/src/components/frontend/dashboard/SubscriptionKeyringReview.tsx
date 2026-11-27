import { ArrowLeft, KeyRound, Send, Users } from 'lucide-react';
import { useContext } from 'react';

import { I18nContext } from '../../../contexts';
import {
  workspacePlanKey,
  type WorkspaceFolder,
  type WorkspacePlan,
} from '../../../services/keyringWorkspace';
import { Callout } from '../../inputs/Callout';

function ReviewPlans({ items }: { items: WorkspacePlan[] }) {
  const { translate } = useContext(I18nContext);
  return (
    <ul className="list-unstyled keyring-workspace__review-plans">
      {items.map((item) => (
        <li key={workspacePlanKey(item)} className="keyring-workspace__plan">
          <span className='d-flex flex-row gap-2 align-items-center'>
            <div className="d-block text-muted">{item.api.name}</div>
            /
            <small>{item.plan.customName}</small>
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
  return (
    <>
      <header className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
        <div>
          <h1>{translate('subscription.workspace.review.title')}</h1>
          <div className="d-flex flex-row gap-2">
            <div className="badge --info --ghost"><strong><Users /> {teamName}</strong></div>
          </div>
        </div>
        <button type="button" className="btn --secondary" disabled={submitting} onClick={onBack}>
          <ArrowLeft size={18} className="me-2" />
          {translate('subscription.workspace.review.back')}
        </button>
      </header>
      <Callout
        level="info"
        title="info"
        body={translate('subscription.workspace.review.approvals')}
      />
      {deprecatedApis.length > 0 && (
        <Callout
          level="warning"
          title={translate({ key: 'subscription.workspace.deprecated.warning.title', plural: deprecatedApis.length > 1 })}
          body={
            <div className='d-flex flex-column gap-2'>
              <div className='d-flex gap-2'>{deprecatedApis.join(', ')}</div>
              <div className='fst-italic'>
                {translate({
                  key: 'subscription.workspace.deprecated.warning',
                })}
              </div>
            </div>
          }
        />
      )}
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      {unavailable && (
        <p className="alert alert-danger" role="alert">
          {translate('subscription.workspace.unavailable')}
        </p>
      )}
      <table className="keyring-workspace__review-table my-4">
        <thead>
          <tr>
            <th scope="col">{translate('subscription.workspace.review.key')}</th>
            <th scope="col">{translate('subscription.workspace.review.plans')}</th>
          </tr>
        </thead>
        <tbody>
          {requested.map((folder) => (
            <tr key={folder.id}>
              <th scope="row">
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <KeyRound size={18} aria-hidden="true" />
                  <strong>{folder.name}</strong>
                  {!folder.keyring && (
                    <span className="badge --info">
                      {translate('subscription.workspace.review.new.badge')}
                    </span>
                  )}
                </div>
              </th>
              <td><ReviewPlans items={folder.items} /></td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <div className="keyring-workspace__review-actions d-flex justify-content-end">
        <button
          type="button"
          className="btn --primary"
          onClick={onSubmit}
          disabled={submitting || unavailable || count === 0}
        >
          <Send size={18} className="me-2" />
          {submitting ? translate('Loading...') : translate('subscription.batch.submit')}
        </button>
      </div>
    </>
  );
}