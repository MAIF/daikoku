import { combineReducers } from 'redux';
import { modalReducer, contextReducer, errorReducer } from './';
import { reducer as toasterReducer } from 'react-redux-toastr';

export const reducers = () =>
  combineReducers({
    modal: modalReducer,
    context: contextReducer,
    toastr: toasterReducer,
    error: errorReducer,
  });
