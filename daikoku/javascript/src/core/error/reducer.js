import { SET_ERROR, UNSET_ERROR } from './';

const initialState = {
  status: null,
  message: null,
  args: [],
  response: null,
};

export function errorReducer(state = initialState, { type, error }) {
  switch (type) {
    case SET_ERROR:
      const err = { ...initialState, ...(error || {}) };
      return {
        status: err.status,
        message: err.message,
        args: err.args,
        response: err.response,
      };

    case UNSET_ERROR:
      return initialState;

    default:
      return state;
  }
}
