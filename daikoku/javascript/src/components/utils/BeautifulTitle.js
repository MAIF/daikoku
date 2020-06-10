import React from 'react';
import ReactToolTip from 'react-tooltip';

export const BeautifulTitle = ({ title, children, place, ...props }) => {
  return (
    <>
      <ReactToolTip place={place || 'bottom'} />
      <span {...props} data-tip={title}>
        {children}
      </span>
    </>
  );
};
