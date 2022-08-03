import { combineReducers } from 'redux';
import { modalReducer, contextReducer, errorReducer } from './';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { reducer as toasterReducer } from 'react-redux-toastr';

export const reducers = () =>
  combineReducers({
    modal: modalReducer,
    context: contextReducer,
    toastr: toasterReducer,
    error: errorReducer,
  });
