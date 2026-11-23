import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import classNames from 'classnames';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { CSSProperties, useContext, useState } from 'react';

import { I18nContext } from '../../../../contexts';
import { IDocumentationPage, IDocumentationPages } from '../../../../types';
import type { FlattenedItem, TreeItems } from '../../../utils/dnd/types';
import { buildTree, flattenTree, getProjection, removeChildrenOf } from '../../../utils/dnd/utilities';

const INDENTATION = 16;

const MEASURING = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
};

type DocumentationTreeProps = {
  pages: IDocumentationPages;
  currentPageId?: string;
  managing: boolean;
  onSelect: (pageId: string) => void;
  onEdit: (pageId: string) => void;
  onDelete: (page: IDocumentationPage) => void;
  onMove: (pages: IDocumentationPages) => void;
};

const toPages = (items: TreeItems): IDocumentationPages =>
  items.map((item) => ({
    id: item.id.toString(),
    title: item.title,
    children: toPages(item.children),
  }));

const depthStyle = (depth: number) => ({ '--depth': depth }) as CSSProperties;

export const DocumentationTree = (props: DocumentationTreeProps) => {
  if (props.managing) {
    return <SortableDocumentationTree {...props} />;
  } else {
    return (
      <ul className="doc-tree">
        {flattenTree(props.pages).map((item) => {
          const active = item.id === props.currentPageId;

          return (
            <li key={item.id} className="doc-tree__item" style={depthStyle(item.depth)}>
              <button
                type="button"
                className={classNames('doc-tree__link', { active })}
                aria-current={active ? 'page' : undefined}
                onClick={() => props.onSelect(item.id.toString())}
              >
                {item.title}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }
};

const SortableDocumentationTree = (props: DocumentationTreeProps) => {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const items = flattenTree(props.pages);
  const visibleItems = activeId ? removeChildrenOf(items, [activeId]) : items;
  const projection =
    activeId && overId ? getProjection(visibleItems, activeId, overId, offsetLeft, INDENTATION) : null;

  const resetDrag = () => {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id);
    setOverId(active.id);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    resetDrag();

    if (!projection || !over) {
      return;
    }

    const activeIndex = items.findIndex(({ id }) => id === active.id);
    const overIndex = items.findIndex(({ id }) => id === over.id);
    const unchanged = activeIndex === overIndex && items[activeIndex].parentId === projection.parentId;

    if (unchanged) {
      return;
    }

    const moved = items.map((item, index) =>
      index === activeIndex ? { ...item, depth: projection.depth, parentId: projection.parentId } : item
    );

    props.onMove(toPages(buildTree(arrayMove(moved, activeIndex, overIndex))));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={MEASURING}
      onDragStart={handleDragStart}
      onDragMove={({ delta }) => setOffsetLeft(delta.x)}
      onDragOver={({ over }) => setOverId(over?.id ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={resetDrag}
    >
      <SortableContext items={visibleItems.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
        <ul className="doc-tree --managing">
          {visibleItems.map((item) => (
            <SortableDocItem
              key={item.id}
              item={item}
              depth={item.id === activeId && projection ? projection.depth : item.depth}
              active={item.id === props.currentPageId}
              onSelect={() => props.onSelect(item.id.toString())}
              onEdit={() => props.onEdit(item.id.toString())}
              onDelete={() => props.onDelete(toPages([item])[0])}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
};

type SortableDocItemProps = {
  item: FlattenedItem;
  depth: number;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const SortableDocItem = (props: SortableDocItemProps) => {
  const { translate } = useContext(I18nContext);

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
  });

  const style = {
    ...depthStyle(props.depth),
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <li ref={setNodeRef} style={style} className={classNames('doc-tree__item', { '--dragging': isDragging })}>
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="doc-tree__handle"
        aria-label={translate({ key: 'doc.tree.move', replacements: [props.item.title] })}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>

      <button
        type="button"
        className={classNames('doc-tree__link', { active: props.active })}
        aria-current={props.active ? 'page' : undefined}
        onClick={props.onSelect}
      >
        {props.item.title}
      </button>

      <button
        type="button"
        className="btn --tertiary --small --icon-only"
        aria-label={translate({ key: 'doc.tree.edit', replacements: [props.item.title] })}
        onClick={props.onEdit}
      >
        <Pencil size={14} />
      </button>

      <button
        type="button"
        className="btn --tertiary --small --icon-only"
        aria-label={translate({ key: 'doc.tree.delete', replacements: [props.item.title] })}
        onClick={props.onDelete}
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
};
