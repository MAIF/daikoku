import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import jQuery from 'jquery';
import { useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';

import { DaikokuApp } from './apps';
import { GlobalContext, GlobalContextProvider } from './contexts/globalContext';
import { I18nProvider } from './contexts/i18n-context';

import { BrowserRouter } from 'react-router-dom';

import '@maif/react-forms/lib/index.css';
import 'bootstrap/dist/css/bootstrap.css';
import 'react-tooltip/dist/react-tooltip.css';
import './style/main.scss';

import 'bootstrap';
import { Option, ReactFormsProvider } from "@maif/react-forms";

(window as any).$ = jQuery;
(window as any).jQuery = jQuery;

const container = document.getElementById('app');
const root = createRoot(container!)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false, // TODO for dev only
      refetchOnWindowFocus: false, // TODO for dev only
    },
  },
});

const ToasterComponent = () => {
  const { theme } = useContext(GlobalContext)

  return (
    <Toaster closeButton={true} richColors position="top-right" theme={theme.toLocaleLowerCase() as 'light' | 'dark'} containerAriaLabel='notifications' />
  )
}

const reactfromProviderOption: Option = {
  actions: {
    submit: { className: 'btn --primary' },
    cancel: { className: 'btn --secondary' },
    reset: { className: 'btn --secondary' },
    add: { className: 'btn --secondary --small' },
    remove: { className: 'btn --tertiary --small' },
    addEntry: { className: 'btn --secondary --small --icon-only' },
    removeEntry: { className: 'btn --secondary --small --icon-only' },
    markdownTab: { className: 'btn --secondary --small' },
    fileUpload: { className: 'btn --secondary --small' },
    collapse: { className: 'btn --secondary --small --icon-only' },
    selectButton: { className: 'btn --secondary' },
  }
}

root.render(
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <GlobalContextProvider>
        <I18nProvider>
          <ReactFormsProvider options={reactfromProviderOption}>
            <ToasterComponent />
            <DaikokuApp />
          </ReactFormsProvider>
        </I18nProvider>
      </GlobalContextProvider>
    </QueryClientProvider>
  </BrowserRouter>
);
