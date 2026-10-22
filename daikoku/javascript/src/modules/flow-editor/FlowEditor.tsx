import { Fragment, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { GripHorizontal, Pencil, Trash } from 'lucide-react';
import type { FlowEditorCard, FlowEditorProps } from './types';
import './flow-editor.css';

const dragFormat = 'application/x-flow-editor-card';
const defaultLabels = {
  palette: 'Available steps',
  hint: 'Drag a step into the flow, or select it then choose an insertion point.',
  insert: (position: number) => `Insert at position ${position}`,
  unavailable: 'This step cannot be added.',
};

export const FlowEditor = <Card extends FlowEditorCard>({
  value,
  onChange,
  onEdit,
  onAdd,
  cardTypes,
  labels = defaultLabels,
  start,
  end,
}: FlowEditorProps<Card>) => {
  const [selectedType, setSelectedType] = useState<Card['type'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const editorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selectedType === null) return;
    const cancelOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        editorRef.current?.contains(target) &&
        target.closest('.flow-editor__palette-type:not(:disabled), .flow-editor__slot > button')
      ) {
        return;
      }
      setSelectedType(null);
    };
    document.addEventListener('click', cancelOnOutsideClick);
    return () => document.removeEventListener('click', cancelOnOutsideClick);
  }, [selectedType]);
  const dragSource = useRef<
    { kind: 'card'; id: string; index: number } | { kind: 'type'; type: Card['type'] } | null
  >(null);
  const catalogTypes = Object.keys(cardTypes) as Card['type'][];
  const activeType =
    selectedType !== null && cardTypes[selectedType]?.canAdd !== false ? selectedType : null;
  const idCounts = new Map<string, number>();
  for (const card of value) {
    idCounts.set(card.id, (idCounts.get(card.id) ?? 0) + 1);
  }

  const definitionFor = <Type extends Card['type']>(type: Type) => {
    return Object.hasOwn(cardTypes, type) ? cardTypes[type] : undefined;
  };

  const addCard = (type: Card['type'], index: number) => {
    const definition = definitionFor(type);
    if (!definition) {
      setError(`Type de carte indisponible : ${type}.`);
      return;
    }
    if (definition.canAdd === false) {
      setError(definition.unavailableReason ?? labels.unavailable);
      return;
    }
    setSelectedType(null);
    setError(null);
    onAdd(type, index);
  };

  const moveCard = (from: number, insertionIndex: number) => {
    const card = value[from];
    if (!card || !card.id || idCounts.get(card.id) !== 1) {
      setError('Impossible de déplacer une carte absente ou sans identifiant unique.');
      return;
    }
    if (definitionFor(card.type)?.canMove === false) return;
    const destination = insertionIndex > from ? insertionIndex - 1 : insertionIndex;
    if (destination === from) return;
    const next = value.filter((_, index) => index !== from);
    next.splice(destination, 0, card);
    onChange(next);
    setSelectedType(null);
    setError(null);
  };

  const isOwnDrag = (event: DragEvent) => {
    return dragSource.current !== null && event.dataTransfer.types.includes(dragFormat);
  };

  const endDrag = () => {
    dragSource.current = null;
    setDragging(false);
    setDropAt(null);
  };

  const dropCard = (event: DragEvent, index: number) => {
    if (!isOwnDrag(event)) return;
    event.preventDefault();
    const source = dragSource.current;
    endDrag();
    if (source?.kind === 'type') {
      addCard(source.type, index);
      return;
    }
    if (!source || value[source.index]?.id !== source.id) {
      setError('La liste a changé pendant le déplacement. Veuillez réessayer.');
      return;
    }
    moveCard(source.index, index);
  };

  const renderSlot = (index: number) => {
    return (
      <div
        className={`flow-editor__slot position-relative d-grid${dropAt === index ? ' flow-editor__slot--over' : ''}`}
        onDragOver={(event) => {
          if (isOwnDrag(event)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = dragSource.current?.kind === 'type' ? 'copy' : 'move';
            setDropAt(index);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropAt(null);
        }}
        onDrop={(event) => dropCard(event, index)}
      >
        <span
          className="flow-editor__connector position-absolute top-50 start-0 end-0 pe-none"
          aria-hidden="true"
        />
        {(activeType !== null || dragging) && (
          <button
            className="position-relative rounded-circle p-0"
            type="button"
            aria-label={labels.insert(index + 1)}
            tabIndex={activeType === null ? -1 : 0}
            onClick={() => {
              if (activeType !== null) addCard(activeType, index);
            }}
          >
            {index + 1}
          </button>
        )}
      </div>
    );
  };

  const renderCard = <Type extends Card['type']>(card: Card & { type: Type }, index: number) => {
    const definition = definitionFor(card.type);
    const invalidId = !card.id || idCounts.get(card.id) !== 1;
    const Content = definition?.Content;
    const title = invalidId ? undefined : definition?.getTitle?.(card);
    return (
      <article className="flow-editor__card" aria-label={definition?.label ?? card.type}>
        <header className="flow-editor__card-header">
          <span
            className="flow-editor__handle d-flex justify-content-center p-1 mb-2 user-select-none"
            role="img"
            aria-disabled={invalidId || definition?.canMove === false}
            draggable={!invalidId && definition?.canMove !== false}
            aria-label={`Déplacer la carte ${index + 1}`}
            title="Glisser vers un emplacement entre deux cartes"
            onDragStart={(event) => {
              if (invalidId || definition?.canMove === false) {
                event.preventDefault();
                return;
              }
              setSelectedType(null);
              dragSource.current = { kind: 'card', id: card.id, index };
              setDragging(true);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData(dragFormat, card.id);
              const element = event.currentTarget.closest('article');
              if (element) event.dataTransfer.setDragImage(element, 24, 24);
            }}
            onDragEnd={endDrag}
          >
            <GripHorizontal className="pe-none" size={20} aria-hidden="true" />
          </span>
          <div className="flow-editor__card-title d-flex align-items-center gap-2">
            {definition?.icon && (
              <span className="flow-editor__type-icon d-grid" aria-hidden="true">
                {definition.icon}
              </span>
            )}
            <div className="flow-editor__card-heading">
              <span className="flow-editor__card-type d-block fw-normal">
                {definition?.label ?? card.type}
              </span>
              {title && <h3 className="flow-editor__card-subtitle m-0 fw-bold">{title}</h3>}
            </div>
          </div>
        </header>
        {invalidId ? (
          <p role="alert">
            Identifiant absent ou dupliqué : cette carte ne peut pas être modifiée.
          </p>
        ) : Content ? (
          <div className="flow-editor__content">
            <Content data={card} />
          </div>
        ) : (
          <p role="alert">
            Type indisponible : {card.type}. Les données sont conservées ; édition impossible.
          </p>
        )}
        <footer className="flow-editor__actions d-flex flex-wrap gap-1 justify-content-between p-2">
          <button
            className="d-inline-flex align-items-center fw-medium"
            type="button"
            disabled={invalidId || definition?.canDelete === false}
            aria-label={`Supprimer la carte ${index + 1}`}
            onClick={() => {
              onChange(value.filter((_, position) => position !== index));
              setSelectedType(null);
            }}
          >
            <Trash stroke="#29438d" size={18} aria-hidden="true" />
            Supprimer
          </button>
          <button
            className="d-inline-flex align-items-center fw-medium"
            type="button"
            disabled={invalidId || !Content || (!definition?.onEdit && !onEdit)}
            onClick={() => {
              if (definition?.onEdit) definition.onEdit(card);
              else onEdit?.(card);
            }}
          >
            <Pencil stroke="#29438d" size={18} aria-hidden="true" />
            Modifier
          </button>
        </footer>
      </article>
    );
  };

  return (
    <section
      ref={editorRef}
      className={`flow-editor w-100 text-start${dragging || activeType !== null ? ' flow-editor--inserting' : ''}`}
      aria-label="Éditeur de processus"
    >
      <div
        className="flow-editor__palette position-sticky top-0 z-2 rounded-3"
        role="group"
        aria-label={labels.palette}
      >
        <div className="flow-editor__palette-help d-flex flex-wrap align-items-center gap-2 mb-2 small">
          {labels.hint}
        </div>
        <div className="flow-editor__palette-types d-flex flex-wrap align-items-center gap-2">
          {catalogTypes.map((type) => {
            const definition = cardTypes[type];
            const unavailable = definition.canAdd === false;
            const reason = unavailable
              ? (definition.unavailableReason ?? labels.unavailable)
              : undefined;
            return (
              <span key={type} title={reason} className="mw-100">
                <button
                  type="button"
                  className="flow-editor__palette-type d-inline-flex align-items-center gap-2 py-2 rounded-3 mw-100 text-start"
                  aria-label={definition.label}
                  aria-pressed={activeType === type}
                  disabled={unavailable}
                  draggable={!unavailable}
                  onClick={() => setSelectedType(activeType === type ? null : type)}
                  onDragStart={(event) => {
                    if (unavailable) {
                      event.preventDefault();
                      return;
                    }
                    setSelectedType(null);
                    dragSource.current = { kind: 'type', type };
                    setDragging(true);
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData(dragFormat, type);
                  }}
                  onDragEnd={endDrag}
                >
                  {definition.icon}
                  {definition.label}
                </button>
              </span>
            );
          })}
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="flow-editor__viewport w-100 overflow-x-auto p-3">
        <div className="flow-editor__sequence d-flex align-items-center">
          <div className="flow-editor__endpoint flex-shrink-0">{start}</div>
          {value.map((card, index) => (
            <Fragment
              key={card.id && idCounts.get(card.id) === 1 ? `card:${card.id}` : `invalid:${index}`}
            >
              {renderSlot(index)}
              {renderCard(card, index)}
            </Fragment>
          ))}
          {renderSlot(value.length)}
          <div className="flow-editor__endpoint flex-shrink-0">{end}</div>
        </div>
      </div>
    </section>
  );
};
