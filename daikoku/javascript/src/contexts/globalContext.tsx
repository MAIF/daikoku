import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, {
  PropsWithChildren,
  useEffect,
  useState,
} from 'react';

import { GraphQLClient } from 'graphql-request';
import { Spinner } from '../components/utils/Spinner';
import * as Services from '../services/index';
import {
  AuthProvider,
  DaikokuMode,
  Display,
  IStateContext,
  TenanMode,
  isError
} from '../types';

type TGlobalContext = IStateContext & {
  reloadContext: () => Promise<void>;
  toggleExpertMode: () => void;
  toggleTheme: () => void;
  reloadUnreadNotificationsCount: () => void;
  customGraphQLClient: GraphQLClient
};
const initContext: TGlobalContext = {
  connectedUser: {
    _id: '',
    _humanReadableId: '',
    email: '',
    picture: '',
    isDaikokuAdmin: false,
    isGuest: true,
    starredApis: [],
    twoFactorAuthentication: null,
    name: 'fifou',
  },
  tenant: {
    _humanReadableId: 'string',
    _id: 'string',
    name: 'string',
    contact: 'string',
    creationSecurity: true,
    subscriptionSecurity: true,
    aggregationApiKeysSecurity: true,
    environmentAggregationApiKeysSecurity: true,
    apiReferenceHideForGuest: true,
    authProvider: AuthProvider.local,
    homePageVisible: true,
    mode: DaikokuMode.dev,
    tenantMode: TenanMode.default,
    display: Display.default,
    environments: [],
    loginProvider: 'Local',
    thirdPartyPaymentSettings: [],
    otoroshiSettings: [],
    accountCreationProcess: [],
    isPrivate: false
  },
  session: {
    created: new Date().getTime(),
    expires: new Date().getTime(),
    ttl: 0,
  },
  isTenantAdmin: false,
  apiCreationPermitted: false,
  unreadNotificationsCount: 0,
  expertMode: JSON.parse(localStorage.getItem('expertMode') || 'false'),
  reloadContext: () => Promise.resolve(),
  reloadUnreadNotificationsCount: () => Promise.resolve(),
  toggleExpertMode: () => { },
  loginAction: '',
  theme: localStorage.getItem('theme') || 'LIGHT',
  toggleTheme: () => { },
  graphQLEndpoint: "",
  customGraphQLClient: new GraphQLClient("")
};

export const GlobalContext = React.createContext<TGlobalContext>(initContext);

export const GlobalContextProvider = (props: PropsWithChildren) => {
  const getExpertMode = (): boolean =>
    JSON.parse(localStorage.getItem('expertMode') || 'false');
  const getTheme = (): string => {
    const actualTheme = localStorage.getItem('theme') || 'LIGHT';
    document.documentElement.setAttribute('data-theme', actualTheme);
    return actualTheme;
  };

  const [expertMode, setExpertMode] = useState<boolean>(getExpertMode());
  const [theme, setTheme] = useState<string>(getTheme());

  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: ['context'],
    queryFn: () => Services.getUserContext(),
  });
  const notificationCountQuery = useQuery({
    queryKey: ['notification-count'],
    queryFn: () => Services.myUnreadNotificationsCount(),
  });

  useEffect(() => {
    if (currentUserQuery?.data && !isError(currentUserQuery?.data)) {
      if (currentUserQuery.data.tenant.fontFamilyUrl) {
        let style: HTMLStyleElement | null = document.querySelector(
          'style#custom-font-family'
        );
        if (!style) {
          style = document.createElement('style');
          style.id = 'custom-font-family';
          document.head.appendChild(style);
        }
        style.innerText = `@font-face{
          font-family: "Custom";
          src: url("${currentUserQuery.data.tenant.fontFamilyUrl}")
          }`;
      }
      if (currentUserQuery.data.tenant.cssUrl) {
        let link: HTMLLinkElement | null = document.querySelector(
          'link#custom-css-by-url'
        );
        if (!link) {
          link = document.createElement('link');
          link.rel = 'stylesheet';
          link.media = 'screen';
          link.id = 'custom-css-by-url';
          document.head.appendChild(link);
        }
        link.href = currentUserQuery.data.tenant.cssUrl;
      }
      if (currentUserQuery.data.tenant.jsUrl) {
        let script: HTMLScriptElement | null = document.querySelector(
          'script#custom-js-by-url'
        );
        if (!script) {
          script = document.createElement('script');
          script.id = 'custom-js-by-url';
          document.body.appendChild(script);
        }
        script.src = currentUserQuery.data.tenant.jsUrl;
      }
      if (currentUserQuery.data.tenant.faviconUrl) {
        let link: HTMLLinkElement | null =
          document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = currentUserQuery.data.tenant.faviconUrl;
      }
    }
  }, [currentUserQuery.data]);

  if (currentUserQuery.isLoading) {
    return <Spinner />; //todo: get a real better loader who block & mask all the window
  }

  //todo: get a real better error displaying
  if (
    currentUserQuery.isError ||
    isError(currentUserQuery.data) ||
    !currentUserQuery.data
  ) {
    return <div>Something's happened when fetching user informations</div>;
  }

  const reloadContext = () =>
    queryClient.invalidateQueries({ queryKey: ['context'] });
  const reloadUnreadNotificationsCount = () =>
    queryClient.invalidateQueries({ queryKey: ['notification-count'] });

  const toggleExpertMode = () => {
    localStorage.setItem('expertMode', (!expertMode).toLocaleString());
    setExpertMode(!expertMode);
  };

  const toggleTheme = () => {
    if (theme === 'DARK') {
      document.documentElement.setAttribute('data-theme', 'LIGHT');
      localStorage.setItem('theme', 'LIGHT');
      setTheme('LIGHT');
    } else {
      document.documentElement.setAttribute('data-theme', 'DARK');
      localStorage.setItem('theme', 'DARK');
      setTheme('DARK');
    }
  };

  const customGraphQLClient = new GraphQLClient(currentUserQuery.data.graphQLEndpoint);

  return (
    <GlobalContext.Provider
      value={{
        ...currentUserQuery.data,
        reloadContext,
        expertMode,
        toggleExpertMode,
        theme,
        toggleTheme,
        unreadNotificationsCount: notificationCountQuery.data?.count || 0,
        reloadUnreadNotificationsCount,
        customGraphQLClient
      }}
    >
      {props.children}
    </GlobalContext.Provider>
  );
};
