import React from 'react';
import ReactDOM from 'react-dom';

import jQuery from 'jquery';

import { I18nProvider } from './contexts/i18n-context';

import 'bootstrap/dist/css/bootstrap.css';
import './style/main.scss';

import 'bootstrap';

import { DaikokuHomeApp } from './apps/DaikokuHomeApp';

(window as any).$ = jQuery;
(window as any).jQuery = jQuery;

export function initNotLogged(tenant: any) {

  ReactDOM.render(
    <I18nProvider tenant={tenant}>
      <DaikokuHomeApp tenant={tenant} />
    </I18nProvider>,
    document.getElementById('app')
  );
}
