import { combineReducers } from 'redux';
import { contextReducer, errorReducer } from './';

export const reducers = () =>
  combineReducers({
    context: contextReducer,
    error: errorReducer,
  });
