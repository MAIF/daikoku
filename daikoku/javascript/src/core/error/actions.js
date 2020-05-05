import { SET_ERROR, UNSET_ERROR } from './';

export const setError = ({ error }) => (dispatch) => {
  return dispatch({
    type: SET_ERROR,
    error,
  });
};

export const unsetError = () => (dispatch) => {
  return dispatch({
    type: UNSET_ERROR,
  });
};
