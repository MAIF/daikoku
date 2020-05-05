import { combineReducers } from 'redux';
import { modalReducer, contextReducer, errorReducer } from './';
import { reducer as toasterReducer } from 'react-redux-toastr';
import { connectRouter } from 'connected-react-router';

export const reducers = (history) =>
  combineReducers({
    modal: modalReducer,
    context: contextReducer,
    toastr: toasterReducer,
    error: errorReducer,
    router: connectRouter(history),
  });
