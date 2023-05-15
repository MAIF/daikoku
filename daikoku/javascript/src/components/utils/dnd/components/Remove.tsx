import React from 'react';
import { Trash2 } from 'react-feather';

import {Action, Props as ActionProps} from './Action';

export function Remove(props: ActionProps) {
  return (
    <Action
      {...props} className="btn btn-sm btn-danger d-none remove-button">
      <i className="fas fa-trash"></i>
    </Action>
  );
}