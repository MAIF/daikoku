import React from 'react';
import { IState, IStateError } from '../../types';

export const FrontOffice = (props: { children: JSX.Element }) => {
  const error = useSelector<IState, IStateError>(s => s.error)

  return <>{!error.status && props.children}</>;
};