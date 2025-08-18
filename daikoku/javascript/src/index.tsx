import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import jQuery from 'jquery';
import { useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { toast, Toaster } from 'sonner';

import { DaikokuApp } from './apps';
import { GlobalContext, GlobalContextProvider } from './contexts/globalContext';
import { I18nProvider } from './contexts/i18n-context';

import '@maif/react-forms/lib/index.css';
import 'bootstrap/dist/css/bootstrap.css';
import 'react-tooltip/dist/react-tooltip.css';
import '@fortawesome/fontawesome-free/css/all.min.css'
import './style/main.scss';

import 'bootstrap';

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
    <Toaster richColors position="top-right" theme={theme.toLocaleLowerCase() as 'light' | 'dark'} containerAriaLabel='notifications' />
  )
}


root.render(
  <QueryClientProvider client={queryClient}>
    <GlobalContextProvider>
      <I18nProvider>
        <ToasterComponent />
        <DaikokuApp />
      </I18nProvider>
    </GlobalContextProvider>
  </QueryClientProvider>
);