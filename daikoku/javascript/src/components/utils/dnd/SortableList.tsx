import {
  Active,
  defaultDropAnimationSideEffects, DndContext, DraggableSyntheticListeners, DragOverlay, DropAnimation, KeyboardSensor,
  PointerSensor, UniqueIdentifier,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable
} from '@dnd-kit/sortable';
import React, { createContext, PropsWithChildren, ReactNode, useContext, useMemo, useState } from 'react';

import { CSS } from '@dnd-kit/utilities';
import classNames from 'classnames';


// *********************
// *** SORTABLE LIST ***
// *********************


interface BaseItem {
  id: UniqueIdentifier;
}

interface SortableListProps<T extends BaseItem> {
  items: Array<T>;
  onChange: (items: T[]) => void;
  renderItem: (item: T, idx: number) => ReactNode;
  className?: string
}
export const SortableList = <T extends BaseItem>(props: SortableListProps<T>) => {
  const [active, setActive] = useState<Active | null>(null);

  const [_isDragging, setIsDragging] = useState(false);
  const [_parent, setParent] = useState<UniqueIdentifier | null>(null);


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
        setIsDragging(true)
      }}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over?.id) {
          const activeIndex = props.items.findIndex(({ id }) => id === active.id);
          const overIndex = props.items.findIndex(({ id }) => id === over.id);

          setParent(over ? over.id : null)

          props.onChange(arrayMove(props.items, activeIndex, overIndex));
        }
        setActive(null);
        setIsDragging(false)
      }}
      onDragCancel={() => {
        setActive(null);
        setIsDragging(false)
      }}
    >
      <div>
        <SortableContext items={props.items}>
          <ul className="sortable-list sorted-list" role="application">
            {props.items.map((item, idx) => (
              <React.Fragment key={item.id}>{props.renderItem(item, idx)}</React.Fragment>
            ))}
          </ul>
        </SortableContext>
        <SortableOverlay>
          {activeItem ? props.renderItem(activeItem, 0) : null}
        </SortableOverlay>
      </div>
    </DndContext>
  );

}


// ************************
// *** SORTABLE CONTEXT ***
// ************************

interface Context {
  attributes: Record<string, any>;
  listeners: DraggableSyntheticListeners;
  ref(node: HTMLElement | null): void;
}

const SortableItemContext = createContext<Context>({
  attributes: {},
  listeners: undefined,
  ref() { }
});

// *********************
// *** SORTABLE ITEM ***
// *********************

interface SortableItemProps {
  id: UniqueIdentifier;
  action?: ReactNode | undefined
  className?: string
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

  const context = useMemo(
    () => ({
      attributes,
      listeners,
      ref: setActivatorNodeRef
    }),
    [attributes, listeners, setActivatorNodeRef]
  );


  const style = {
    opacity: isDragging ? 0.4 : undefined,
    transform: CSS.Translate.toString(transform),
    transition,

  };

  return (
    <li className={classNames("sortable-item sorted-list__step d-flex flex-column", props.className)}>
      {props.action && <div className='sortable-item__action'>
        {props.action}
      </div>}
      <SortableItemContext.Provider value={context}>
        <div className='sortable-item__draggable-container' ref={setNodeRef} style={style}>
          <DraggableContent>
            {props.children}
          </DraggableContent>
        </div>
      </SortableItemContext.Provider>
    </li>
  );
}

export const FixedItem = (props: PropsWithChildren<SortableItemProps>) => {
  return (
    <li className="drag-handle sortable-item fixed sorted-list__step d-flex flex-column">
      {props.action && <div className='sortable-item__action'>
        {props.action}
      </div>}
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

interface Props { }

export function SortableOverlay({ children }: PropsWithChildren<Props>) {
  return (
    <DragOverlay dropAnimation={dropAnimationConfig}>{children}</DragOverlay>
  );
}

// *************************
// *** DRAGGABLE CONTENT ***
// *************************


const DraggableContent = (props: PropsWithChildren<Props>) => {
  const { attributes, listeners, ref } = useContext(SortableItemContext);

  return (
    <div className="drag-handle" {...attributes} {...listeners} ref={ref}>
      {props.children}
    </div>
  );
}