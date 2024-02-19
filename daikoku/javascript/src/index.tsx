
import { ApolloClient, ApolloProvider, InMemoryCache } from '@apollo/client';
import { QueryClientProvider } from "@tanstack/react-query";
import jQuery from 'jquery';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';

import { DaikokuApp, DaikokuHomeApp } from './apps';
import { LoginPage, queryClient } from './components';
import { CurrentUserContextProvider } from './contexts/globalContext';
import { I18nProvider } from './contexts/i18n-context';

import '@maif/react-forms/lib/index.css';
import 'bootstrap/dist/css/bootstrap.css';
import 'react-tooltip/dist/react-tooltip.css';
import './style/main.scss';

import 'bootstrap';


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
  const expertMode = JSON.parse(localStorage.getItem('expertMode') || 'false');


  const container = document.getElementById('app');
  const root = createRoot(container!)

  root.render(
    <ApolloProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <CurrentUserContextProvider>
          <I18nProvider tenant={tenant} user={user}>
            <Toaster richColors position="top-right" />
            <DaikokuApp
              session={session}
              user={user}
              tenant={tenant}
              loginProvider={tenant.authProvider}
              loginAction={loginCallback}
            />
          </I18nProvider>
        </CurrentUserContextProvider>
      </QueryClientProvider>
    </ApolloProvider>

  );
}

export function login(provider: any, callback: any, tenant: any) {
  ReactDOM.render(
    <I18nProvider tenant={tenant}>
      <LoginPage provider={provider} action={callback} tenant={tenant} method="post" />
    </I18nProvider>,
    document.getElementById('app')
  );
}

export function initNotLogged(tenant: any) {

  const container = document.getElementById('app');
  const root = createRoot(container!)

  root.render(
    <I18nProvider tenant={tenant}>
      <DaikokuHomeApp tenant={tenant} />
    </I18nProvider>
  );
}
