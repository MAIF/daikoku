import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import Select from 'react-select';
import Creatable from 'react-select/creatable';
import StepWizard from 'react-step-wizard';
import classNames from "classnames";
import _ from 'lodash';
import faker from 'faker';
import { useMachine } from "@xstate/react";
import { Machine, assign } from 'xstate';

import { UserBackOffice } from '../../backoffice';
import { Can, manage, tenant as TENANT, Spinner, Option } from '../../utils';
import * as Services from '../../../services';

const createdApis = [];
const createdSubs = []

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
const theMachine = Machine({
  id: 'the-machine',
  initial: 'otoroshiSelection',
  context: {
    page: 1,
    perPage: 3,
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
          return (callBack, _onEvent) => {
            const {page, perPage} = context;
            //todo: not implemented but user could want to be back...
            Services.getOtoroshiServices(context.tenant, context.otoroshi, perPage, page) 
              .then(newServices => {
                const hasMore = newServices.length === perPage;
                if (hasMore) {
                  callBack({ type: 'DONE_MORE', newServices, nextPage: page + 1 })
                } else {
                  callBack({ type: 'DONE_COMPLETE', newServices })
                }
              })
          }
        }
      },
      on: {
        DONE_MORE: {
          target: 'moreServices',
          actions: assign({
            page: ({ page }, { nextPage = page }) => nextPage,
            services: ({ services }, { newServices = [] }) => [...services, ...newServices] //todo: be smart, remove 10 first before add 10 more
          })
        },
        DONE_COMPLETE: {
          target: 'completeServices',
          actions: assign({
            services: ({ services }, { newServices = [] }) => [...services, ...newServices] //todo: be smart, remove 10 first before add 10 more
          })
        }
      }
    },
    moreServices: {
      on: {
        LOAD_SERVICE: 'loadingServices'
      }
    },
    completeServices: {
      on: {
        CREATE_APIS: 'apiCreation'
      }
    },
    apiCreation: {
      invoke: {
        id: 'daikokuApisCreator',
        src: (context, _event) => {
          //todo: need to access to createdApis (maybeWith context...test it)
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
                    otoroshiTarget: { otoroshiSettings: otoroshiInstance.value, serviceGroup: api.groupId, apikeyCustomization }
                  }))
                }))
                .then(api => Services.createTeamApi(api.team, api))
            }, Promise.resolve())
            .then(() => callBack({ type: 'CREATION_DONE' }))
          //todo: need to update apis of state after creation
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
            //todo: be capable to get tenant & otoroshi from context
            //todo: not implemented but user could want to be back...
            Services.getOtoroshiApiKeys(context.tenant._id, context.otoroshi._id, context.perPage, 0)
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
        DONE_MORE: {
          target: 'moreApikeys',
          actions: assign({
            page: ({ page }, { nextPage = page }) => nextPage,
            apikeys: ({ apikeys }, { newApikeys = [] }) => [...apikeys, ...newApikeys] //todo: be smart, remove 10 first before add 10 more
          })
        },
        DONE_COMPLETE: {
          target: 'completeApikeys',
          actions: assign({
            apikeys: ({ apikeys }, { newApikeys = [] }) => [...apikeys, ...newApikeys] //todo: be smart, remove 10 first before add 10 more
          })
        }
      }
    },
    moreApikeys: {
      on: {
        LOAD_APIKEYS: 'loadingApikeys'
      }
    },
    completeApikeys: {
      on: {
        CREATE_APIS: 'subscriptionCreation'
      }
    },
    subscriptionCreation: {
      invoke: {
        id: 'daikokuApisCreator',
        src: (context, _event) => {
          //todo: need to access to createdApis (maybeWith context...test it)
          createdSubs
            .reduce((result, apikey, index) => {
              const currentSub = { name: apikey.clientName, index: index + 1 };

              return result
                .then(() => Promise.resolve(setActualSubCreation(currentSub)))
                .then(() => Services.initApiKey(apikey.api._id, apikey.team, apikey.plan, apikey))
            }, Promise.resolve())
            .then(() => callBack({ type: 'CREATION_DONE' }))
        }
      },
      on: {
        CREATION_DONE: 'complete'
      }
    },
    complete: { type: "final" },
    failure: { type: "final" }
  }
})


const InitializeFromOtoroshiComponent = props => {
  const [state, send] = useMachine(theMachine)

  const [otoroshis, setOtoroshis] = useState([])
  const [otoroshiInstance, setOtoroshiInstance] = useState(null)
  const [groups, setGroups] = useState([])
  const [services, setServices] = useState([])
  const [apikeys, setApikeys] = useState([])
  const [teams, setTeams] = useState([])
  const [apis, setApis] = useState([])
  const [instance, setInstance] = useState(undefined)
  const [currentIndex, setCurrentIndex] = useState(0)

  const [createdApis, setCreatedApis] = useState([])
  const [createdSubs, setCreatedSubs] = useState([])

  useEffect(() => {
    Promise.all([
      Services.teams(),
      Services.allSimpleOtoroshis(props.tenant._id),
      Services.myVisibleApis()
    ])
      .then( ([teams, otoroshis, apis]) => {
        setTeams(teams)
        setOtoroshis(otoroshis)
        setApis(apis)
      })
  }, [props.tenant])

  const createApis = () => {
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
              otoroshiTarget: { otoroshiSettings: otoroshiInstance.value, serviceGroup: api.groupId, apikeyCustomization }
            }))
          }))
          .then(api => Services.createTeamApi(api.team, api))
      }, Promise.resolve())
      .then(() => Services.myVisibleApis())
      .then(apis => setApis(apis))
      .then(() => instance.nextStep())
  }

  const createSubs = () => {
    createdSubs
      .reduce((result, apikey, index) => {
        const currentSub = { name: apikey.clientName, index: index + 1 };

        return result
          .then(() => Promise.resolve(setActualSubCreation(currentSub)))
          .then(() => Services.initApiKey(apikey.api._id, apikey.team, apikey.plan, apikey))
      }, Promise.resolve())
      .then(() => instance.nextStep())
  }

  const updateApi = api => {
    return Services.teamApi(api.team, api._id)
      .then(oldApi => Services.saveTeamApi(api.team, { ...oldApi, ...api }))
      .then(updatedApi => {
        const filteredApis = apis.filter(a => a._id !== updatedApi._id)
        setApis([...filteredApis, updatedApi])
      })
  }

  const servicesSteps = state.context.services
    .map((s, idx) => (
      <ServicesStep
        key={`service-${idx}`}
        service={s}
        groups={state.context.groups}
        teams={teams}
        testApiName={name => apis.some(a => a.name.toLowerCase() === name.toLowerCase()) || createdApis.some(a => a.name.toLowerCase() === name.toLowerCase())}
        addNewTeam={t => setTeams([...teams, t])}
        addService={(s, team) => setCreatedApis([...createdApis, { ...s, team }])}
        infos={{ index: idx, total: services.length, total: state.context.services.length }}
        loadMoreServices={() => send('LOAD_SERVICE')}
      />
    ))

  const subsSteps = _.orderBy(state.context.apikeys, ['authorizedGroup', "clientName"])
    .map((apikey, idx) => (
      <ApiKeyStep
        key={`sub-${idx}`}
        apikey={apikey}
        teams={teams}
        apis={apis}
        groups={groups}
        addNewTeam={t => setTeams([...teams, t])}
        addSub={(apikey, team, api, plan) => setCreatedSubs([...createdSubs, { ...apikey, team, api, plan }])}
        infos={{ index: idx, total: apikeys.length }}
        updateApi={api => updateApi(api)}
      />
    ))

    console.debug(`il y actuellement ${state.context.services.length} services de chargés`)
  return (
    <UserBackOffice tab="Otoroshi">
      <Can I={manage} a={TENANT} dispatchError>
        <div className="col-12 p-3" style={{
          backgroundColor: "lightGray"
        }}>
          {state.value === 'otoroshiSelection' && (
            <SelectOtoStep setOtoInstance={oto => send("LOAD", { otoroshi:  oto.value, tenant: props.tenant._id})} otoroshis={otoroshis} />
          )}
          {state.value === 'loadingOtoroshiGroups' && (
            <WaitingStep />
          )}
          {state.value === 'stepSelection' && (
            <SelectionStepStep goToServices={() => send('LOAD_SERVICE')} goToApikeys={() => send('LOAD_APIKEY')}/>
          )}
          {((state.matches('moreServices') || state.matches('loadingServices')) && !!state.context.services.length) && (
            <StepWizard
            onStepChange={infos => setCurrentIndex(infos.activeStep)}
            initialStep={currentIndex} 
            transitions={{}} 
            instance={setInstance}>
              { servicesSteps }
            </StepWizard>
          )}
          {state.value === 'moreApikeys' && (
            <StepWizard transitions={{}} instance={setInstance}>
              { subsSteps }
            </StepWizard>
          )}

          {/* <StepWizard
            instance={setInstance}
          >
            {[
              <SelectOtoStep key="oto" setOtoInstance={setOtoroshiInstance} otoroshis={otoroshis} />,
              <WaitingStep key="wait-1" />,
              <SelectionStepStep key="selection" subStep={servicesSteps.length + 6} />,
              ...servicesSteps,
              <EndStep key="end" createdApis={createdApis} groups={groups} teams={teams} />,
              <CreationStep key="creation-api" create={createApis} />,
              ...subsSteps,
              <RecapSubsStep key="recap-sub" createdSubs={createdSubs} apis={apis} teams={teams} />,
              <CreationStep key="creation-sub" create={createSubs} />,
              <FinishStep key="finish" />]}
          </StepWizard> */}
        </div>
      </Can>
    </UserBackOffice>
  );
}

const mapStateToProps = state => ({
  ...state.context,
});

export const InitializeFromOtoroshi = connect(mapStateToProps)(InitializeFromOtoroshiComponent);

//###############  HELP COMPONENTS ##################

const SelectionStepStep = props => {

  return (
    <div className="d-flex">
      <button className="btn btn-access" onClick={() => props.goToServices()}>Import Otoroshi Service</button>
      <button className="btn btn-access" onClick={() => props.goToApikeys()}>Import Otoroshi ApiKeys</button>
    </div>
  )
}

const SelectOtoStep = props => {
  const [otoInstance, setOtoInstance] = useState(undefined)

  useEffect(() => {
    if (otoInstance) {
      props.setOtoInstance(otoInstance)
    }
  }, [otoInstance])

  return (
    <div>
      <Select
        placeholder="select an Oto instance"
        className="add-member-select mr-2 reactSelect"
        options={props.otoroshis.map(s => ({
          label: s.url,
          value: s._id
        }))}
        selected={otoInstance}
        onChange={slug => setOtoInstance(slug)}
        value={otoInstance}
        classNamePrefix="reactSelect"
      />
    </div>
  )
}

const EndStep = props => {
  return (
    <div>
      <ul>
        {props.teams
          .filter(t => props.createdApis.some(api => api.team === t._id))
          .map((t, idx) => {
            return (
              <li key={idx}>
                <h4>{t.name}</h4>
                <ul>
                  {props.createdApis
                    .filter(s => s.team === t._id)
                    .map((s, idx) => {
                      return (
                        <li key={idx}>{s.name}</li>
                      )
                    })}
                </ul>
              </li>
            )
          })}
      </ul>
      <div className="d-flex justify-content-around">
        <button className='btn btn-access' onClick={props.previousStep}>Go Back</button>
        <button className='btn btn-access' onClick={props.nextStep}>Create</button>
      </div>

    </div>
  )
}

const RecapSubsStep = props => {
  return (
    <div>
      <ul>
        {props.apis
          .filter(a => props.createdSubs.some(s => s.api._id === a._id))
          .map((a, idx) => {
            return (
              <li key={idx}>
                <h4>{a.name}</h4>
                <ul>
                  {props.createdSubs
                    .filter(s => s.api._id === a._id)
                    .map((s, idx) => {
                      return (
                        <li key={idx}>{s.plan.customName || s.plan.type}/{s.clientName}</li>
                      )
                    })}
                </ul>
              </li>
            )
          })}
      </ul>
      <div className="d-flex justify-content-around">
        <button className='btn btn-access' onClick={props.previousStep}>Go Back</button>
        <button className='btn btn-access' onClick={props.nextStep}>Create</button>
      </div>

    </div>
  )
}


const ServicesStep = props => {
  const [service, setService] = useState(props.service)
  const [loading, setLoading] = useState(false);
  const [newTeam, setNewTeam] = useState(undefined)
  const [selectedTeam, setSelectedTeam] = useState(undefined)
  const [error, setError] = useState({})

  useEffect(() => {
    if (newTeam) {
      setLoading(true);
      Services.fetchNewTeam()
        .then(t => ({ ...t, name: newTeam }))
        .then(t => Services.createTeam(t))
        .then(t => {
          props.addNewTeam(t)
          setSelectedTeam(t._id)
          setNewTeam(undefined)
          setLoading(false)
        })
    }
  }, [newTeam])

  useEffect(() => {
    if (props.testApiName(service.name)) {
      setError({ name: "Une api doit avoir un nom unique" })
    } else {
      setError({})
    }
  }, [service])

  useEffect(() => {
    if (props.isActive) {
      console.debug({ ...props.infos, test: props.infos.index === (props.infos.total - 2)})
    }
    if (props.isActive && props.infos.index === (props.infos.total - 2)) {
      props.loadMoreServices()
    }
  }, [props.isActive])

  const nextStep = () => {
    props.nextStep();
  }

  const getIt = () => {
    props.addService(service, selectedTeam);
    nextStep();
  }


  const teams = props.teams.map(t => ({ label: t.name, value: t._id }))
  return (
    <div className="d-flex flex-row col-12 flex-wrap">
      <div className="col-6">
        <h3>Service {props.infos.index + 1}/{props.infos.total}</h3>
        <div>Otoroshi</div>
        <div>Service: {props.service.name}</div>
        <div>Group: {props.groups.find(g => g.id === props.service.groupId).name}</div>
      </div>
      <div className="col-6">
        <div>Evil-corps</div>
        <div className="d-flex flex-row align-items-center mb-3">
          <div className="col-4">
            <div>Api name</div>
          </div>
          <div className="d-flex flex-column col-8">
            <input
              type="text"
              className={classNames("form-control", { "on-error": !!error.name })}
              value={service.name}
              onChange={e => setService({ ...service, name: e.target.value })} />
            {error.name && <small class="invalid-input-info">{error.name}</small>}
          </div>
        </div>
        <div className="d-flex flex-row align-items-center mb-3">
          <div className="col-4">
            <div>Api team</div>
          </div>
          <Creatable
            className="col-8"
            isClearable
            isDisabled={loading}
            isLoading={loading}
            onChange={slug => setSelectedTeam(slug.value)}
            onCreateOption={setNewTeam}
            options={teams}
            value={teams.find(t => t.value === selectedTeam)}
            placeholder="Selectionner une équipe"
            formatCreateLabel={value => `creer l'équipe ${value}`}
          />
        </div>

      </div>
      {/* todo: real pagination with load more service in the 9th service or no btn skip if the last is display */}
      {/* todo: if previous is click maybe load more apis before it or don't siplay it if this is the first api */}
      <div className="d-flex justify-content-between col-12">
        <div>
          {props.infos.index > 0 && <button className='btn btn-access' onClick={props.previousStep}>Previous</button>}
        </div>
        <div>
          <button className='btn btn-access' onClick={() => nextStep()}>Skip</button>
          <button className='btn btn-access' disabled={!selectedTeam || error.name ? 'disabled' : null} onClick={() => getIt()}>import</button>
        </div>
      </div>
    </div>
  )
}

const WaitingStep = () => {
  return (
    <Spinner />
  )
}
const FinishStep = () => {
  return (
    <div>Thank you</div>
  )
}


const CreationStep = props => {
  useEffect(() => {
    if (props.isActive) {
      props.create();
    }
  }, [props.isActive])
  return (
    <Spinner />
  )
}

const ApiKeyStep = props => {
  const [selectedApi, setSelectedApi] = useState(undefined)
  const [selectedPlan, setSelectedPlan] = useState(undefined)
  const [selectedTeam, setSelectedTeam] = useState(undefined)
  const [newTeam, setNewTeam] = useState(undefined)
  const [newPlan, setNewPlan] = useState(undefined)
  const [loading, setLoading] = useState(false)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [error, setError] = useState({})

  useEffect(() => {
    if (selectedApi) {
      const api = props.apis.find(a => selectedApi._id === a._id)
      setSelectedApi(api)

      if (!!selectedPlan) {
        setSelectedPlan(api.possibleUsagePlans.find(pp => pp._id === selectedPlan._id))
      }
    }
  }, [props.apis])

  useEffect(() => {
    if (newTeam) {
      setLoading(true);
      Services.fetchNewTeam()
        .then(t => ({ ...t, name: newTeam }))
        .then(t => Services.createTeam(t))
        .then(t => {
          props.addNewTeam(t)
          setSelectedTeam(t._id)
          setNewTeam(undefined)
          setLoading(false)
        })
    }
  }, [newTeam])

  //add new plan effect
  useEffect(() => {
    if (newPlan) {
      let plans = _.cloneDeep(selectedApi.possibleUsagePlans);
      const plan = {
        _id: faker.random.alphaNumeric(32),
        type: 'FreeWithQuotas',
        currency: { code: 'EUR' },
        customName: newPlan,
        customDescription: null,
        maxPerSecond: 10,
        maxPerDay: 1000,
        maxPerMonth: 1000,
        billingDuration: {
          value: 1,
          unit: 'month',
        },
        visibility: 'Public',
        subscriptionProcess: 'Automatic',
        integrationProcess: 'ApiKey',
        rotation: false,
        otoroshiTarget: {
          otoroshiSettings: null,
          serviceGroup: null,
          clientIdOnly: false,
          constrainedServicesOnly: false,
          tags: [],
          metadata: {},
          restrictions: {
            enabled: false,
            allowLast: true,
            allowed: [],
            forbidden: [],
            notFound: [],
          },
        },
      };
      plans.push(plan);
      const value = _.cloneDeep(selectedApi);
      value.possibleUsagePlans = plans;

      debugger
      setSelectedPlan(plan)
      Promise.resolve(setLoadingPlan(true))
        .then(() => props.updateApi(value))
        .then(() => {
          setNewPlan(undefined)
          setLoadingPlan(false)
        })
    }
  }, [newPlan])

  //handle error effect
  useEffect(() => {
    if (!selectedPlan) {
      setError({ ...error, plan: "no plan" })
    } else {
      delete error.plan
    }

    if (!selectedApi) {
      setError({ ...error, api: "no api" })
    } else {
      delete error.api
    }

    if (!selectedTeam) {
      setError({ ...error, team: "no team" })
    } else {
      delete error.team
    }
  }, [selectedPlan, selectedApi, selectedTeam])

  const getIt = () => {
    props.addSub(props.apikey, selectedTeam, selectedApi, selectedPlan);
    props.nextStep();
  }

  const apis = props.apis.map(a => ({ label: a.name, value: a }))
  const teams = props.teams.map(t => ({ label: t.name, value: t._id }))
  const possiblePlans = Option(props.apis.find(a => selectedApi && a._id === selectedApi._id))
    .map(a => a.possibleUsagePlans)
    .getOrElse([])
    .map(pp => ({ label: pp.customName || pp.type, value: pp }))

  const maybeGroup = props.groups.find(g => g.id === props.apikey.authorizedGroup)

  return (
    <div className="d-flex flex-row col-12 flex-wrap">
      <div className="col-6">
        <h3>ApiKey {props.infos.index + 1}/{props.infos.total}</h3>
        <div>Otoroshi</div>
        <div>ApiKey: {props.apikey.clientName}</div>
        <div>Group: {Option(maybeGroup).map(g => g.name).getOrElse("Unknown group")}</div>
      </div>
      <div className="col-6">
        <div>Evil-corps</div>
        <div className="d-flex flex-row align-items-center mb-3">
          <div className="col-4">
            <div>Api</div>
          </div>
          <div className="d-flex flex-column col-8">
            <Select
              options={apis}
              onChange={slug => setSelectedApi(slug.value)}
              value={apis.find(a => !!selectedApi && a.value._id === selectedApi._id)}
            />
          </div>
        </div>
        <div className="d-flex flex-row align-items-center mb-3">
          <div className="col-4">
            <div>Plan</div>
          </div>
          <div className="d-flex flex-column col-8">
            <Creatable
              isClearable
              isDisabled={!selectedApi || loadingPlan}
              isLoading={!selectedApi || loadingPlan}
              onChange={slug => !!slug && setSelectedPlan(slug.value)}
              onCreateOption={setNewPlan}
              options={possiblePlans}
              value={possiblePlans.find(a => !!selectedPlan && a.value._id === selectedPlan._id)}
              placeholder="Selectionner un plan"
              formatCreateLabel={value => `creer le plan ${value}`}
            />
          </div>
        </div>
        <div className="d-flex flex-row align-items-center mb-3">
          <div className="col-4">
            <div>Team</div>
          </div>
          <Creatable
            className="col-8"
            isClearable
            isDisabled={loading}
            isLoading={loading}
            onChange={slug => setSelectedTeam(slug.value)}
            onCreateOption={setNewTeam}
            options={teams}
            value={teams.find(t => t.value === selectedTeam)}
            placeholder="Selectionner une équipe"
            formatCreateLabel={value => `creer l'équipe ${value}`}
          />
        </div>

      </div>
      <div className="d-flex justify-content-between col-12">
        <div>
          {props.infos.index > 0 && <button className='btn btn-access' onClick={props.previousStep}>Previous</button>}
        </div>
        <div>
          <button className='btn btn-access' onClick={props.nextStep}>Skip</button>
          <button className='btn btn-access' disabled={!!error && Object.keys(error).length > 0 ? 'disabled' : null} onClick={getIt}>import</button>
        </div>
      </div>
    </div>
  )
}