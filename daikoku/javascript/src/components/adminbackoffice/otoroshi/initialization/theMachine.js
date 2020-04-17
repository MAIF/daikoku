import { Machine, assign } from 'xstate';
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
    apikeys: []
  },
  states: {
    otoroshiSelection: {
      on: {
        LOAD: 'loadingOtoroshiGroups'
      }
    },
    loadingOtoroshiGroups: {
      invoke: {
        id: 'otoroshiGroupsLoader',
        src: (_context, { otoroshi, tenant }) => {
          return (callBack, _onEvent) => {
            Services.getOtoroshiGroups(tenant, otoroshi)
              .then(groups => {
                callBack({ type: 'DONE_COMPLETE', groups, tenant, otoroshi })
              })
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
        }
      }
    },
    stepSelection: {
      on: {
        LOAD_SERVICE: 'loadingServices',
        LOAD_APIKEY: 'loadingApikeys',
      }
    },
    loadingServices: {
      invoke: {
        id: 'otoroshiServicesLoader',
        src: (context, _event) => {
          return (callBack, _event) => Services.getOtoroshiServices(context.tenant, context.otoroshi)
            .then(newServices => callBack({ type: 'DONE_COMPLETE', newServices }))
        }
      },
      on: {
        DONE_COMPLETE: {
          target: 'completeServices',
          actions: assign({
            services: ({ services }, { newServices = [] }) => [...services, ...newServices]
          })
        }
      }
    },
    completeServices: {
      on: {
        RECAP: 'recap',
        CREATE_APIS: 'apiCreation'
      }
    },
    recap: {
      on: {
        ROLLBACK: 'completeServices',
        CREATE_APIS: 'apiCreation'
      }
    },
    apiCreation: {
      invoke: {
        id: 'daikokuApisCreator',
        src: (context, { createdApis, callBackCreation }) => {
          return (callBack, _onEvent) => {
            //todo: try to stream creation or bulk it
            createdApis
              .reduce((result, api) => {
                return result
                  .then(() => Services.fetchNewApi())
                  .then(newApi => ({
                    ...newApi,
                    name: api.name,
                    team: api.team,
                    published: true,
                    possibleUsagePlans: newApi.possibleUsagePlans.map(pp => ({
                      ...pp,
                      otoroshiTarget: { otoroshiSettings: context.otoroshi, serviceGroup: api.groupId, apikeyCustomization }
                    }))
                  }))
                  .then(api => Services.createTeamApi(api.team, api))
              }, Promise.resolve())
              .then(() => callBackCreation())
              .then(() => callBack({ type: 'CREATION_DONE' }))
          }
        }
      },
      on: {
        CREATION_DONE: 'loadingApikeys'
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
          }
        }
      },
      on: {
        DONE_COMPLETE: {
          target: 'completeApikeys',
          actions: assign({
            apikeys: ({ apikeys }, { newApikeys = [] }) => [...apikeys, ...newApikeys]
          })
        }
      }
    },
    completeApikeys: {
      on: {
        RECAP: 'recapSubs',
        CREATE_APIKEYS: 'subscriptionCreation'
      }
    },
    recapSubs: {
      on: {
        ROLLBACK: 'completeApikeys',
        CREATE_APIKEYS: 'subscriptionCreation'
      }
    },
    subscriptionCreation: {
      invoke: {
        id: 'daikokuApisCreator',
        src: (_context, { createdSubs }) => {
          return (callBack, _onEvent) => {
            createdSubs
              .reduce((result, apikey) => {
                return result
                  .then(() => Services.initApiKey(apikey.api._id, apikey.team, apikey.plan, apikey))
              }, Promise.resolve())
              .then(() => callBack({ type: 'CREATION_DONE' }))
          }
        }
      },
      on: {
        CREATION_DONE: 'complete'
      }
    },
    complete: { type: "final" },
    failure: { type: "final" } //todo: update all step to get failure if something wrong appened
  }
})
