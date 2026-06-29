
import { Action, Props as ActionProps } from './Action';
import { Trash2 } from "lucide-react";

export function Remove(props: ActionProps) {
  return (
    <Action
      {...props} className="btn --secondary --small --icon-only">
      <Trash2 />
    </Action>
  );
}
