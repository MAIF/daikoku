import React from 'react';
import ReactToolTip from 'react-tooltip';

export const BeautifulTitle = ({ title, children, place, ...props }) => {
  return (
    <>
      <ReactToolTip html={true} place={place || 'bottom'} />
      <span {...props} data-html={true} data-tip={title}>
        {children}
      </span>
    </>
  );
};
