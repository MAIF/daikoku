import {
  Active,
  defaultDropAnimationSideEffects, DndContext, DragOverlay, DropAnimation, KeyboardSensor,
  PointerSensor, UniqueIdentifier, useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable
} from '@dnd-kit/sortable';
import React, { PropsWithChildren, ReactNode, useEffect, useMemo, useState } from 'react';

import { CSS } from '@dnd-kit/utilities';


// *********************
// *** SORTABLE LIST ***
// *********************


interface BaseItem {
  id: UniqueIdentifier;
}

interface SortableListProps<T extends BaseItem> {
  items: Array<T>;
  onChange: (items: T[]) => void;
  renderItem: (item: T) => ReactNode;
  className?: string
}
export const SortableList = <T extends BaseItem>(props: SortableListProps<T>) => {
  const [active, setActive] = useState<Active | null>(null);
  const activeItem = useMemo(
    () => props.items.find((item) => item.id === active?.id),
    [active, props.items]
  );
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => {
        setActive(active);
      }}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over?.id) {
          const activeIndex = props.items.findIndex(({ id }) => id === active.id);
          const overIndex = props.items.findIndex(({ id }) => id === over.id);

          props.onChange(arrayMove(props.items, activeIndex, overIndex));
        }
        setActive(null);
      }}
      onDragCancel={() => {
        setActive(null);
      }}
    >
      <SortableContext items={props.items}>
        <ul className="sortable-list" role="application">
          {props.items.map((item, idx) => (
            <React.Fragment key={item.id}>{props.renderItem(item)}</React.Fragment>
          ))}
        </ul>
      </SortableContext>
      <SortableOverlay>
        {activeItem ? props.renderItem(activeItem) : null}
      </SortableOverlay>
    </DndContext>
  );
  
}

// *********************
// *** SORTABLE ITEM ***
// *********************

interface SortableItemProps {
  id: UniqueIdentifier;
}
export const SortableItem = (props: PropsWithChildren<SortableItemProps>) => {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition
  } = useSortable({ id: props.id });


  const style = {
    opacity: isDragging ? 0.4 : undefined,
    transform: CSS.Translate.toString(transform),
    transition
  };

  return (
      <li className="sortable-item" ref={setNodeRef} style={style} {...attributes} {...listeners}>
        {props.children}
      </li>
  );
}

export const FixedItem = (props: PropsWithChildren<SortableItemProps>) => {
  return (
      <li className="sortable-item fixed">
        {props.children}
      </li>
  );
}


// ***************
// *** OVERLAY ***
// ***************

const dropAnimationConfig: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.4"
      }
    }
  })
};

interface Props {}

export function SortableOverlay({ children }: PropsWithChildren<Props>) {
  return (
    <DragOverlay dropAnimation={dropAnimationConfig}>{children}</DragOverlay>
  );
}

