import React from 'react';
import {Tooltip as ReactToolTip} from 'react-tooltip';
import { nanoid } from 'nanoid';

export const BeautifulTitle = ({
  title,
  children,
  place,
  variant,
  ...props
}: any) => {
  const id: string = nanoid(4);
  return (
    <>
      <ReactToolTip className='bf-tooltip' anchorId={`tooltip-${id}`} place={place || 'bottom'} variant={variant || 'dark'}/>
      <span id={`tooltip-${id}`} {...props} data-tooltip-content={title}>
        {children}
      </span>
    </>
  );
};
