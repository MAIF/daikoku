import { Fragment, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { GripHorizontal, Pencil, Trash } from 'lucide-react';
import type { FlowEditorCard, FlowEditorProps } from './types';
import './flow-editor.css';

const dragFormat = 'application/x-flow-editor-card';

export const FlowEditor = <Card extends FlowEditorCard>({
  value,
  onChange,
  onEdit,
  onAdd,
  cardTypes,
  start,
  end,
}: FlowEditorProps<Card>) => {
  const [addingAt, setAddingAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const draggedCard = useRef<{ id: string; index: number } | null>(null);
  const catalogTypes = (Object.keys(cardTypes) as Card['type'][]).filter(
    (type) => cardTypes[type].canAdd !== false
  );
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
    if (definition.canAdd === false) return;
    setAddingAt(null);
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
    setAddingAt(null);
    setError(null);
  };

  const isOwnDrag = (event: DragEvent) => {
    return draggedCard.current !== null && event.dataTransfer.types.includes(dragFormat);
  };

  const dropCard = (event: DragEvent, index: number) => {
    if (!isOwnDrag(event)) return;
    event.preventDefault();
    const source = draggedCard.current;
    draggedCard.current = null;
    setDropAt(null);
    setDragging(false);
    if (!source || value[source.index]?.id !== source.id) {
      setError('La liste a changé pendant le déplacement. Veuillez réessayer.');
      return;
    }
    moveCard(source.index, index);
  };

  const renderSlot = (index: number) => {
    return (
      <div
        className={`flow-editor__slot${dropAt === index ? ' flow-editor__slot--over' : ''}`}
        onDragOver={(event) => {
          if (isOwnDrag(event)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDropAt(index);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropAt(null);
        }}
        onDrop={(event) => dropCard(event, index)}
      >
        <span className="flow-editor__connector" aria-hidden="true" />
        <button
          type="button"
          aria-label={`Ajouter une carte en position ${index + 1}`}
          aria-expanded={addingAt === index}
          disabled={catalogTypes.length === 0}
          onClick={() => setAddingAt(addingAt === index ? null : index)}
        >
          +
        </button>
        {addingAt === index && catalogTypes.length > 0 && (
          <div className="flow-editor__picker" aria-label="Types de cartes">
            {catalogTypes.map((type) => (
              <button key={type} type="button" onClick={() => addCard(type, index)}>
                {cardTypes[type].label}
              </button>
            ))}
            <button type="button" onClick={() => setAddingAt(null)}>
              Annuler
            </button>
          </div>
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
            className="flow-editor__handle"
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
              draggedCard.current = { id: card.id, index };
              setDragging(true);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData(dragFormat, card.id);
              const element = event.currentTarget.closest('article');
              if (element) event.dataTransfer.setDragImage(element, 24, 24);
            }}
            onDragEnd={() => {
              draggedCard.current = null;
              setDragging(false);
              setDropAt(null);
            }}
          >
            <GripHorizontal size={20} aria-hidden="true" />
          </span>
          <div className="flow-editor__card-title">
            {definition?.icon && (
              <span className="flow-editor__type-icon" aria-hidden="true">
                {definition.icon}
              </span>
            )}
            <div className="flow-editor__card-heading">
              <span className="flow-editor__card-type">{definition?.label ?? card.type}</span>
              {title && <h3 className="flow-editor__card-subtitle">{title}</h3>}
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
        <footer className="flow-editor__actions">
          <button
            type="button"
            disabled={invalidId || definition?.canDelete === false}
            aria-label={`Supprimer la carte ${index + 1}`}
            onClick={() => {
              onChange(value.filter((_, position) => position !== index));
              setAddingAt(null);
            }}
          >
            <Trash stroke="#29438d" size={18} aria-hidden="true" />
            Supprimer
          </button>
          <button
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
      className={`flow-editor${dragging ? ' flow-editor--dragging' : ''}`}
      aria-label="Éditeur de processus"
    >
      {error && <p role="alert">{error}</p>}
      {catalogTypes.length === 0 && (
        <p role="status">Aucun type de carte disponible. L’ajout est désactivé.</p>
      )}
      <div className="flow-editor__viewport">
        <div className="flow-editor__sequence">
          <div className="flow-editor__endpoint">{start}</div>
          {value.map((card, index) => (
            <Fragment
              key={card.id && idCounts.get(card.id) === 1 ? `card:${card.id}` : `invalid:${index}`}
            >
              {renderSlot(index)}
              {renderCard(card, index)}
            </Fragment>
          ))}
          {renderSlot(value.length)}
          <div className="flow-editor__endpoint">{end}</div>
        </div>
      </div>
    </section>
  );
};
