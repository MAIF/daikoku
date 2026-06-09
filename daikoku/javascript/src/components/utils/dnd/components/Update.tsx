
import { Action, Props as ActionProps } from "./Action";
import {Pen} from "lucide-react";

export const Update = (props: ActionProps) => {
  return (
    <Action {...props} className="btn btn-sm btn-outline-info d-block">
      <Pen />
    </Action>
  );
};
