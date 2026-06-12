
import { Action, Props as ActionProps } from './Action';
import {Trash2} from "lucide-react";

export function Remove(props: ActionProps) {
  return (
    <Action
      {...props} className="btn btn-sm btn-outline-danger d-none remove-button">
      <Trash2 />
    </Action>
  );
}
