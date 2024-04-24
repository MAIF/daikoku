
export const FrontOffice = (props: { children: JSX.Element }) => {
  // const error = useSelector<IState, IStateError>(s => s.error)

  //todo: [#609] display a better error

  return <>{props.children}</>;
};