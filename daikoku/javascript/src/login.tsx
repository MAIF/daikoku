import React from 'react';
import ReactDOM from 'react-dom';
import jQuery from 'jquery';

import 'bootstrap/dist/css/bootstrap.css';
import './style/main.scss';

import 'bootstrap';
import '@fortawesome/fontawesome-free/css/all.css';

import { LoginPage } from './components/utils/login';
import { registerAlert, registerConfirm, registerPrompt } from './components/utils/window';
import { I18nProvider } from './locales/i18n-context';

(window as any).$ = jQuery;
(window as any).jQuery = jQuery;

export function login(provider: any, callback: any, tenant: any) {
  ReactDOM.render(
        <I18nProvider tenant={tenant}>
            <LoginPage provider={provider} action={callback} tenant={tenant} method="post" />
    </I18nProvider>,
    document.getElementById('app')
  );
}

{
    registerAlert(); // Hell Yeah !!!!
    registerConfirm();
    registerPrompt();
}
