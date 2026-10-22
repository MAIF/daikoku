import type { ComponentType, ReactNode } from 'react';
export type FlowEditorCard = { id: string; type: string };

export type CardContentProps<Data> = {
  data: Data;
};

export type CardTypeDefinition<Data> = {
  label: string;
  icon?: ReactNode;
  getTitle?: (data: Data) => string | undefined;
  Content: ComponentType<CardContentProps<Data>>;
  onEdit?: (card: Data) => void;
  canAdd?: boolean;
  canMove?: boolean;
  canDelete?: boolean;
};

export type CardTypeCatalog<Card extends FlowEditorCard> = {
  [Type in Card['type']]: CardTypeDefinition<Card & { type: Type }>;
};

export type FlowEditorProps<Card extends FlowEditorCard> = {
  value: readonly Card[];
  onChange: (value: Card[]) => void;
  onEdit?: (card: Card) => void;
  onAdd: (type: Card['type'], index: number) => void;
  cardTypes: CardTypeCatalog<Card>;
  start: ReactNode;
  end: ReactNode;
};
