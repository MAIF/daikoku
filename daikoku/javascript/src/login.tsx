import React from 'react';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import ReactDOM from 'react-dom';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'jque... Remove this comment to see the full error message
import jQuery from 'jquery';

import 'bootstrap/dist/css/bootstrap.css';
import './style/main.scss';

import 'bootstrap';
import '@fortawesome/fontawesome-free/css/all.css';

// @ts-expect-error TS(6142): Module './components/utils/login' was resolved to ... Remove this comment to see the full error message
import { LoginPage } from './components/utils/login';
// @ts-expect-error TS(6142): Module './components/utils/window' was resolved to... Remove this comment to see the full error message
import { registerAlert, registerConfirm, registerPrompt } from './components/utils/window';
// @ts-expect-error TS(6142): Module './locales/i18n-context' was resolved to '/... Remove this comment to see the full error message
import { I18nProvider } from './locales/i18n-context';

(window as any).$ = jQuery;
(window as any).jQuery = jQuery;

export function login(provider: any, callback: any, tenant: any) {
  ReactDOM.render(
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <I18nProvider tenant={tenant}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <LoginPage provider={provider} action={callback} tenant={tenant} method="post" />
    </I18nProvider>,
    document.getElementById('app')
  );
}

{
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  registerAlert(); // Hell Yeah !!!!
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  registerConfirm();
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  registerPrompt();
}
