import React from 'react';
import ReactDOM from 'react-dom';
import jQuery from 'jquery';

import 'bootstrap/dist/css/bootstrap.css';
import './style/main.scss';

import 'bootstrap';

import { LoginPage } from './components/utils/login';
import { I18nProvider } from './contexts/i18n-context';

//@ts-ignore //FIXME when monkey-patch & ts will be compatible
window.$ = jQuery;
//@ts-ignore //FIXME when monkey-patch & ts will be compatible
window.jQuery = jQuery;

export function login(provider: any, callback: any, tenant: any) {
  ReactDOM.render(
    <I18nProvider tenant={tenant}>
      <LoginPage provider={provider} action={callback} tenant={tenant} method="post" />
    </I18nProvider>,
    document.getElementById('app')
  );
}
