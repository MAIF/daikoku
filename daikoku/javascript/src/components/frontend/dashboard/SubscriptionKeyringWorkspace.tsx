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
import { Folder, FolderPlus, GripVertical, Import, Undo2, X } from 'lucide-react';
import { nanoid } from 'nanoid';
import { PropsWithChildren, useContext, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import {
  buildWorkspaceSubmission,
  getWorkspaceAssignmentError,
  workspacePlanKey,
  WorkspaceFolder,
  WorkspacePlan,
} from '../../../services/keyringWorkspace';
import { IApiWithAuthorization, ITeamSimple } from '../../../types';
import { SubscriptionBatchPlanSelectionModal } from './SubscriptionBatchPlanSelectionModal';
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
  children,
}: PropsWithChildren<{ id: string; label: string; compatible?: boolean }>) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={`keyring-workspace__zone ${isOver ? (compatible === false ? '--invalid' : '--over') : ''}`}
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

function KeyringWorkspace({ apis, team }: KeyringWorkspaceLocationState) {
  const { translate } = useContext(I18nContext);
  const { tenant } = useContext(GlobalContext);
  const { close, openCustomModal } = useContext(ModalContext);
  const navigate = useNavigate();
  const {
    availablePlanSets,
    subscriptionsQuery,
    loading,
    failed,
    submitting,
    submitWithMotivation,
  } = useSubscriptionBatch(apis, team, () => {
    close();
    navigate('/apis', { replace: true });
  });
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [destination, setDestination] = useState('');
  const [existingId, setExistingId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string>();
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
  const existingKeyrings = [
    ...new Map(
      (subscriptionsQuery.data?.subscriptions ?? []).flatMap((subscription) =>
        subscription.keyring ? [[subscription.keyring._id, subscription.keyring] as const] : []
      )
    ).values(),
  ].filter((keyring) => !folders.some((folder) => folder.keyring?._id === keyring._id));
  const hasUnavailablePlans = assigned.some((item) => !planMap.has(workspacePlanKey(item)));
  const commonNames = [...new Set(unassigned.map(({ plan }) => plan.customName))].filter(
    (name) => unassigned.filter(({ plan }) => plan.customName === name).length > 1
  );

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
    setDestination(id);
  };
  const importFolder = () => {
    const keyring = existingKeyrings.find((candidate) => candidate._id === existingId);
    if (!keyring) return;
    const id = nanoid();
    setFolders((current) => [
      ...current,
      { id, name: keyring.customName || keyring._id, keyring, items: [] },
    ]);
    setExistingId('');
    setDestination(id);
  };
  const submit = () => {
    if (!subscriptionsQuery.data || hasUnavailablePlans) return;
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
  const openPreviousInterface = () =>
    openCustomModal({
      title: translate('subscription.batch.select.plans.title'),
      content: (
        <SubscriptionBatchPlanSelectionModal
          apis={apis}
          team={team}
          onSubmitted={() => navigate('/apis', { replace: true })}
        />
      ),
    });

  if (loading) return <p className="p-4">{translate('Loading...')}</p>;
  if (failed)
    return (
      <div className="p-4">
        <p role="alert">{translate('subscription.batch.plans.failed')}</p>
        <Link to="/apis">{translate('subscription.workspace.back')}</Link>
      </div>
    );

  return (
    <div className="keyring-workspace">
      <header className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
        <div>
          <span className="badge --warning mb-2">
            {translate('subscription.workspace.experimental')}
          </span>
          <h1>{translate('subscription.workspace.title')}</h1>
          <p className="mb-1">{translate('subscription.workspace.description')}</p>
          <p className="text-muted">
            {translate('Team')}: <strong>{team.name}</strong>
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button
            type="button"
            className="btn --secondary"
            disabled={submitting}
            onClick={openPreviousInterface}
          >
            {translate('subscription.workspace.previous')}
          </button>
          <Link className={`btn --secondary ${submitting ? 'disabled' : ''}`} to="/apis">
            {translate('subscription.workspace.back')}
          </Link>
        </div>
      </header>
      <p className="alert alert-info">{translate('subscription.workspace.not.created')}</p>
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
        <select
          className="form-select"
          aria-label={translate('subscription.workspace.destination')}
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          disabled={submitting}
        >
          <option value="">{translate('subscription.workspace.unassigned')}</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn --secondary"
          disabled={submitting || selectedKeys.length === 0}
          onClick={() => movePlans(selectedKeys, destination || undefined)}
        >
          {translate('subscription.workspace.move')}
        </button>
        <button
          type="button"
          className="btn --secondary"
          disabled={submitting || selectedKeys.length === 0}
          onClick={() => setSelectedKeys([])}
        >
          {translate('subscription.workspace.clear')}
        </button>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => {
          const key = String(active.id);
          setActiveKeys(selectedKeys.includes(key) ? selectedKeys : [key]);
        }}
        onDragCancel={() => setActiveKeys([])}
        onDragEnd={({ over }) => {
          if (over) movePlans(activeKeys, over.id === 'unassigned' ? undefined : String(over.id));
          setActiveKeys([]);
        }}
      >
        <div className="keyring-workspace__layout">
          <WorkspaceDropZone id="unassigned" label={translate('subscription.workspace.unassigned')}>
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
              {commonNames.map((name) => (
                <button
                  type="button"
                  key={name}
                  className="btn --secondary --small"
                  disabled={submitting}
                  onClick={() =>
                    setSelectedKeys(
                      unassigned
                        .filter(({ plan }) => plan.customName === name)
                        .map(workspacePlanKey)
                    )
                  }
                >
                  {translate({ key: 'subscription.batch.select.same.plan', replacements: [name] })}
                </button>
              ))}
            </div>
            {!visiblePlans.length && (
              <p className="text-muted">{translate('subscription.workspace.no.plans')}</p>
            )}
            {visiblePlans.map((item) => (
              <WorkspacePlanCard
                key={workspacePlanKey(item)}
                item={item}
                selected={selectedKeys.includes(workspacePlanKey(item))}
                disabled={submitting}
                onSelect={() => toggleSelection(workspacePlanKey(item))}
              />
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
                <FolderPlus size={18} className="me-2" />
                {translate('subscription.workspace.create')}
              </button>
              <select
                className="form-select keyring-workspace__import"
                value={existingId}
                aria-label={translate('subscription.workspace.existing')}
                disabled={submitting}
                onChange={(event) => setExistingId(event.target.value)}
              >
                <option value="">{translate('subscription.workspace.existing')}</option>
                {existingKeyrings.map((keyring) => (
                  <option key={keyring._id} value={keyring._id}>
                    {keyring.customName || keyring._id}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn --secondary"
                onClick={importFolder}
                disabled={submitting || !existingId}
              >
                <Import size={18} className="me-2" />
                {translate('subscription.workspace.import')}
              </button>
            </div>
            {folders.length === 0 && (
              <div className="keyring-workspace__empty">
                <Folder size={48} />
                <h2>{translate('subscription.workspace.empty.title')}</h2>
                <p>{translate('subscription.workspace.empty.description')}</p>
              </div>
            )}
            <div className="keyring-workspace__folders">
              {folders.map((folder) => {
                const reason =
                  activeKeys.length > 0 ? prepareMove(activeKeys, folder.id).error : undefined;
                return (
                  <WorkspaceDropZone
                    key={folder.id}
                    id={folder.id}
                    label={folder.name}
                    compatible={!reason}
                  >
                    <div className="d-flex gap-2 align-items-center mb-2">
                      <Folder size={28} className="keyring-workspace__folder-icon" />
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
                              (key) => !folder.items.some((item) => workspacePlanKey(item) === key)
                            )
                          );
                          if (destination === folder.id) setDestination('');
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
                      <p className="small text-muted">
                        {translate('subscription.workspace.existing.preserved')}
                      </p>
                    )}
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
              <Folder size={20} />
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
          onClick={submit}
          disabled={submitting || assigned.length === 0 || hasUnavailablePlans}
        >
          {submitting ? translate('Loading...') : translate('subscription.batch.submit')}
        </button>
      </footer>
    </div>
  );
}
