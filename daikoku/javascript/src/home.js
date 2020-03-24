import React from 'react';
import ReactDOM from 'react-dom';
import jQuery from 'jquery';
import { Provider } from 'react-redux';

import { store } from './core';

import 'react-table/react-table.css';
import 'bootstrap/dist/css/bootstrap.css';
import './style/main.scss';

import 'bootstrap';
import '@fortawesome/fontawesome-free/css/all.css';

import { DaikokuHomeApp } from './apps/DaikokuHomeApp';
import { registerAlert, registerConfirm, registerPrompt, registerContact } from './components/utils/window';

window.$ = jQuery;
window.jQuery = jQuery;

export function initNotLogged(tenant) {
  const currentLanguage = tenant.defaultLanguage || 'En';
  const storeInst = store({ tenant, currentLanguage });

  ReactDOM.render(
    <Provider store={storeInst}>
      <DaikokuHomeApp tenant={tenant} />
    </Provider>,
    document.getElementById('app')
  );

  registerAlert(); // Hell Yeah !!!!
  registerConfirm();
  registerPrompt();
  registerContact(storeInst);
}
