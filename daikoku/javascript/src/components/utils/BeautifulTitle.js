import React from 'react';
import { Popover } from 'antd';

export const BeautifulTitle = ({ title, children, place }) => {

  return (
    <Popover
      placement={place || 'bottom'}
      className="beautiful-popover"
      content={title}>
      <span>
        {children}
      </span>
    </Popover>
  );
};