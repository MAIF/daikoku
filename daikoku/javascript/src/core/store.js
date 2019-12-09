import { applyMiddleware, compose, createStore } from 'redux';
import thunkMiddleware from 'redux-thunk';
import { reducers } from './';
import { createLogger } from 'redux-logger';
import { routerMiddleware } from 'connected-react-router';
import { createBrowserHistory } from 'history';

export const history = createBrowserHistory();

export const store = context => {
  let composeEnhancers = compose;
  let middleware = [thunkMiddleware];

  if (process.env.NODE_ENV !== 'production') {
    composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
    middleware = [...middleware, createLogger(), routerMiddleware(history)];
  }

  return createStore(
    reducers(history),
    { context },
    composeEnhancers(applyMiddleware(...middleware))
  );
};
