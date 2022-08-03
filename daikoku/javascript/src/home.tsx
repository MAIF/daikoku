import React from 'react';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import ReactDOM from 'react-dom';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'jque... Remove this comment to see the full error message
import jQuery from 'jquery';
import { Provider } from 'react-redux';

import { store } from './core/store'
// @ts-expect-error TS(6142): Module './locales/i18n-context' was resolved to '/... Remove this comment to see the full error message
import { I18nProvider } from './locales/i18n-context';

import 'bootstrap/dist/css/bootstrap.css';
import './style/main.scss';

import 'bootstrap';
import '@fortawesome/fontawesome-free/css/all.css';

// @ts-expect-error TS(6142): Module './apps/DaikokuHomeApp' was resolved to '/U... Remove this comment to see the full error message
import { DaikokuHomeApp } from './apps/DaikokuHomeApp';
import {
  registerAlert,
  registerConfirm,
  registerPrompt,
  registerContact,
// @ts-expect-error TS(6142): Module './components/utils/window' was resolved to... Remove this comment to see the full error message
} from './components/utils/window';

(window as any).$ = jQuery;
(window as any).jQuery = jQuery;

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

  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  registerAlert(); // Hell Yeah !!!!
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  registerConfirm();
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  registerPrompt();
  registerContact(storeInst);
}
