//import 'es6-shim';
//import 'whatwg-fetch';

import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import SwaggerEditor, { plugins } from 'swagger-editor'; //!!! don't remove this line !!!

import jQuery from 'jquery';

import 'bootstrap/dist/css/bootstrap.css';
import '@maif/react-forms/lib/index.css';
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
import { SessionModal } from './components/frontend/modals/SessionModal';

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
  const expertMode = JSON.parse(localStorage.getItem('expertMode') || false);
  const storeInst = store({
    connectedUser: user,
    tenant,
    impersonator,
    isTenantAdmin,
    apiCreationPermitted,
    expertMode,
  });

  customizeFetch(storeInst);

  ReactDOM.render(
    <Provider store={storeInst}>
      <ApolloProvider client={client}>
        <I18nProvider tenant={tenant} user={user}>
          <>
            <SessionModal session={session} />
            <DaikokuApp
              user={user}
              tenant={tenant}
              impersonator={impersonator}
              loginProvider={tenant.authProvider}
              loginAction={loginCallback}
            />
          </>
        </I18nProvider>
      </ApolloProvider>
    </Provider>,
    document.getElementById('app')
  );
  if (session) {
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
