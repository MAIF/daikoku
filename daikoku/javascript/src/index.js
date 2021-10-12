//import 'es6-shim';
//import 'whatwg-fetch';

import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';

import jQuery from 'jquery';

import 'bootstrap/dist/css/bootstrap.css';
import './style/main.scss';

import 'bootstrap';

import { store } from './core';
import { LoginPage } from './components';
import {
  registerAlert,
  registerConfirm,
  registerPrompt,
  registerContact,
} from './components/utils/window';
import { customizeFetch } from './services/customize';
import { I18nProvider } from './locales/i18n-context';

import { DaikokuApp, DaikokuHomeApp } from './apps';

import { ApolloClient, InMemoryCache, ApolloProvider } from '@apollo/client';

const client = new ApolloClient({
  uri: '/api/search',
  cache: new InMemoryCache(),
  defaultOptions: {
    query: {
      fetchPolicy: 'network-only',
    },
  },
});

window.$ = jQuery;
window.jQuery = jQuery;

export function init(
  user,
  tenant,
  impersonator,
  session,
  loginCallback,
  isTenantAdmin,
  apiCreationPermitted
) {
  const storeInst = store({
    connectedUser: user,
    tenant,
    impersonator,
    isTenantAdmin,
    apiCreationPermitted,
  });

  // history.listen(location => console.log(location))
  customizeFetch(storeInst);

  ReactDOM.render(
    <Provider store={storeInst}>
      <ApolloProvider client={client}>
        <I18nProvider tenant={tenant}>
          <DaikokuApp
            user={user}
            tenant={tenant}
            impersonator={impersonator}
            loginProvider={tenant.authProvider}
            loginAction={loginCallback}
          />
        </I18nProvider>
      </ApolloProvider>
    </Provider>,
    document.getElementById('app')
  );
  if (session) {
    let reloadTimeout = null;

    const extendSession = (close) => {
      return fetch('/api/session/_renew', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: '',
      })
        .then((r) => r.json())
        .then((sess) => {
          clearTimeout(reloadTimeout);
          setupTimeouts(sess);
          close();
        });
    };

    const setupTimeouts = (_session) => {
      const firstPing = _session.expires - Date.now() - 2 * 60 * 1000;
      const secondPing = _session.expires - Date.now() + 2000;
      setTimeout(() => {
        window.alert(
          (close) => (
            <div style={{ width: '100%' }}>
              <p>
                <Translation i18nkey="session.expire.info">
                  Your session is about to expire in less than 2 minutes. Do you want to extend it ?
                </Translation>
              </p>
              <div
                style={{
                  width: '100%',
                  disllay: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => extendSession(close)}>
                  <Translation i18nkey="session.extend">Yes, extend my session</Translation>
                </button>
              </div>
            </div>
          ),
          'Your session is expiring'
        );
      }, firstPing);
      reloadTimeout = setTimeout(() => {
        window.location = '/';
      }, secondPing);
    };

    setupTimeouts(session);
    registerAlert(storeInst); // Hell Yeah !!!!
    registerConfirm(storeInst);
    registerPrompt(storeInst);
    registerContact(storeInst);
  }
}

export function login(provider, callback, tenant) {
  const storeInst = store({ tenant });
  ReactDOM.render(
    <Provider store={storeInst}>
      <I18nProvider tenant={tenant}>
        <LoginPage provider={provider} action={callback} tenant={tenant} method="post" />
      </I18nProvider>
    </Provider>,
    document.getElementById('app')
  );
  registerAlert(storeInst); // Hell Yeah !!!!
  registerConfirm(storeInst);
  registerPrompt(storeInst);
  registerContact(storeInst);
}

export function initNotLogged(tenant) {
  const storeInst = store({ tenant });
  ReactDOM.render(
    <Provider store={storeInst}>
      <I18nProvider tenant={tenant}>
        <DaikokuHomeApp tenant={tenant} />
      </I18nProvider>
    </Provider>,
    document.getElementById('app')
  );
  registerAlert(storeInst); // Hell Yeah !!!!
  registerConfirm(storeInst);
  registerPrompt(storeInst);
  registerContact(storeInst);
}
