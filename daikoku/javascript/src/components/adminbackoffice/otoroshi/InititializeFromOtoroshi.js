import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import Select from 'react-select';
import Creatable from 'react-select/creatable';
import StepWizard from 'react-step-wizard';
import classNames from "classnames";
import _ from 'lodash';
import faker from 'faker';

import { UserBackOffice } from '../../backoffice';
import { Can, manage, tenant as TENANT, Spinner, Option } from '../../utils';

import * as Services from '../../../services';
import { setError } from '../../../core';


const InitializeFromOtoroshiComponent = props => {
  const [otoroshis, setOtoroshis] = useState([])
  const [otoroshiInstance, setOtoroshiInstance] = useState(null)
  const [groups, setGroups] = useState([])
  const [services, setServices] = useState([])
  const [apikeys, setApikeys] = useState([])
  const [teams, setTeams] = useState([])
  const [apis, setApis] = useState([])
  const [instance, setInstance] = useState(undefined)

  const [createdApis, setCreatedApis] = useState([])
  const [createdSubs, setCreatedSubs] = useState([])

  const [actualApiCreation, setActualApiCreation] = useState(undefined)
  const [actualSubCreation, setActualSubCreation] = useState(undefined)

  useEffect(() => {
    if (otoroshiInstance) {
      instance.nextStep()
      Promise.all([
        Services.getOtoroshiGroups(props.tenant._id, otoroshiInstance.value),
        Services.getOtoroshiServices(props.tenant._id, otoroshiInstance.value),
        Services.teams(),
        Services.getOtoroshiApiKeys(props.tenant._id, otoroshiInstance.value),
        Services.myVisibleApis()
      ])
        .then(([groups, services, teams, keys, apis]) => {
          setGroups(groups);
          setServices(services)
          setTeams(teams)
          setApikeys(keys)
          setApis(apis)
          instance.nextStep()
        })
    }
  }, [otoroshiInstance])

  useEffect(() => {
    Services.allSimpleOtoroshis(props.tenant._id)
      .then(r => setOtoroshis(r))
  }, [props.tenant])

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
  const createApis = () => {
    createdApis
      .reduce((result, api, index) => {
        const currentApi = { name: api.name, index: index + 1 };

        return result
          .then(() => Promise.resolve(setActualApiCreation(currentApi)))
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
      .then(oldApi => Services.saveTeamApi(api.team, {...oldApi, ...api}))
      .then(updatedApi => {
        const filteredApis = apis.filter(a => a._id !== updatedApi._id)
        setApis([...filteredApis, updatedApi])
      })
  }

  const onStepChange = step => console.debug({ step })

  const servicesSteps = _.orderBy(services, ["groupId", "name"])
    .map((s, idx) => (
      <ServicesStep
        key={`service-${idx}`}
        service={s}
        groups={groups}
        teams={teams}
        testApiName={name => apis.some(a => a.name.toLowerCase() === name.toLowerCase()) || createdApis.some(a => a.name.toLowerCase() === name.toLowerCase())}
        addNewTeam={t => setTeams([...teams, t])}
        addService={(s, team) => setCreatedApis([...createdApis, { ...s, team }])}
        infos={{ index: idx, total: services.length }}
      />
    ))

  const subsSteps = _.orderBy(apikeys, ['authorizedGroup', "clientName"])
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

  return (
    <UserBackOffice tab="Otoroshi">
      <Can I={manage} a={TENANT} dispatchError>
        <div className="col-12 p-3" style={{
          backgroundColor: "lightGray"
        }}>
          <StepWizard
            onStepChange={onStepChange}
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
          </StepWizard>
        </div>
      </Can>
    </UserBackOffice>
  );
}

const mapStateToProps = state => ({
  ...state.context,
});

export const InitializeFromOtoroshi = connect(mapStateToProps)(InitializeFromOtoroshiComponent);


//###############  HELP COMPONENTS 

const SelectionStepStep = props => {

  return (
    <div className="d-flex">
      <button className="btn btn-access" onClick={() => props.nextStep()}>Import Otoroshi Service</button>
      <button className="btn btn-access" onClick={() => props.goToStep(props.subStep)}>Import Otoroshi ApiKeys</button>
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


  const getIt = () => {
    props.addService(service, selectedTeam);
    props.nextStep();
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
          {props.currentStep > 1 && <button className='btn btn-access' onClick={props.previousStep}>Previous</button>}
        </div>
        <div>
          <button className='btn btn-access' onClick={props.nextStep}>Skip</button>
          <button className='btn btn-access' disabled={!selectedTeam || error.name ? 'disabled' : null} onClick={getIt}>import</button>
        </div>
      </div>
    </div>
  )
}

const WaitingStep = props => {
  return (
    <Spinner />
  )
}
const FinishStep = props => {
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

  return (
    <div className="d-flex flex-row col-12 flex-wrap">
      <div className="col-6">
        <h3>ApiKey {props.infos.index + 1}/{props.infos.total}</h3>
        <div>Otoroshi</div>
        <div>ApiKey: {props.apikey.clientName}</div>
        <div>Group: {props.groups.find(g => g.id === props.apikey.authorizedGroup).name}</div>
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
              formatCreateLabel={value => `creer l'équipe ${value}`}
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
          {props.currentStep > 1 && <button className='btn btn-access' onClick={props.previousStep}>Previous</button>}
        </div>
        <div>
          <button className='btn btn-access' onClick={props.nextStep}>Skip</button>
          <button className='btn btn-access' disabled={!!error && Object.keys(error).length > 0 ? 'disabled' : null} onClick={getIt}>import</button>
        </div>
      </div>
    </div>
  )
}