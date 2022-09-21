import React from 'react';
import ReactDOM from 'react-dom';
import jQuery from 'jquery';
import { Provider } from 'react-redux';

import { store } from './core/store';
import { I18nProvider } from './locales/i18n-context';

import 'bootstrap/dist/css/bootstrap.css';
import './style/main.scss';

import 'bootstrap';
import '@fortawesome/fontawesome-free/css/all.css';

import { DaikokuHomeApp } from './apps/DaikokuHomeApp';
import {
  registerAlert,
  registerConfirm,
  registerPrompt,
  registerContact,
} from './components/utils/window';

window.$ = jQuery;
window.jQuery = jQuery;

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

  registerAlert(); // Hell Yeah !!!!
  registerConfirm();
  registerPrompt();
  registerContact(storeInst);
}
