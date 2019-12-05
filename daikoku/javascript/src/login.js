import React from 'react';
import ReactDOM from 'react-dom';
import jQuery from 'jquery';

import 'react-table/react-table.css';
import 'bootstrap/dist/css/bootstrap.css';
import './style/main.scss';

import 'bootstrap';
import '@fortawesome/fontawesome-free/css/all.css';

import { LoginPage } from './components/utils/login';
import { registerAlert, registerConfirm, registerPrompt } from './components/utils/window';

window.$ = jQuery;
window.jQuery = jQuery;

export function login(provider, callback, tenant) {
  ReactDOM.render(
    <LoginPage provider={provider} action={callback} tenant={tenant} method="post" />,
    document.getElementById('app')
  );
}

{
  registerAlert(); // Hell Yeah !!!!
  registerConfirm();
  registerPrompt();
}
