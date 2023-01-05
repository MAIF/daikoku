import { combineReducers } from 'redux';
import { contextReducer, errorReducer } from './';
import { reducer as toasterReducer } from 'react-redux-toastr';

export const reducers = () =>
  combineReducers({
    context: contextReducer,
    toastr: toasterReducer,
    error: errorReducer,
  });
