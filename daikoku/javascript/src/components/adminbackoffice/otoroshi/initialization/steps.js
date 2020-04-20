import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import Creatable from 'react-select/creatable';
import AsyncSelect from 'react-select/async';
import classNames from "classnames";
import _ from 'lodash';

import { Option } from '../../../utils';
import * as Services from '../../../../services';
import { newPossibleUsagePlan } from '../../../utils';

export const SelectionStepStep = props => {

  return (
    <div className="d-flex">
      <button className="btn btn-access" onClick={() => props.goToServices()}>Import Otoroshi Service</button>
      <button className="btn btn-access" onClick={() => props.goToApikeys()}>Import Otoroshi ApiKeys</button>
    </div>
  )
}

export const SelectOtoStep = props => {
  const [otoInstance, setOtoInstance] = useState(undefined)

  useEffect(() => {
    if (otoInstance) {
      props.setOtoInstance(otoInstance)
    }
  }, [otoInstance])

  return (
    <div>
      <Select
        placeholder="select an Otoroshi instance"
        className="add-member-select mr-2 reactSelect"
        isDisabled={!props.otoroshis.length}
        isLoading={!props.otoroshis.length}
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

export const EndStep = props => {
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

export const RecapSubsStep = props => {
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

export const ServicesStep = props => {
  const [service, setService] = useState(props.service)
  const [loading, setLoading] = useState(false);
  const [newTeam, setNewTeam] = useState()
  const [selectedTeam, setSelectedTeam] = useState(props.maybeCreatedApi.map(api => api.team).getOrNull())
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

  const update = () => {
    props.updateService(service, selectedTeam)
    nextStep();
  }

  const reset = () => {
    props.resetService();
  }


  const teams = props.teams.map(t => ({ label: t.name, value: t._id }))
  return (
    <div className="d-flex flex-row col-12 flex-wrap">
      <div className="d-flex flew-row justify-content-between col-12 ">
        <div className="d-flex flex-row justify-content-start flex-grow">
          <h3>Service {props.infos.index + 1}/{props.infos.total}</h3>
          <AsyncSelect
            cacheOptions
            defaultOptions
            placeholder="go to specific step"
            className="add-member-select reactSelect ml-2"
            loadOptions={props.getFilteredServices}
            onChange={({value}) => props.goToStep(value)}
            classNamePrefix="reactSelect"
          />
        </div>
        <btn className="btn btn-access" onClick={() => props.goToStep(props.totalSteps)}>
          Last 
          <i className="fas fa-fast-forward ml-1" />
        </btn>
      </div>
      <div className="col-6">
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
              value={props.maybeCreatedApi.map(a => a.name).getOrElse(service.name)}
              onChange={e => setService({ ...service, name: e.target.value })} />
            {error.name && <small className="invalid-input-info">{error.name}</small>}
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
          {props.maybeCreatedApi.isDefined && <button className='btn btn-danger' onClick={reset}>Reset</button>}
          <button className='btn btn-access' onClick={nextStep}>Skip</button>
          {props.maybeCreatedApi.isDefined && <button className='btn btn-access' disabled={!selectedTeam || error.name ? 'disabled' : null} onClick={update}>Update</button>}
          {!props.maybeCreatedApi.isDefined && <button className='btn btn-access' disabled={!selectedTeam || error.name ? 'disabled' : null} onClick={getIt}>import</button>}
        </div>
      </div>
    </div>
  )
}

export const ApiKeyStep = props => {
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
      const plan = newPossibleUsagePlan(newPlan);
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
    setError({ plan: !!selectedPlan, api: !!selectedApi, team: !!selectedTeam })
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

  const update = () => {
    props.updateSub(props.apikey, selectedTeam, selectedApi, selectedPlan);
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
      <div className="d-flex flew-row justify-content-between col-12 ">
        <div className="d-flex flex-row justify-content-start flex-grow">
          <h3>ApiKey {props.infos.index + 1}/{props.infos.total}</h3>
          <AsyncSelect
            cacheOptions
            defaultOptions
            placeholder="go to specific apikey"
            className="add-member-select reactSelect ml-2"
            loadOptions={props.getFilteredApikeys}
            onChange={({ value }) => props.goToStep(value)}
            classNamePrefix="reactSelect"
          />
        </div>
        <btn className="btn btn-access" onClick={() => props.goToStep(props.totalSteps)}>
          Last
          <i className="fas fa-fast-forward ml-1" />
        </btn>
      </div>
      <div className="col-6">
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
          {props.maybeCreatedSub.isDefined && <button className='btn btn-danger' onClick={props.resetSub}>Reset</button>}
          <button className='btn btn-access' onClick={nextStep}>Skip</button>
          {props.maybeCreatedSub.isDefined && <button className='btn btn-access' disabled={Object.entries(error).some(([_key, value]) => !value) ? 'disabled' : null} onClick={update}>Update</button>}
          {!props.maybeCreatedSub.isDefined && <button className='btn btn-access' disabled={Object.entries(error).some(([_key, value]) => !value) ? 'disabled' : null} onClick={getIt}>import</button>}
        </div>
      </div>
    </div>
  )
}