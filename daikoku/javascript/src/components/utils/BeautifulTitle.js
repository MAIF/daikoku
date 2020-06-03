import React from 'react';
import ReactToolTip from 'react-tooltip';

export const BeautifulTitle = ({ title, children, place }) => {
  return (
    <>
      <ReactToolTip place={place || 'bottom'}/>
      <span data-tip={title}>{children}</span>
    </>
  );
};
