import { toastr } from 'react-redux-toastr';
import { SET_ERROR } from '../core';
import queryString from 'query-string';

function redirect() {
  toastr.error(
    'Not Authorized',
    'You are not authorized here anymore. You will be redirected in 5 seconds'
  );
  setTimeout(() => {
    window.location = '/';
  }, 5000);
}

export function customizeFetch(store) {
  let willRedirect = false;
  window.old_fetch = window.fetch;
  window.fetch = (...args) => {

    const dispatchError = response => response.json()
      .then(error => {
        store.dispatch({
          type: SET_ERROR,
          error: { status: response.status, message: error.error, args, response: error },
        });
        return Promise.reject(error);
      });

    const query = queryString.parse(window.location.search);
    const url = args[0];

    let newUrl = url;
    if (!!query.sessionId && url.indexOf('?') > -1) {
      newUrl = newUrl + '&sessionId=' + query.sessionId;
    }
    if (!!query.sessionId && url.indexOf('?') < 0) {
      newUrl = newUrl + '?sessionId=' + query.sessionId;
    }
    let newArgs = [...args];
    newArgs.shift();
    newArgs = [newUrl, ...newArgs];

    return window.old_fetch(...newArgs).then(r => {
      const status = r.status;
      if (r.redirected && r.url.indexOf('/auth/') > -1) {
        if (willRedirect === false) {
          willRedirect = true;
          // redirect();
        }
      } else if (status > 199 && status < 300) {
        // nothing to do yet
      } else if (status > 299 && status < 400) {
        // nothing to do yet
      } else if (status === 409) {
        toastr.error('Conflict', 'The resource already exists');
      } else if (status === 404) {
        // nothing to do yet
      } else if (status > 404 && status < 600) {
        return dispatchError(r);
      } else {
        // nothing to do yet
      }
      return r;
    });
  };
}
