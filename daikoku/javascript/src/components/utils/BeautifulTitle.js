import React from 'react';
import ReactToolTip from 'react-tooltip';
import { v4 as uuid } from 'uuid';

export const BeautifulTitle = ({ title, children, place, ...props }) => {
  const id = uuid();
  return (
    <>
      <ReactToolTip html={true} place={place || 'bottom'} id={id} />
      <span {...props} data-html={true} data-tip={title} data-for={id}>
        {children}
      </span>
    </>
  );
};
