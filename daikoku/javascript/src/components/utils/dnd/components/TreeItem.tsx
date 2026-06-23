import classNames from 'classnames';
import React, { forwardRef, HTMLAttributes } from 'react';

import { Handle } from './Handle';
import { Remove } from './Remove';

//@ts-ignore
import styles from './TreeItem.module.scss';
import { Update } from './Update';

export interface Props extends Omit<HTMLAttributes<HTMLLIElement>, 'id'> {
  childCount?: number;
  clone?: boolean;
  collapsed?: boolean;
  depth: number;
  disableInteraction?: boolean;
  disableSelection?: boolean;
  ghost?: boolean;
  handleProps?: any;
  indicator?: boolean;
  indentationWidth: number;
  value: string;
  onCollapse?(): void;
  onRemove?(): void;
  onUpdate?(): void;
  wrapperRef?(node: HTMLLIElement): void;
}

export const TreeItem = forwardRef<HTMLDivElement, Props>(
  (
    {
      childCount,
      clone,
      depth,
      disableSelection,
      disableInteraction,
      ghost,
      handleProps,
      indentationWidth,
      indicator,
      onRemove,
      onUpdate,
      style,
      value,
      wrapperRef,
      ...props
    },
    ref
  ) => {
    return (
      <li
        className={classNames(
          styles.Wrapper,
          clone && styles.clone,
          ghost && styles.ghost,
          indicator && styles.indicator,
          disableSelection && styles.disableSelection,
          disableInteraction && styles.disableInteraction
        )}
        ref={wrapperRef}
        style={
          {
            '--spacing': `${indentationWidth * depth}px`,
          } as React.CSSProperties
        }
        {...props}
      >
        <div className={classNames(styles.TreeItem, 'tree-item')} ref={ref} style={style}>
          <Handle {...handleProps} />
          <span className={styles.Text}>{value}</span>
          {!clone && onUpdate && <Update onClick={onUpdate} />}
          {!clone && onRemove && <Remove onClick={onRemove} />}
          {clone && childCount && childCount > 1 ? (
            <span className={styles.count}>{childCount}</span>
          ) : null}
        </div>
      </li>
    );
  }
);