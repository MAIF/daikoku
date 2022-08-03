import { Machine, assign } from 'xstate';
import { nanoid } from 'nanoid';

import * as Services from '../../../../services';

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

// @ts-expect-error TS(2769): No overload matches this call.
export const theMachine = Machine({
  id: 'the-machine',
  initial: 'otoroshiSelection',
  context: {
    tenant: undefined,
    otoroshi: undefined,
    groups: [],
    services: [],
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
        src: (_context, { otoroshi, tenant, goto }) => {
          return (callBack, _onEvent) => {
            if (goto === 'services') {
              Promise.all([
                Services.getOtoroshiGroups(tenant, otoroshi),
                Services.getOtoroshiServices(tenant, otoroshi),
              ]).then(([groups, services]) => {
                callBack({ type: 'DONE_SERVICES', tenant, otoroshi, groups, services });
              });
            } else if (goto === 'apikeys') {
              Promise.all([
                Services.getOtoroshiGroups(tenant, otoroshi),
                Services.getOtoroshiServices(tenant, otoroshi),
                Services.getOtoroshiApiKeys(tenant, otoroshi),
              ]).then(([groups, services, apikeys]) => {
                callBack({ type: 'DONE_APIKEYS', tenant, otoroshi, groups, services, apikeys });
              });
            } else {
              callBack({ type: 'DONE' });
            }
          };
        },
      },
      on: {
        DONE_SERVICES: {
          target: 'completeServices',
          actions: assign({
            // @ts-expect-error TS(2339): Property 'tenant' does not exist on type 'EventObj... Remove this comment to see the full error message
            tenant: (_context, { tenant }) => tenant,
            // @ts-expect-error TS(2339): Property 'otoroshi' does not exist on type 'EventO... Remove this comment to see the full error message
            otoroshi: (_context, { otoroshi }) => otoroshi,
            // @ts-expect-error TS(2339): Property 'groups' does not exist on type 'EventObj... Remove this comment to see the full error message
            groups: (_context, { groups = [] }) => groups,
            // @ts-expect-error TS(2339): Property 'services' does not exist on type 'EventO... Remove this comment to see the full error message
            services: (_context, { services = [] }) => services,
          }),
        },
        DONE_APIKEYS: {
          target: 'completeApikeys',
          actions: assign({
            // @ts-expect-error TS(2339): Property 'tenant' does not exist on type 'EventObj... Remove this comment to see the full error message
            tenant: (_context, { tenant }) => tenant,
            // @ts-expect-error TS(2339): Property 'otoroshi' does not exist on type 'EventO... Remove this comment to see the full error message
            otoroshi: (_context, { otoroshi }) => otoroshi,
            // @ts-expect-error TS(2339): Property 'groups' does not exist on type 'EventObj... Remove this comment to see the full error message
            groups: (_context, { groups = [] }) => groups,
            // @ts-expect-error TS(2339): Property 'services' does not exist on type 'EventO... Remove this comment to see the full error message
            services: (_context, { services = [] }) => services,
            // @ts-expect-error TS(2339): Property 'apikeys' does not exist on type 'EventOb... Remove this comment to see the full error message
            apikeys: (_context, { apikeys = [] }) => apikeys,
          }),
        },
        DONE: 'otoroshiSelection',
      },
    },
    loadingOtoroshiGroups: {
      invoke: {
        id: 'otoroshiGroupsLoader',
        src: (_context, { otoroshi, tenant }) => {
          return (callBack, _onEvent) => {
            Promise.all([
              Services.getOtoroshiGroups(tenant, otoroshi),
              Services.getOtoroshiServices(tenant, otoroshi),
            ])
              .then(([groups, services]) => {
                if (groups.error) callBack({ type: 'FAILURE', error: { ...groups } });
                if (services.error) callBack({ type: 'FAILURE', error: { ...services } });
                else callBack({ type: 'DONE_COMPLETE', groups, services, tenant, otoroshi });
              })
              .catch((error) => callBack({ type: 'FAILURE', error }));
          };
        },
      },
      on: {
        DONE_COMPLETE: {
          target: 'stepSelection',
          actions: assign({
            // @ts-expect-error TS(2339): Property 'tenant' does not exist on type 'EventObj... Remove this comment to see the full error message
            tenant: (_context, { tenant }) => tenant,
            // @ts-expect-error TS(2339): Property 'otoroshi' does not exist on type 'EventO... Remove this comment to see the full error message
            otoroshi: (_context, { otoroshi }) => otoroshi,
            // @ts-expect-error TS(2339): Property 'groups' does not exist on type 'EventObj... Remove this comment to see the full error message
            groups: (_context, { groups = [] }) => groups,
            // @ts-expect-error TS(2339): Property 'services' does not exist on type 'EventO... Remove this comment to see the full error message
            services: (_context, { services = [] }) => services,
          }),
        },
        FAILURE: {
          target: 'failure',
          actions: assign({
            // @ts-expect-error TS(2339): Property 'error' does not exist on type 'EventObje... Remove this comment to see the full error message
            error: (_context, { error }) => error,
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
            apikeys: [],
            error: undefined,
          }),
        },
      },
    },
    loadingServices: {
      invoke: {
        id: 'otoroshiServicesLoader',
        src: (context, _event) => {
          return (callBack, _event) =>
            Services.getOtoroshiServices(context.tenant, context.otoroshi)
              .then((newServices) => {
                if (newServices.error) callBack({ type: 'FAILURE', error: { ...newServices } });
                else callBack({ type: 'DONE_COMPLETE', newServices });
              })
              .catch((error) => callBack({ type: 'FAILURE', error }));
        },
      },
      on: {
        DONE_COMPLETE: {
          target: 'completeServices',
          actions: assign({
            // @ts-expect-error TS(2339): Property 'newServices' does not exist on type 'Eve... Remove this comment to see the full error message
            services: ({ services }, { newServices = [] }) => [...services, ...newServices],
          }),
        },
        FAILURE: {
          target: 'failure',
          actions: assign({
            // @ts-expect-error TS(2339): Property 'error' does not exist on type 'EventObje... Remove this comment to see the full error message
            error: (_context, { error }) => error,
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
            apikeys: [],
            error: undefined,
          }),
        },
      },
    },
    apiCreation: {
      invoke: {
        id: 'daikokuApisCreator',
        src: (context, { createdApis, callBackCreation }) => {
          return (callBack, _onEvent) => {
            Services.fetchNewApi()
              .then((newApi) =>
                createdApis.map((api: any) => ({
                  ...newApi,
                  // @ts-expect-error TS(2552): Cannot find name 'nanoi'. Did you mean 'nanoid'?
                  _id: nanoi(32),
                  name: api.name,
                  team: api.team,
                  published: true,

                  possibleUsagePlans: newApi.possibleUsagePlans.map((pp: any) => ({
                    ...pp,

                    otoroshiTarget: {
                      otoroshiSettings: context.otoroshi,
                      authorizedEntities: { groups: [], services: [api.id] },
                      apikeyCustomization,
                    }
                  }))
                }))
              )
              .then((apis) => Services.apisInit(apis))
              .then(() => localStorage.removeItem(`daikoku-initialization-${context.tenant}`))
              .then(() => callBackCreation())
              .then(() => callBack({ type: 'CREATION_DONE' }))
              .catch((error) => callBack({ type: 'FAILURE', error }));
          };
        },
      },
      on: {
        CREATION_DONE: 'loadingApikeys',
        FAILURE: {
          target: 'failure',
          actions: assign({
            // @ts-expect-error TS(2339): Property 'error' does not exist on type 'EventObje... Remove this comment to see the full error message
            error: (_context, { error }) => error,
          }),
        },
      },
    },
    loadingApikeys: {
      invoke: {
        id: 'otoroshiServicesLoader',
        src: (context, _event) => {
          return (callBack, _onEvent) => {
            Services.getOtoroshiApiKeys(context.tenant, context.otoroshi)
              .then((newApikeys) => {
                if (newApikeys.error) callBack({ type: 'FAILURE', error: { ...newApikeys } });
                else {
                  const hasMore = newApikeys.length === (context as any).perPage;
                  if (hasMore) {
                    callBack({ type: 'DONE_MORE', newApikeys, nextPage: (context as any).page + 1 });
                  } else {
                    callBack({ type: 'DONE_COMPLETE', newApikeys });
                  }
                }
              })
              .catch((error) => callBack({ type: 'FAILURE', error }));
          };
        },
      },
      on: {
        DONE_COMPLETE: {
          target: 'completeApikeys',
          actions: assign({
            // @ts-expect-error TS(2339): Property 'newApikeys' does not exist on type 'Even... Remove this comment to see the full error message
            apikeys: ({ apikeys }, { newApikeys = [] }) => [...apikeys, ...newApikeys],
          }),
        },
        FAILURE: {
          target: 'failure',
          actions: assign({
            // @ts-expect-error TS(2339): Property 'error' does not exist on type 'EventObje... Remove this comment to see the full error message
            error: (_context, { error }) => error,
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
            apikeys: [],
            error: undefined,
          }),
        },
      },
    },
    subscriptionCreation: {
      invoke: {
        id: 'daikokuSubscriptionsCreator',
        src: ({ tenant }, { createdSubs, callBackCreation }) => {
          return (callBack, _onEvent) => {
            const subscriptions = createdSubs.map((apikey: any) => ({
              apikey: {
                clientName: apikey.clientName,
                clientId: apikey.clientId,
                clientSecret: apikey.clientSecret,
              },

              plan: apikey.plan._id,
              team: apikey.team,
              api: apikey.api._id
            }));

            Services.subscriptionsInit(subscriptions)
              .then(() => callBackCreation())
              .then(() => {
                localStorage.removeItem(`daikoku-initialization-${tenant}`);
                callBack({ type: 'CREATION_DONE' });
              })
              .catch((error) => callBack({ type: 'FAILURE', error }));
          };
        },
      },
      on: {
        CREATION_DONE: 'otoroshiSelection',
        FAILURE: {
          target: 'failure',
          actions: assign({
            // @ts-expect-error TS(2339): Property 'error' does not exist on type 'EventObje... Remove this comment to see the full error message
            error: (_context, { error }) => error,
          }),
        },
      },
    },
    failure: { type: 'final' },
  },
});
