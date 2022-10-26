import { SET_ERROR, UNSET_ERROR } from './';

export const setError =
  ({ error }: any) =>
  (dispatch: any) => {
    return dispatch({
      type: SET_ERROR,
      error,
    });
  };

export const unsetError = () => (dispatch: any) => {
  return dispatch({
    type: UNSET_ERROR,
  });
};
