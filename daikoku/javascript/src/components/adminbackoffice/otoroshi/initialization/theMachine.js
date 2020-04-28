import { Machine, assign } from 'xstate';
import faker from 'faker';

import * as Services from '../../../../services';

const apikeyCustomization = {
  dynamicPrefix: null,
  clientIdOnly: false,
  constrainedServicesOnly: false,
  readOnly: false,
  metadata: {},
  tags: [],
  restrictions: {
    enabled: false,
    allowLast: true,
    allowed: [],
    forbidden: [],
    notFound: []
  }
}

export const theMachine = Machine({
  id: 'the-machine',
  initial: 'otoroshiSelection',
  context: {
    tenant: undefined,
    otoroshi: undefined,
    groups: [],
    services: [],
    apikeys: [],
    error: undefined
  },
  states: {
    otoroshiSelection: {
      on: {
        LOAD: 'loadingOtoroshiGroups',
        LOAD_PREVIOUS_STATE: 'loadingPreviousState'
      }
    },
    loadingPreviousState: {
      invoke: {
        id: 'previousStateLoader',
        src: (_context, { otoroshi, tenant, goto }) => {
          return (callBack, _onEvent) => {
            if  (goto === "services") {
              Promise.all([
                Services.getOtoroshiGroups(tenant, otoroshi),
                Services.getOtoroshiServices(tenant, otoroshi)
              ])
              .then(([groups, services]) => {
                callBack({ type: "DONE_SERVICES", tenant, otoroshi, groups, services})
              })
            } else if (goto === "apikeys") {
              Promise.all([
                Services.getOtoroshiGroups(tenant, otoroshi),
                Services.getOtoroshiApiKeys(tenant, otoroshi)
              ])
                .then(([groups, apikeys]) => {
                  callBack({ type: "DONE_SERVICES", tenant, otoroshi, groups, apikeys })
                })
            } else {
              callBack({ type: "DONE" })
            }
          }
        }
      },
      on: {
        DONE_SERVICES: {
          target: 'completeServices',
          actions: assign({
            tenant: (_context, { tenant }) => tenant,
            otoroshi: (_context, { otoroshi }) => otoroshi,
            groups: (_context, { groups = [] }) => groups,
            services: (_context, { services = [] }) => services,
          })
        },
        DONE_APIKEYS: {
          target: 'completeApikeys',
          actions: assign({
            tenant: (_context, { tenant }) => tenant,
            otoroshi: (_context, { otoroshi }) => otoroshi,
            groups: (_context, { groups = [] }) => groups,
            apikeys: (_context, { apikeys = [] }) => apikeys,
          })
        },
        DONE: 'otoroshiSelection'
      }
    },
    loadingOtoroshiGroups: {
      invoke: {
        id: 'otoroshiGroupsLoader',
        src: (_context, { otoroshi, tenant }) => {
          return (callBack, _onEvent) => {
            Services.getOtoroshiGroups(tenant, otoroshi)
              .then(groups => callBack({ type: 'DONE_COMPLETE', groups, tenant, otoroshi }))
              .catch(error => callBack({ type: 'FAILURE', error }))
          }
        }
      },
      on: {
        DONE_COMPLETE: {
          target: 'stepSelection',
          actions: assign({
            tenant: (_context, { tenant }) => tenant,
            otoroshi: (_context, { otoroshi }) => otoroshi,
            groups: (_context, { groups = [] }) => groups,
          })
        },
        FAILURE: {
          target: 'failure',
          actions: assign({
            error: (_context, { error }) => error
          })
        }
      }
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
            error: undefined
          })
        }
      }
    },
    loadingServices: {
      invoke: {
        id: 'otoroshiServicesLoader',
        src: (context, _event) => {
          return (callBack, _event) => Services.getOtoroshiServices(context.tenant, context.otoroshi)
            .then(newServices => callBack({ type: 'DONE_COMPLETE', newServices }))
            .catch(error => callBack({ type: 'FAILURE', error }))
        }
      },
      on: {
        DONE_COMPLETE: {
          target: 'completeServices',
          actions: assign({
            services: ({ services }, { newServices = [] }) => [...services, ...newServices]
          })
        },
        FAILURE: {
          target: 'failure',
          actions: assign({
            error: (_context, { error }) => error
          })
        }
      }
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
            error: undefined
          })
        }
      }
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
            error: undefined
          })
        }
      }
    },
    apiCreation: {
      invoke: {
        id: 'daikokuApisCreator',
        src: (context, { createdApis, callBackCreation }) => {
          return (callBack, _onEvent) => {
            Services.fetchNewApi()
              .then(newApi => createdApis.map(api => ({
                ...newApi,
                _id: faker.random.alphaNumeric(32),
                name: api.name,
                team: api.team,
                published: true,
                possibleUsagePlans: newApi.possibleUsagePlans.map(pp => ({
                  ...pp,
                  otoroshiTarget: { otoroshiSettings: context.otoroshi, serviceGroup: api.groupId, apikeyCustomization }
                }))
              })))
              .then(apis => Services.apisInit(apis))
              .then(() => localStorage.removeItem(`daikoku-initialization-${context.tenant}`))
              .then(() => callBackCreation())
              .then(() => callBack({ type: 'CREATION_DONE' }))
              .catch(error => callBack({ type: "FAILURE", error }))
          }
        }
      },
      on: {
        CREATION_DONE: 'loadingApikeys',
        FAILURE: {
          target: 'failure',
          actions: assign({
            error: (_context, { error }) => error
          })
        }
      }
    },
    loadingApikeys: {
      invoke: {
        id: 'otoroshiServicesLoader',
        src: (context, _event) => {
          return (callBack, _onEvent) => {
            Services.getOtoroshiApiKeys(context.tenant, context.otoroshi)
              .then(newApikeys => {
                const hasMore = newApikeys.length === context.perPage;
                if (hasMore) {
                  callBack({ type: 'DONE_MORE', newApikeys, nextPage: context.page + 1 })
                } else {
                  callBack({ type: 'DONE_COMPLETE', newApikeys })
                }
              })
              .catch(error => callBack({ type: 'FAILURE', error }))
          }
        }
      },
      on: {
        DONE_COMPLETE: {
          target: 'completeApikeys',
          actions: assign({
            apikeys: ({ apikeys }, { newApikeys = [] }) => [...apikeys, ...newApikeys]
          })
        },
        FAILURE: {
          target: 'failure',
          actions: assign({
            error: (_context, { error }) => error
          })
        }
      }
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
            error: undefined
          })
        }
      }
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
            error: undefined
          })
        }
      }
    },
    subscriptionCreation: {
      invoke: {
        id: 'daikokuSubscriptionsCreator',
        src: (_context, { createdSubs }) => {
          return (callBack, _onEvent) => {
            const subscriptions = createdSubs
              .map(apikey => ({
                apikey: {
                  clientName: apikey.clientName,
                  clientId: apikey.clientId,
                  clientSecret: apikey.clientSecret
                },
                plan: apikey.plan._id,
                team: apikey.team,
                api: apikey.api._id
              }))

            Services.subscriptionsInit(subscriptions)
              .then(() => callBack({ type: 'CREATION_DONE' }))
              .catch(error => callBack({ type: 'FAILURE', error }))
          }
        }
      },
      on: {
        CREATION_DONE: 'complete',
        FAILURE: {
          target: 'failure',
          actions: assign({
            error: (_context, { error }) => error
          })
        }
      }
    },
    complete: { 
      type: "final",
      invoke: {
        id: 'cleaning',
        src: ({tenant}, _event) => {
          return (_callback, _onEvent) => {
            localStorage.removeItem(`daikoku-initialization-${tenant}`)
          }
        }
      } 
    },
    failure: { type: "final" }
  }
})
