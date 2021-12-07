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
      return {
        status: error.status,
        message: error.message,
        args: error.args,
        response: error.response,
      };

    case UNSET_ERROR:
      return initialState;

    default:
      return state;
  }
}
