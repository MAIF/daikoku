import { PropsWithChildren } from "react";

export const FrontOffice = (props: PropsWithChildren<{}>) => {
  // const error = useSelector<IState, IStateError>(s => s.error)

  //todo: [#609] display a better error

  return <>{props.children}</>;
};