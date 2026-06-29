
import { Action, Props as ActionProps } from "./Action";
import { Pen } from "lucide-react";

export const Update = (props: ActionProps) => {
  return (
    <Action {...props} className="btn --secondary --small --icon-only">
      <Pen />
    </Action>
  );
};
