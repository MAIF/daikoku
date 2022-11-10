import React from 'react';
import { Edit2 } from 'react-feather';

import {Action, Props as ActionProps} from './Action';

export const Update = (props: ActionProps) => {
  return (
    <Action
      {...props}
      className="update-button"
      style={{
        width: '12px',
        padding: '15px',
        border: 'none',
        marginRight: '20px'
      }}
    >
      <Edit2 />
    </Action>
  );
}