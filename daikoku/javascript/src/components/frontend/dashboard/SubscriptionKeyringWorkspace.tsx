import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  GripVertical,
  Import,
  KeyRound,
  Layers,
  LockKeyhole,
  Plus,
  Undo2,
  WandSparkles,
  X,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBeforeUnload, useBlocker, useLocation, useNavigate } from 'react-router-dom';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import {
  buildWorkspaceProposalDraft,
  buildWorkspaceSubmission,
  getWorkspaceAssignmentError,
  proposeWorkspaceKeyrings,
  workspacePlanKey,
  WorkspaceFolder,
  WorkspacePlan,
} from '../../../services/keyringWorkspace';
import { IApiWithAuthorization, ITeamSimple } from '../../../types';
import { Display } from '../../../types/tenant';
import { SubscriptionKeyringProposal } from './SubscriptionKeyringProposal';
import { SubscriptionKeyringReview } from './SubscriptionKeyringReview';
import { useSubscriptionBatch } from './useSubscriptionBatch';
import './subscriptionKeyringWorkspace.scss';

export type KeyringWorkspaceLocationState = {
  apis: IApiWithAuthorization[];
  team: ITeamSimple;
};

export function SubscriptionKeyringWorkspace() {
  const state = useLocation().state as KeyringWorkspaceLocationState | null;
  const { connectedUser } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);
  if (connectedUser.isGuest || !state?.apis?.length || !state.team?._id) {
    return (
      <div className="p-4">
        <p>{translate('subscription.workspace.missing')}</p>
        <Link to="/apis">{translate('subscription.workspace.back')}</Link>
      </div>
    );
  }
  return <KeyringWorkspace key={state.team._id} {...state} />;
}

function WorkspaceDropZone({
  id,
  label,
  compatible,
  targetId,
  className = '',
  children,
}: PropsWithChildren<{
  id: string;
  label: string;
  compatible?: boolean;
  targetId?: string;
  className?: string;
}>) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { targetId: targetId ?? id } });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={`keyring-workspace__zone ${className} ${isOver ? (compatible === false ? '--invalid' : '--over') : ''}`}
    >
      {children}
    </section>
  );
}

function WorkspacePlanCard({
  item,
  selected,
  disabled,
  onSelect,
  onRemove,
}: {
  item: WorkspacePlan;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const { translate } = useContext(I18nContext);
  const label = `${item.api.name} / ${item.plan.customName}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: workspacePlanKey(item),
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={`keyring-workspace__plan ${selected ? '--selected' : ''}`}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      data-testid="workspace-plan"
      data-plan-key={workspacePlanKey(item)}
    >
      <button
        type="button"
        className="keyring-workspace__handle"
        {...attributes}
        {...listeners}
        aria-label={translate({ key: 'subscription.workspace.drag', replacements: [label] })}
        disabled={disabled}
      >
        <GripVertical size={18} />
      </button>
      <label className="d-flex align-items-center gap-2 flex-grow-1">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
          aria-label={translate({ key: 'subscription.workspace.select', replacements: [label] })}
        />
        <span>
          <strong>{item.plan.customName}</strong>
          <small className="d-block text-muted">{item.api.name}</small>
        </span>
      </label>
      {onRemove && (
        <button
          type="button"
          className="btn --secondary --icon-only"
          disabled={disabled}
          onClick={onRemove}
          aria-label={translate({ key: 'subscription.workspace.unassign', replacements: [label] })}
        >
          <Undo2 size={16} />
        </button>
      )}
    </div>
  );
}

function WorkspaceKeyringImport({
  keyrings,
  onImport,
  onCancel,
}: {
  keyrings: NonNullable<WorkspaceFolder['keyring']>[];
  onImport: (ids: string[]) => void;
  onCancel: () => void;
}) {
  const { translate } = useContext(I18nContext);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const query = search.trim().toLocaleLowerCase();
  const visibleKeyrings = keyrings.filter((keyring) =>
    `${keyring.customName ?? ''} ${keyring._id}`.toLocaleLowerCase().includes(query)
  );
  return (
    <>
      <input
        type="search"
        className="form-control mb-3"
        autoFocus
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label={translate('subscription.workspace.import.search')}
        placeholder={translate('subscription.workspace.import.search')}
      />
      <div className="keyring-workspace__import-options">
        {visibleKeyrings.map((keyring) => (
          <label
            key={keyring._id}
            className={`keyring-workspace__plan ${selectedIds.includes(keyring._id) ? '--selected' : ''}`}
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(keyring._id)}
              aria-label={translate({
                key: 'subscription.workspace.import.select',
                replacements: [keyring.customName || keyring._id],
              })}
              onChange={() =>
                setSelectedIds((current) =>
                  current.includes(keyring._id)
                    ? current.filter((id) => id !== keyring._id)
                    : [...current, keyring._id]
                )
              }
            />
            <KeyRound size={20} className="keyring-workspace__folder-icon" />
            <span>
              <strong>{keyring.customName || keyring._id}</strong>
              {keyring.customName && <small className="d-block text-muted">{keyring._id}</small>}
            </span>
          </label>
        ))}
        {visibleKeyrings.length === 0 && (
          <p className="text-muted" role="status">
            {translate('subscription.workspace.import.empty')}
          </p>
        )}
      </div>
      <div className="d-flex flex-wrap justify-content-between gap-2 mt-3">
        <button type="button" className="btn --secondary" onClick={onCancel}>
          {translate('Cancel')}
        </button>
        <button
          type="button"
          className="btn --primary"
          disabled={selectedIds.length === 0}
          onClick={() => onImport(selectedIds)}
        >
          <Import size={18} className="me-2" />
          {translate({
            key: 'subscription.workspace.import.confirm',
            replacements: [String(selectedIds.length)],
          })}
        </button>
      </div>
    </>
  );
}

function WorkspaceLeaveConfirmation({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  useEffect(() => {
    let active = true;
    confirm({
      title: translate('subscription.workspace.leave.title'),
      message: translate('subscription.workspace.leave.message'),
      cancelLabel: translate('subscription.workspace.leave.stay'),
      okLabel: translate('subscription.workspace.leave.confirm'),
      defaultCancel: true,
    }).then((leave) => {
      if (active) {
        if (leave) onLeave();
        else onStay();
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return null;
}

function KeyringWorkspace({ apis, team }: KeyringWorkspaceLocationState) {
  const { translate } = useContext(I18nContext);
  const { tenant } = useContext(GlobalContext);
  const { close, openCustomModal } = useContext(ModalContext);
  const navigate = useNavigate();
  const submitted = useRef(false);
  const {
    availablePlanSets,
    subscriptionsQuery,
    loading,
    failed,
    submitting,
    submitWithMotivation,
  } = useSubscriptionBatch(apis, team, () => {
    submitted.current = true;
    close();
    navigate('/apis', { replace: true });
  });
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const blocker = useBlocker(() => folders.length > 0 && !submitted.current);
  useBeforeUnload((event) => {
    if (folders.length === 0 || submitted.current) return;
    event.preventDefault();
    event.returnValue = '';
  });
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string>();
  const [proposalOpen, setProposalOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [arrangementUndo, setArrangementUndo] = useState<{
    before: WorkspaceFolder[];
    after: WorkspaceFolder[];
    selectedFolderId: string;
    selectedKeys: string[];
  }>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );
  const plans = useMemo<WorkspacePlan[]>(
    () =>
      availablePlanSets.flatMap(({ api, plans }) => plans.map((plan) => ({ api: api.api, plan }))),
    [availablePlanSets]
  );
  const planMap = new Map(plans.map((item) => [workspacePlanKey(item), item]));
  const assigned = folders.flatMap((folder) => folder.items);
  const assignedKeys = new Set(assigned.map(workspacePlanKey));
  const unassigned = plans.filter((item) => !assignedKeys.has(workspacePlanKey(item)));
  const visiblePlans = unassigned.filter((item) =>
    `${item.api.name} ${item.plan.customName}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase())
  );
  const visiblePlanGroups = new Map<string | undefined, WorkspacePlan[]>(
    tenant.display === Display.environment ? plans.map(({ plan }) => [plan.customName, []]) : []
  );
  for (const item of visiblePlans) {
    const name = tenant.display === Display.environment ? item.plan.customName : undefined;
    const group = visiblePlanGroups.get(name);
    if (group) group.push(item);
    else visiblePlanGroups.set(name, [item]);
  }
  const existingKeyrings = [
    ...new Map(
      (subscriptionsQuery.data?.subscriptions ?? []).flatMap((subscription) =>
        subscription.keyring ? [[subscription.keyring._id, subscription.keyring] as const] : []
      )
    ).values(),
  ].filter((keyring) => !folders.some((folder) => folder.keyring?._id === keyring._id));
  const hasUnavailablePlans = assigned.some((item) => !planMap.has(workspacePlanKey(item)));
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? folders[0];

  const prepareMove = (
    keys: string[],
    folderId?: string
  ): { folders: WorkspaceFolder[]; error?: never } | { error: string; folders?: never } => {
    if (!subscriptionsQuery.data) return { error: 'subscription.workspace.invalid' };
    const moving = keys.map((key) => planMap.get(key));
    if (folderId && moving.some((item) => !item)) {
      return { error: 'subscription.workspace.unavailable' };
    }
    let next = folders.map((folder) => ({
      ...folder,
      items: folder.items.filter((item) => !keys.includes(workspacePlanKey(item))),
    }));
    if (folderId) {
      for (const item of moving) {
        if (!item) continue;
        const target = next.find((folder) => folder.id === folderId);
        if (!target) return { error: 'subscription.workspace.invalid' };
        const reason = getWorkspaceAssignmentError(
          item,
          target,
          next,
          tenant,
          subscriptionsQuery.data
        );
        if (reason) {
          return { error: reason };
        }
        next = next.map((folder) =>
          folder.id === folderId ? { ...folder, items: [...folder.items, item] } : folder
        );
      }
    }
    return { folders: next };
  };
  const movePlans = (keys: string[], folderId?: string) => {
    if (submitting) return;
    const result = prepareMove(keys, folderId);
    if (!result.folders) {
      setError(translate(result.error));
      return;
    }
    setFolders(result.folders);
    if (folderId) setSelectedFolderId(folderId);
    setSelectedKeys([]);
    setError(undefined);
  };
  const toggleSelection = (key: string) =>
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((selected) => selected !== key) : [...current, key]
    );
  const addFolder = () => {
    const id = nanoid();
    setFolders((current) => [
      ...current,
      {
        id,
        name: `${team.name} - ${translate('subscription.workspace.keyring')} ${current.length + 1}`,
        items: [],
      },
    ]);
    setSelectedFolderId(id);
  };
  const openKeyringImport = () => {
    if (submitting || existingKeyrings.length === 0) return;
    openCustomModal({
      title: translate('subscription.workspace.import.open'),
      content: (
        <WorkspaceKeyringImport
          keyrings={existingKeyrings}
          onCancel={close}
          onImport={(ids) => {
            if (submitting) return;
            const imported = existingKeyrings
              .filter((keyring) => ids.includes(keyring._id))
              .map((keyring) => ({
                id: nanoid(),
                name: keyring.customName || keyring._id,
                keyring,
                items: [],
              }));
            setFolders((current) => [
              ...current,
              ...imported.filter(
                (candidate) =>
                  !current.some((folder) => folder.keyring?._id === candidate.keyring._id)
              ),
            ]);
            if (imported.length > 0) setSelectedFolderId(imported[0].id);
            close();
          }}
        />
      ),
    });
  };
  const applyArrangement = (next: WorkspaceFolder[]) => {
    if (submitting) return;
    const target = next.find(
      (folder) =>
        folder.items.length > (folders.find(({ id }) => id === folder.id)?.items.length ?? 0)
    );
    setArrangementUndo({
      before: folders,
      after: next,
      selectedFolderId,
      selectedKeys,
    });
    setFolders(next);
    if (target) {
      setSelectedFolderId(target.id);
    }
    setSelectedKeys([]);
    setError(undefined);
    setProposalOpen(false);
  };
  const arrange = () => {
    if (submitting || !subscriptionsQuery.data || hasUnavailablePlans) return;
    const proposal = proposeWorkspaceKeyrings(plans, folders, tenant, subscriptionsQuery.data);
    if (
      proposal.errors.length > 0 ||
      proposal.groups.some(({ destination }) => destination.type === 'choice')
    ) {
      setError(undefined);
      setProposalOpen(true);
      return;
    }
    try {
      applyArrangement(
        buildWorkspaceProposalDraft(proposal, folders, tenant, subscriptionsQuery.data)
      );
    } catch (failure) {
      setError(
        translate(failure instanceof Error ? failure.message : 'subscription.workspace.invalid')
      );
    }
  };
  const undoArrangement = () => {
    if (submitting || !arrangementUndo || folders !== arrangementUndo.after) return;
    setFolders(arrangementUndo.before);
    setSelectedFolderId(arrangementUndo.selectedFolderId);
    setSelectedKeys(arrangementUndo.selectedKeys);
    setArrangementUndo(undefined);
    setError(undefined);
    setProposalOpen(false);
  };
  const openReview = () => {
    if (!subscriptionsQuery.data || hasUnavailablePlans || submitting || assigned.length === 0) return;
    try {
      buildWorkspaceSubmission(folders, tenant, subscriptionsQuery.data);
      setError(undefined);
      setReviewOpen(true);
    } catch (failure) {
      setError(translate(failure instanceof Error ? failure.message : 'subscription.workspace.invalid'));
    }
  };
  const submit = () => {
    if (!subscriptionsQuery.data || hasUnavailablePlans || submitting) return;
    try {
      const selection = buildWorkspaceSubmission(folders, tenant, subscriptionsQuery.data);
      setError(undefined);
      submitWithMotivation(
        selection,
        assigned.map(({ plan }) => plan)
      );
    } catch (error) {
      setError(
        translate(error instanceof Error ? error.message : 'subscription.workspace.invalid')
      );
    }
  };
  if (loading) return <p className="p-4">{translate('Loading...')}</p>;
  if (failed)
    return (
      <div className="p-4">
        <p role="alert">{translate('subscription.batch.plans.failed')}</p>
        <Link to="/apis">{translate('subscription.workspace.back')}</Link>
      </div>
    );

  if (reviewOpen) {
    return (
      <div className="keyring-workspace">
        {blocker.state === 'blocked' && (
          <WorkspaceLeaveConfirmation onStay={blocker.reset} onLeave={blocker.proceed} />
        )}
        <SubscriptionKeyringReview
          folders={folders}
          unassigned={unassigned}
          teamName={team.name}
          submitting={submitting}
          unavailable={hasUnavailablePlans}
          error={error}
          onBack={() => setReviewOpen(false)}
          onSubmit={submit}
        />
      </div>
    );
  }

  return (
    <div className="keyring-workspace">
      {blocker.state === 'blocked' && (
        <WorkspaceLeaveConfirmation onStay={blocker.reset} onLeave={blocker.proceed} />
      )}
      <header className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
        <div>
          <h1>{translate('subscription.workspace.title')}</h1>
          <p className="text-muted mb-0">
            {translate('Team')}: <strong>{team.name}</strong>
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Link className={`btn --secondary ${submitting ? 'disabled' : ''}`} to="/apis">
            {translate('subscription.workspace.back')}
          </Link>
        </div>
      </header>
      <p className="small text-muted mb-3">{translate('subscription.workspace.not.created')}</p>
      {proposalOpen && subscriptionsQuery.data && tenant.display === Display.environment && (
        <SubscriptionKeyringProposal
          plans={plans}
          folders={folders}
          tenant={tenant}
          subscriptions={subscriptionsQuery.data}
          onCancel={() => setProposalOpen(false)}
          onApply={applyArrangement}
        />
      )}
      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {hasUnavailablePlans && (
        <p role="alert" className="alert alert-danger">
          {translate('subscription.workspace.unavailable')}
        </p>
      )}
      <div className="keyring-workspace__toolbar">
        <span aria-live="polite">
          {translate({
            key: 'subscription.workspace.selected',
            replacements: [String(selectedKeys.length)],
          })}
        </span>
        <button
          type="button"
          className="btn --secondary"
          disabled={submitting || selectedKeys.length === 0}
          onClick={() => setSelectedKeys([])}
        >
          {translate('subscription.workspace.clear')}
        </button>
        {tenant.display === Display.environment && (
          <button
            type="button"
            className="btn --secondary ms-auto"
            disabled={submitting || proposalOpen || unassigned.length === 0 || hasUnavailablePlans}
            onClick={arrange}
          >
            <WandSparkles size={18} className="me-2" />
            {translate('subscription.workspace.proposal.action')}
          </button>
        )}
        {arrangementUndo && folders === arrangementUndo.after && (
          <button
            type="button"
            className="btn --secondary"
            disabled={submitting}
            onClick={undoArrangement}
          >
            <Undo2 size={18} className="me-2" />
            {translate('subscription.workspace.arrangement.undo')}
          </button>
        )}
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => {
          const key = String(active.id);
          setActiveKeys(selectedKeys.includes(key) ? selectedKeys : [key]);
        }}
        onDragCancel={() => setActiveKeys([])}
        onDragEnd={({ over }) => {
          if (over) {
            const targetId = String(over.data.current?.targetId ?? over.id);
            movePlans(activeKeys, targetId === 'unassigned' ? undefined : targetId);
          }
          setActiveKeys([]);
        }}
      >
        <div className="keyring-workspace__layout">
          <WorkspaceDropZone
            id="unassigned"
            label={translate('subscription.workspace.unassigned')}
          >
            <h2>
              {translate('subscription.workspace.unassigned')} <small>({unassigned.length})</small>
            </h2>
            {availablePlanSets
              .filter(({ plans }) => plans.length === 0)
              .map(({ api }) => (
                <p key={api.api._id} className="text-muted">
                  {api.api.name}: {translate('subscription.batch.no.plans')}
                </p>
              ))}
            <input
              type="search"
              className="form-control mb-3"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={translate('subscription.workspace.search')}
              placeholder={translate('subscription.workspace.search')}
            />
            <div className="d-flex gap-2 flex-wrap mb-3">
              <button
                type="button"
                className="btn --secondary --small"
                disabled={submitting || !visiblePlans.length}
                onClick={() => setSelectedKeys(visiblePlans.map(workspacePlanKey))}
              >
                {translate('subscription.workspace.select.visible')}
              </button>
            </div>
            {!visiblePlans.length && (
              <p className="text-muted">{translate('subscription.workspace.no.plans')}</p>
            )}
            {[...visiblePlanGroups]
              .filter(([, items]) => items.length > 0)
              .map(([name, items]) => (
                <div
                  key={name ?? 'all'}
                  data-environment={name}
                  className={name === undefined ? undefined : 'mb-3'}
                >
                  {name !== undefined && (
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                      <h3 className="h6 mb-0">
                        {name} <small>({items.length})</small>
                      </h3>
                      <button
                        type="button"
                        className="btn --secondary --small"
                        aria-label={translate({
                          key: 'subscription.workspace.select.environment',
                          replacements: [name],
                        })}
                        disabled={
                          submitting ||
                          items.every((item) => selectedKeys.includes(workspacePlanKey(item)))
                        }
                        onClick={() =>
                          setSelectedKeys((current) => [
                            ...new Set([...current, ...items.map(workspacePlanKey)]),
                          ])
                        }
                      >
                        {translate('subscription.workspace.select.all')}
                      </button>
                    </div>
                  )}
                  {items.map((item) => (
                    <WorkspacePlanCard
                      key={workspacePlanKey(item)}
                      item={item}
                      selected={selectedKeys.includes(workspacePlanKey(item))}
                      disabled={submitting}
                      onSelect={() => toggleSelection(workspacePlanKey(item))}
                    />
                  ))}
                </div>
              ))}
          </WorkspaceDropZone>
          <div>
            <div className="d-flex gap-2 flex-wrap align-items-center mb-3">
              <button
                type="button"
                className="btn --secondary"
                onClick={addFolder}
                disabled={submitting}
              >
                <Plus size={18} className="me-2" />
                {translate('subscription.workspace.create')}
              </button>
              {existingKeyrings.length > 0 && (
                <button
                  type="button"
                  className="btn --secondary"
                  onClick={openKeyringImport}
                  disabled={submitting}
                >
                  <Import size={18} className="me-2" />
                  {translate('subscription.workspace.import.open')}
                </button>
              )}
            </div>
            {folders.length === 0 && (
              <div className="keyring-workspace__empty">
                <KeyRound size={48} />
                <h2>{translate('subscription.workspace.empty.title')}</h2>
                <p>{translate('subscription.workspace.empty.description')}</p>
              </div>
            )}
            <div className="keyring-workspace__browser">
              {folders.length > 0 && (
                <section
                  className="keyring-workspace__folders"
                  aria-label={translate('subscription.workspace.list')}
                >
                  <h2>{translate('subscription.workspace.list')}</h2>
                  {folders.map((folder) => {
                    const reason =
                      activeKeys.length > 0 ? prepareMove(activeKeys, folder.id).error : undefined;
                    return (
                      <WorkspaceDropZone
                        key={folder.id}
                        id={`target:${folder.id}`}
                        targetId={folder.id}
                        label={translate({
                          key: 'subscription.workspace.target',
                          replacements: [folder.name],
                        })}
                        compatible={!reason}
                        className={`keyring-workspace__folder-row ${selectedFolder?.id === folder.id ? '--selected' : ''}`}
                      >
                        <button
                          type="button"
                          className="keyring-workspace__folder-select"
                          aria-label={folder.name}
                          aria-description={
                            selectedKeys.length > 0
                              ? translate({
                                  key: 'subscription.workspace.assign.selection',
                                  replacements: [folder.name],
                                })
                              : undefined
                          }
                          aria-pressed={selectedFolder?.id === folder.id}
                          disabled={submitting}
                          onClick={() => setSelectedFolderId(folder.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && selectedKeys.length > 0 && !submitting) {
                              event.preventDefault();
                              movePlans(selectedKeys, folder.id);
                            }
                          }}
                        >
                          <KeyRound size={20} className="keyring-workspace__folder-icon" />
                          <span>
                            <strong>{folder.name}</strong>
                            <small>
                              {translate(
                                folder.keyring
                                  ? 'subscription.workspace.existing.folder'
                                  : 'subscription.workspace.new.folder'
                              )}
                              {' · '}
                              {folder.items.length} {translate('subscription.workspace.plans')}
                            </small>
                          </span>
                        </button>
                        {reason && <small className="text-danger">{translate(reason)}</small>}
                      </WorkspaceDropZone>
                    );
                  })}
                </section>
              )}
              {selectedFolder &&
                [selectedFolder].map((folder) => {
                  const reason =
                    activeKeys.length > 0 ? prepareMove(activeKeys, folder.id).error : undefined;
                  const existingAccess = folder.keyring
                    ? (subscriptionsQuery.data?.subscriptions.filter(
                        (subscription) => subscription.keyring?._id === folder.keyring?._id
                      ) ?? [])
                    : [];
                  return (
                    <WorkspaceDropZone
                      key={folder.id}
                      id={folder.id}
                      label={folder.name}
                      compatible={!reason}
                      className="keyring-workspace__detail"
                    >
                      <div className="d-flex gap-2 align-items-center mb-2">
                        <KeyRound size={28} className="keyring-workspace__folder-icon" />
                        {folder.keyring ? (
                          <h2 className="flex-grow-1 mb-0">{folder.name}</h2>
                        ) : (
                          <input
                            className="form-control"
                            value={folder.name}
                            disabled={submitting}
                            aria-label={translate('subscription.workspace.name')}
                            onChange={(event) =>
                              setFolders((current) =>
                                current.map((candidate) =>
                                  candidate.id === folder.id
                                    ? { ...candidate, name: event.target.value }
                                    : candidate
                                )
                              )
                            }
                          />
                        )}
                        <button
                          type="button"
                          className="btn --secondary --icon-only"
                          disabled={submitting}
                          aria-label={translate({
                            key: 'subscription.workspace.remove',
                            replacements: [folder.name],
                          })}
                          onClick={() => {
                            setFolders((current) =>
                              current.filter((candidate) => candidate.id !== folder.id)
                            );
                            setSelectedKeys((current) =>
                              current.filter(
                                (key) =>
                                  !folder.items.some((item) => workspacePlanKey(item) === key)
                              )
                            );
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <p className="text-muted">
                        {translate(
                          folder.keyring
                            ? 'subscription.workspace.existing.folder'
                            : 'subscription.workspace.new.folder'
                        )}
                        {' · '}
                        {folder.items.length} {translate('subscription.workspace.plans')}
                      </p>
                      {folder.keyring && (
                        <>
                          <p className="small text-muted">
                            {translate('subscription.workspace.existing.preserved')}
                          </p>
                          <details className="keyring-workspace__existing-access">
                            <summary>
                              <LockKeyhole size={16} className="mx-2" aria-hidden="true" />
                              {translate({
                                key: 'subscription.workspace.existing.access',
                                replacements: [String(existingAccess.length)],
                              })}
                            </summary>
                            <ul className="list-unstyled mb-0">
                              {existingAccess.map((subscription) => (
                                <li key={subscription._id} className="keyring-workspace__plan">
                                  <span className="flex-grow-1">
                                    <strong>{subscription.planName || subscription.plan}</strong>
                                    <small className="d-block text-muted">
                                      {subscription.apiName || subscription.api}
                                    </small>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        </>
                      )}
                      <h3 className="h6 mb-3">
                        {translate({
                          key: 'subscription.workspace.requested.access',
                          replacements: [String(folder.items.length)],
                        })}
                      </h3>
                      {folder.items.map((item) => (
                        <WorkspacePlanCard
                          key={workspacePlanKey(item)}
                          item={item}
                          selected={selectedKeys.includes(workspacePlanKey(item))}
                          disabled={submitting}
                          onSelect={() => toggleSelection(workspacePlanKey(item))}
                          onRemove={() => movePlans([workspacePlanKey(item)])}
                        />
                      ))}
                      {folder.items.length === 0 && (
                        <p className="keyring-workspace__hint">
                          {translate('subscription.workspace.drop')}
                        </p>
                      )}
                      {activeKeys.length > 0 && reason && (
                        <small className="text-danger">{translate(reason)}</small>
                      )}
                    </WorkspaceDropZone>
                  );
                })}
            </div>
          </div>
        </div>
        <DragOverlay>
          {activeKeys.length > 0 && (
            <div className="keyring-workspace__drag-overlay">
              <Layers size={20} />
              {translate({
                key: 'subscription.workspace.drag.count',
                replacements: [String(activeKeys.length)],
              })}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <footer className="keyring-workspace__footer">
        <div aria-live="polite">
          <strong>
            {translate({
              key: 'subscription.workspace.summary',
              replacements: [
                String(assigned.length),
                String(folders.filter((folder) => folder.items.length > 0).length),
              ],
            })}
          </strong>
          <small className="d-block text-muted">
            {translate('subscription.workspace.only.assigned')}
          </small>
        </div>
        <button
          type="button"
          className="btn --primary"
          onClick={openReview}
          disabled={submitting || assigned.length === 0 || hasUnavailablePlans}
        >
          {translate('subscription.workspace.review.open')}
        </button>
      </footer>
    </div>
  );
}
