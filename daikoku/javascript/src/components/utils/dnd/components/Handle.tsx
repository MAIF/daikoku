import React, { forwardRef } from 'react';
import { Move } from 'lucide-react';

import { Action, Props as ActionProps } from './Action';

export const Handle = forwardRef<HTMLButtonElement, ActionProps>(
  (props, ref) => {
    return (
      <Action
        ref={ref}
        cursor="grab"
        data-cypress="draggable-handle"
        {...props}
        style={{
          width: '12px',
          padding: '15px',
          border: 'none'
        }}
      >
        <Move />
      </Action>
    );
  }
);
