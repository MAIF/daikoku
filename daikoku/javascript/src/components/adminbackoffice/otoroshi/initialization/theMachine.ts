import { nanoid } from 'nanoid';
import { assign, createMachine, fromCallback } from 'xstate';

import * as Services from '../../../../services';

// Types pour les événements
type MachineEvents =
  | { type: 'LOAD'; otoroshi: any; tenant: string }
  | { type: 'LOAD_PREVIOUS_STATE'; otoroshi: any; tenant: string; goto: string }
  | { type: 'LOAD_SERVICE'; up?: boolean }
  | { type: 'LOAD_APIKEY' }
  | { type: 'CANCEL' }
  | { type: 'RECAP' }
  | { type: 'ROLLBACK' }
  | { type: 'CREATE_APIS'; createdApis: any[]; callBackCreation: () => void }
  | { type: 'CREATE_APIKEYS'; createdSubs: any[]; callBackCreation: () => void }
  | {
      type: 'DONE_SERVICES';
      tenant: string;
      otoroshi: any;
      groups: any[];
      services: any[];
      routes: any[];
    }
  | {
      type: 'DONE_APIKEYS';
      tenant: string;
      otoroshi: any;
      groups: any[];
      services: any[];
      apikeys: any[];
      routes: any[];
    }
  | { type: 'DONE' }
  | {
      type: 'DONE_COMPLETE';
      groups?: any[];
      services?: any[];
      routes?: any[];
      tenant?: string;
      otoroshi?: any;
      newServices?: any[];
      newRoutes?: any[];
      newApikeys?: any[];
    }
  | { type: 'DONE_MORE'; newApikeys: any[]; nextPage: number }
  | { type: 'CREATION_DONE' }
  | { type: 'FAILURE'; error: any };

// Type pour le contexte
type MachineContext = {
  tenant: string | undefined;
  otoroshi: any | undefined;
  groups: any[];
  services: any[];
  routes: any[];
  apikeys: any[];
  error: any | undefined;
};

const apikeyCustomization = {
  clientIdOnly: false,
  constrainedServicesOnly: false,
  readOnly: false,
  metadata: {},
  customMetadata: [],
  tags: [],
  restrictions: {
    enabled: false,
    allowLast: true,
    allowed: [],
    forbidden: [],
    notFound: [],
  },
};

export const theMachine = createMachine({
  types: {} as {
    context: MachineContext;
    events: MachineEvents;
  },
  id: 'the-machine',
  initial: 'otoroshiSelection',
  context: {
    tenant: undefined,
    otoroshi: undefined,
    groups: [],
    services: [],
    routes: [],
    apikeys: [],
    error: undefined,
  },
  states: {
    otoroshiSelection: {
      on: {
        LOAD: 'loadingOtoroshiGroups',
        LOAD_PREVIOUS_STATE: 'loadingPreviousState',
      },
    },
    loadingPreviousState: {
      invoke: {
        id: 'previousStateLoader',
        src: fromCallback(({ sendBack, input }) => {
          const { otoroshi, tenant, goto } = input;

          if (goto === 'services') {
            Promise.all([
              Services.getOtoroshiGroups(tenant, otoroshi),
              Services.getOtoroshiServices(tenant, otoroshi),
              Services.getOtoroshiRoutes(tenant, otoroshi),
            ]).then(([groups, services, routes]) => {
              sendBack({ type: 'DONE_SERVICES', tenant, otoroshi, groups, services, routes });
            });
          } else if (goto === 'apikeys') {
            Promise.all([
              Services.getOtoroshiGroups(tenant, otoroshi),
              Services.getOtoroshiServices(tenant, otoroshi),
              Services.getOtoroshiRoutes(tenant, otoroshi),
              Services.getOtoroshiApiKeys(tenant, otoroshi),
            ]).then(([groups, services, routes, apikeys]) => {
              sendBack({
                type: 'DONE_APIKEYS',
                tenant,
                otoroshi,
                groups,
                services,
                apikeys,
                routes,
              });
            });
          } else {
            sendBack({ type: 'DONE' });
          }
        }),
        input: ({ event }) => event,
      },
      on: {
        DONE_SERVICES: {
          target: 'completeServices',
          actions: assign({
            tenant: ({ event }) => event.tenant,
            otoroshi: ({ event }) => event.otoroshi,
            groups: ({ event }) => event.groups || [],
            services: ({ event }) => event.services || [],
            routes: ({ event }) => event.routes || [],
          }),
        },
        DONE_APIKEYS: {
          target: 'completeApikeys',
          actions: assign({
            tenant: ({ event }) => event.tenant,
            otoroshi: ({ event }) => event.otoroshi,
            groups: ({ event }) => event.groups || [],
            services: ({ event }) => event.services || [],
            apikeys: ({ event }) => event.apikeys || [],
            routes: ({ event }) => event.routes || [],
          }),
        },
        DONE: 'otoroshiSelection',
      },
    },
    loadingOtoroshiGroups: {
      invoke: {
        id: 'otoroshiGroupsLoader',
        src: fromCallback(({ sendBack, input }) => {
          const { otoroshi, tenant } = input;

          Promise.all([
            Services.getOtoroshiGroups(tenant, otoroshi),
            Services.getOtoroshiServices(tenant, otoroshi),
            Services.getOtoroshiRoutes(tenant, otoroshi),
          ])
            .then(([groups, services, routes]) => {
              if (groups.error) sendBack({ type: 'FAILURE', error: { ...groups } });
              if (services.error) sendBack({ type: 'FAILURE', error: { ...services } });
              if (routes.error) sendBack({ type: 'FAILURE', error: { ...routes } });
              else sendBack({ type: 'DONE_COMPLETE', groups, services, tenant, otoroshi, routes });
            })
            .catch((error) => sendBack({ type: 'FAILURE', error }));
        }),
        input: ({ event }) => event,
      },
      on: {
        DONE_COMPLETE: {
          target: 'stepSelection',
          actions: assign({
            tenant: ({ event }) => event.tenant,
            otoroshi: ({ event }) => event.otoroshi,
            groups: ({ event }) => event.groups || [],
            services: ({ event }) => event.services || [],
            routes: ({ event }) => event.routes || [],
          }),
        },
        FAILURE: {
          target: 'failure',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },
    stepSelection: {
      on: {
        LOAD_SERVICE: 'loadingServices',
        LOAD_APIKEY: 'loadingApikeys',
        CANCEL: {
          target: 'otoroshiSelection',
          actions: assign({
            tenant: undefined,
            otoroshi: undefined,
            groups: [],
            services: [],
            routes: [],
            apikeys: [],
            error: undefined,
          }),
        },
      },
    },
    loadingServices: {
      invoke: {
        id: 'otoroshiServicesLoader',
        src: fromCallback(({ sendBack, input }) => {
          const { tenant, otoroshi } = input;

          Promise.all([
            Services.getOtoroshiServices(tenant, otoroshi),
            Services.getOtoroshiRoutes(tenant, otoroshi),
          ])
            .then(([newServices, newRoutes]) => {
              if (newServices.error || newRoutes.error) {
                sendBack({ type: 'FAILURE', error: { ...(newServices || newRoutes) } });
              } else {
                sendBack({ type: 'DONE_COMPLETE', newServices, newRoutes });
              }
            })
            .catch((error) => sendBack({ type: 'FAILURE', error }));
        }),
        input: ({ context }) => ({ tenant: context.tenant, otoroshi: context.otoroshi }),
      },
      on: {
        DONE_COMPLETE: {
          target: 'completeServices',
          actions: assign({
            services: ({ event }) => event.newServices || [],
            routes: ({ event }) => event.newRoutes || [],
          }),
        },
        FAILURE: {
          target: 'failure',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },
    completeServices: {
      on: {
        RECAP: 'recap',
        CREATE_APIS: 'apiCreation',
        CANCEL: {
          target: 'otoroshiSelection',
          actions: assign({
            tenant: undefined,
            otoroshi: undefined,
            groups: [],
            services: [],
            routes: [],
            apikeys: [],
            error: undefined,
          }),
        },
      },
    },
    recap: {
      on: {
        ROLLBACK: 'completeServices',
        CREATE_APIS: 'apiCreation',
        CANCEL: {
          target: 'otoroshiSelection',
          actions: assign({
            tenant: undefined,
            otoroshi: undefined,
            groups: [],
            services: [],
            routes: [],
            apikeys: [],
            error: undefined,
          }),
        },
      },
    },
    apiCreation: {
      invoke: {
        id: 'daikokuApisCreator',
        src: fromCallback(({ sendBack, input }) => {
          const { createdApis, callBackCreation, tenant } = input;

          Services.fetchNewApi()
            .then((newApi) =>
              createdApis.map((api: any) => ({
                ...newApi,
                _id: nanoid(32),
                name: api.name,
                team: api.team,
                published: true,
              }))
            )
            .then(Services.apisInit)
            .then(() => localStorage.removeItem(`daikoku-initialization-${tenant}`))
            .then(() => callBackCreation())
            .then(() => sendBack({ type: 'CREATION_DONE' }))
            .catch((error) => sendBack({ type: 'FAILURE', error }));
        }),
        input: ({ context, event }) => {
          if (event.type === 'CREATE_APIS') {
            return {
              createdApis: event.createdApis,
              callBackCreation: event.callBackCreation,
              tenant: context.tenant,
            };
          }
          return { createdApis: [], callBackCreation: () => {}, tenant: context.tenant };
        },
      },
      on: {
        CREATION_DONE: 'loadingApikeys',
        FAILURE: {
          target: 'failure',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },
    loadingApikeys: {
      invoke: {
        id: 'otoroshiApikeysLoader',
        src: fromCallback(({ sendBack, input }) => {
          const { tenant, otoroshi } = input;

          Services.getOtoroshiApiKeys(tenant, otoroshi)
            .then((newApikeys) => {
              if (newApikeys.error) sendBack({ type: 'FAILURE', error: { ...newApikeys } });
              else {
                const hasMore = newApikeys.length === (input as any).perPage;
                if (hasMore) {
                  sendBack({
                    type: 'DONE_MORE',
                    newApikeys,
                    nextPage: (input as any).page + 1,
                  });
                } else {
                  sendBack({ type: 'DONE_COMPLETE', newApikeys });
                }
              }
            })
            .catch((error) => sendBack({ type: 'FAILURE', error }));
        }),
        input: ({ context }) => ({ tenant: context.tenant, otoroshi: context.otoroshi }),
      },
      on: {
        DONE_COMPLETE: {
          target: 'completeApikeys',
          actions: assign({
            apikeys: ({ event }) => event.newApikeys || [],
          }),
        },
        FAILURE: {
          target: 'failure',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },
    completeApikeys: {
      on: {
        RECAP: 'recapSubs',
        CREATE_APIKEYS: 'subscriptionCreation',
        CANCEL: {
          target: 'otoroshiSelection',
          actions: assign({
            tenant: undefined,
            otoroshi: undefined,
            groups: [],
            services: [],
            routes: [],
            apikeys: [],
            error: undefined,
          }),
        },
      },
    },
    recapSubs: {
      on: {
        ROLLBACK: 'completeApikeys',
        CREATE_APIKEYS: 'subscriptionCreation',
        CANCEL: {
          target: 'otoroshiSelection',
          actions: assign({
            tenant: undefined,
            otoroshi: undefined,
            groups: [],
            services: [],
            routes: [],
            apikeys: [],
            error: undefined,
          }),
        },
      },
    },
    subscriptionCreation: {
      invoke: {
        id: 'daikokuSubscriptionsCreator',
        src: fromCallback(({ sendBack, input }) => {
          const { createdSubs, callBackCreation, tenant } = input;

          const subscriptions = createdSubs.map((apikey) => ({
            apikey: {
              clientName: apikey.clientName,
              clientId: apikey.clientId,
              clientSecret: apikey.clientSecret,
            },
            plan: apikey.plan,
            team: apikey.team,
            api: apikey.api,
          }));

          Services.subscriptionsInit(subscriptions)
            .then(() => callBackCreation())
            .then(() => {
              localStorage.removeItem(`daikoku-initialization-${tenant}`);
              sendBack({ type: 'CREATION_DONE' });
            })
            .catch((error) => sendBack({ type: 'FAILURE', error }));
        }),
        input: ({ context, event }) => {
          if (event.type === 'CREATE_APIKEYS') {
            return {
              createdSubs: event.createdSubs,
              callBackCreation: event.callBackCreation,
              tenant: context.tenant,
            };
          }
          return { createdSubs: [], callBackCreation: () => {}, tenant: context.tenant };
        },
      },
      on: {
        CREATION_DONE: 'otoroshiSelection',
        FAILURE: {
          target: 'failure',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },
    failure: { type: 'final' },
  },
});
