//import 'es6-shim';
//import 'whatwg-fetch';

import React from 'react';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'swag... Remove this comment to see the full error message
import SwaggerEditor, { plugins } from 'swagger-editor'; //!!! don't remove this line !!!

// @ts-expect-error TS(7016): Could not find a declaration file for module 'jque... Remove this comment to see the full error message
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
// @ts-expect-error TS(6142): Module './components/utils/window' was resolved to... Remove this comment to see the full error message
} from './components/utils/window';
import { customizeFetch } from './services/customize';
// @ts-expect-error TS(6142): Module './locales/i18n-context' was resolved to '/... Remove this comment to see the full error message
import { I18nProvider } from './locales/i18n-context';

import { DaikokuApp, DaikokuHomeApp } from './apps';

import { ApolloClient, InMemoryCache, ApolloProvider } from '@apollo/client';
// @ts-expect-error TS(6142): Module './components/frontend/modals/SessionModal'... Remove this comment to see the full error message
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

(window as any).$ = jQuery;
(window as any).jQuery = jQuery;

export function init(
  user: any,
  tenant: any,
  impersonator: any,
  session: any,
  loginCallback: any,
  isTenantAdmin: any,
  apiCreationPermitted: any
) {
  // @ts-expect-error TS(2345): Argument of type 'string | false' is not assignabl... Remove this comment to see the full error message
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Provider store={storeInst}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <ApolloProvider client={client}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <I18nProvider tenant={tenant} user={user}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <SessionModal session={session} />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <DaikokuApp
              // @ts-expect-error TS(2322): Type '{ user: any; tenant: any; impersonator: any;... Remove this comment to see the full error message
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

export function login(provider: any, callback: any, tenant: any) {
  const storeInst = store({ tenant });
  ReactDOM.render(
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Provider store={storeInst}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <I18nProvider tenant={tenant}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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

export function initNotLogged(tenant: any) {
  const storeInst = store({ tenant });
  ReactDOM.render(
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Provider store={storeInst}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <I18nProvider tenant={tenant}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
