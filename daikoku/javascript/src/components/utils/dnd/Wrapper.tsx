import React from 'react';
import classNames from 'classnames';
//@ts-ignore
import styles from './Wrapper.module.scss';


interface Props {
  children: React.ReactNode;
  center?: boolean;
  style?: React.CSSProperties;
}

export function Wrapper({children, center, style}: Props) {
  return (
    <div
    className={classNames(styles.Wrapper, center && styles.center)}
      style={style}
    >
      {children}
    </div>
  );
}
