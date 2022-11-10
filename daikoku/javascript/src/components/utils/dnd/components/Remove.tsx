import React from 'react';
import { Trash2 } from 'react-feather';

import {Action, Props as ActionProps} from './Action';

export function Remove(props: ActionProps) {
  return (
    <Action
      {...props}
      className="remove-button"
    >
      <Trash2 />
    </Action>
  );
}