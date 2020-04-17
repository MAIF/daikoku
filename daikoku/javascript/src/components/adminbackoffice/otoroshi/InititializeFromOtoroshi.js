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
const newPlanEntity = () => ({
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
});

const theMachine = Machine({
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


const InitializeFromOtoroshiComponent = props => {
  const [state, send] = useMachine(theMachine)

  const [otoroshis, setOtoroshis] = useState([])
  const [teams, setTeams] = useState([])
  const [apis, setApis] = useState([])
  const [step, setStep] = useState(1)
  const [instance, setInstance] = useState(undefined)

  const [createdApis, setCreatedApis] = useState([])
  const [createdSubs, setCreatedSubs] = useState([])

  useEffect(() => {
    Promise.all([
      Services.teams(),
      Services.allSimpleOtoroshis(props.tenant._id),
      Services.myVisibleApis()
    ])
      .then(([teams, otoroshis, apis]) => {
        setTeams(teams)
        setOtoroshis(otoroshis)
        setApis(apis)
      })
  }, [props.tenant])

  useEffect(() => {
    if (instance && (state.matches('completeServices') || state.matches('completeApikeys'))) {
      instance.goToStep(step)
    }
  }, [state.value])

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
        infos={{ index: idx, total: state.context.services.length }}
        recap={() => send('RECAP')}
      />
    ))

  const subsSteps = _.orderBy(state.context.apikeys, ['authorizedGroup', "clientName"])
    .map((apikey, idx) => (
      <ApiKeyStep
        key={`sub-${idx}`}
        apikey={apikey}
        teams={teams}
        apis={apis}
        groups={state.context.groups}
        addNewTeam={t => setTeams([...teams, t])}
        addSub={(apikey, team, api, plan) => setCreatedSubs([...createdSubs, { ...apikey, team, api, plan }])}
        infos={{ index: idx, total: state.context.apikeys.length }}
        updateApi={api => updateApi(api)}
        recap={() => send('RECAP')}
      />
    ))

  const afterCreation = () => {
    Services.myVisibleApis()
      .then(apis => {
        setStep(1)
        setApis(apis)
      })
  }

  return (
    <UserBackOffice tab="Otoroshi">
      <Can I={manage} a={TENANT} dispatchError>
        <div className="col-12 p-3" style={{
          backgroundColor: "lightGray"
        }}>
          {state.value === 'otoroshiSelection' && (
            <SelectOtoStep setOtoInstance={oto => send("LOAD", { otoroshi: oto.value, tenant: props.tenant._id })} otoroshis={otoroshis} />
          )}
          {state.value === 'loadingOtoroshiGroups' && (
            <WaitingStep />
          )}
          {state.value === 'stepSelection' && (
            <SelectionStepStep goToServices={() => send('LOAD_SERVICE', { up: true })} goToApikeys={() => send('LOAD_APIKEY')} />
          )}
          {state.matches('completeServices') && (
            <StepWizard
              isLazyMount={true}
              transitions={{}}
              initialStep={step}
              instance={i => setInstance(i)}
              onStepChange={x => setStep(x.activeStep)}>
              {servicesSteps}
            </StepWizard>
          )}
          {state.matches('recap') && (
            <EndStep
              createdApis={createdApis}
              groups={state.context.groups}
              teams={teams}
              goBackToServices={() => send('ROLLBACK')}
              create={() => send('CREATE_APIS', { createdApis, callBackCreation: () => afterCreation() })} />
          )}
          {state.matches('completeApikeys') && (
            <StepWizard
              isLazyMount={true}
              transitions={{}}
              initialStep={step}
              instance={i => setInstance(i)}
              onStepChange={x => setStep(x.activeStep)}>
              {subsSteps}
            </StepWizard>
          )}
          {state.matches('recapSubs') && (
            <RecapSubsStep
              createdSubs={createdSubs}
              apis={apis}
              teams={teams}
              goBackToServices={() => send('ROLLBACK')}
              create={() => send('CREATE_APIKEYS', { createdSubs })} />
          )}
          {state.matches('complete') && (
            <FinishStep />
          )}
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
        <button className='btn btn-access' onClick={() => props.goBackToServices()}>Go Back</button>
        <button className='btn btn-access' onClick={() => props.create()}>Create</button>
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
        <button className='btn btn-access' onClick={props.goBackToServices}>Go Back</button>
        <button className='btn btn-access' onClick={props.create}>Create</button>
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

  const nextStep = () => {
    if (props.currentStep === props.totalSteps) {
      props.recap()
    } else {
      props.nextStep();
    }
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

const ApiKeyStep = props => {
  const [selectedApi, setSelectedApi] = useState(undefined)
  const [selectedPlan, setSelectedPlan] = useState(undefined)
  const [selectedTeam, setSelectedTeam] = useState(undefined)
  const [newTeam, setNewTeam] = useState(undefined)
  const [newPlan, setNewPlan] = useState(undefined)
  const [loading, setLoading] = useState(false)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [error, setError] = useState({ plan: false, api: false, team: false })

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
      const plan = newPlanEntity();
      plans.push(plan);
      const value = _.cloneDeep(selectedApi);
      value.possibleUsagePlans = plans;

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
    setError({plan: !!selectedPlan, api: !!selectedApi, team: !!selectedTeam})
  }, [selectedPlan, selectedApi, selectedTeam])

  const nextStep = () => {
    if (props.currentStep === props.totalSteps) {
      props.recap()
    } else {
      props.nextStep();
    }
  }

  const getIt = () => {
    props.addSub(props.apikey, selectedTeam, selectedApi, selectedPlan);
    nextStep();
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
          <button className='btn btn-access' onClick={nextStep}>Skip</button>
          <button className='btn btn-access' disabled={Object.entries(error).some(([_key, value]) => !value) ? 'disabled' : null} onClick={getIt}>import</button>
        </div>
      </div>
    </div>
  )
}