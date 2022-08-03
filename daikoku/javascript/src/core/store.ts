import { applyMiddleware, compose, createStore } from 'redux';
import thunkMiddleware from 'redux-thunk';
import { reducers } from './';
import { createBrowserHistory } from 'history';

export const history = createBrowserHistory();

export const store = (context: any) => {
  let composeEnhancers = compose;
  let middleware = [thunkMiddleware];

  if (process.env.NODE_ENV !== 'production') {
    composeEnhancers = (window as any).__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
  }

  return createStore(reducers(), { context }, composeEnhancers(applyMiddleware(...middleware)));
};
