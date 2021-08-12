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
import { DaikokuApp, DaikokuHomeApp } from './apps';
import { LoginPage } from './components';
import {
  registerAlert,
  registerConfirm,
  registerPrompt,
  registerContact,
} from './components/utils/window';
import { customizeFetch } from './services/customize';
import { Option } from './components/utils';
import { Translation } from './locales';
import { I18nProvider } from './core/i18n-context';

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
  const tenantDefaultLanguage = Option(tenant.defaultLanguage).getOrElse('En');
  const currentLanguage = Option(user.defaultLanguage).getOrElse(tenantDefaultLanguage);
  const storeInst = store({
    connectedUser: user,
    tenant,
    impersonator,
    currentLanguage,
    isTenantAdmin,
    apiCreationPermitted,
  });

  // history.listen(location => console.log(location))
  customizeFetch(storeInst);

  ReactDOM.render(
    <Provider store={storeInst}>
      <I18nProvider>
        <DaikokuApp
          user={user}
          tenant={tenant}
          impersonator={impersonator}
          loginProvider={tenant.authProvider}
          loginAction={loginCallback}
          currentLanguage={currentLanguage}
        />
      </I18nProvider>
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
        const language = storeInst.getState().context.currentLanguage;
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
                  <Translation i18nkey="session.extend">
                    Yes, extend my session
                  </Translation>
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
  const currentLanguage = Option(tenant.defaultLanguage).getOrElse('En');
  const storeInst = store({ tenant, currentLanguage });
  ReactDOM.render(
    <Provider store={storeInst}>
      <I18nProvider>
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
  const currentLanguage = Option(tenant.defaultLanguage).getOrElse('En');
  const storeInst = store({ tenant, currentLanguage });
  ReactDOM.render(
    <Provider store={storeInst}>
      <I18nProvider>
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
