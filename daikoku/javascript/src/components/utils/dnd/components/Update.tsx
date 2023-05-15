import React from "react";
import { Edit2 } from "react-feather";

import { Action, Props as ActionProps } from "./Action";

export const Update = (props: ActionProps) => {
  return (
    <Action {...props} className="btn btn-sm btn-outline-primary d-block">
      <i className="fas fa-pen"></i>
    </Action>
  );
};
