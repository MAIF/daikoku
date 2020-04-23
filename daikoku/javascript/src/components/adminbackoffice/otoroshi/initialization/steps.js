import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import Creatable from 'react-select/creatable';
import AsyncSelect from 'react-select/async';
import classNames from "classnames";
import _ from 'lodash';

import { Option } from '../../../utils';
import * as Services from '../../../../services';
import { newPossibleUsagePlan } from '../../../utils';
import { t, Translation } from '../../../../locales';

export const SelectionStepStep = props => {

  return (
    <div className="d-flex">
      <button className="btn btn-access" onClick={() => props.goToServices()}>
        <Translation i18nkey="Import Otoroshi services" language={props.currentLanguage}>
          Import Otoroshi Services
        </Translation>
      </button>
      <button className="btn btn-access" onClick={() => props.goToApikeys()}>
        <Translation i18nkey="Import Otoroshi apikeys" language={props.currentLanguage}>
          Import Otoroshi Apikeys
        </Translation>
      </button>
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

  const previousState = JSON.parse(localStorage.getItem(`daikoku-initialization-${props.tenant._id}`));
  return (
    <div className="d-flex flex-row align-items-center justify-content-around">
      <Select
        placeholder={t("Select an Otoroshi instance", props.currentLanguage)}
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
      {!!previousState && previousState.tenant === props.tenant._id && (
        <div>
          <button className="btn btn-access d-flex flex-column" onClick={props.loadPreviousState}>
            <i className="fa fa-download" />
            <span>Load previous state</span>
          </button>
        </div>
      )}
    </div>
  )
}

export const RecapServiceStep = props => {
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
        <button className='btn btn-access' onClick={() => props.goBackToServices()}>
          <Translation i18nkey="Back" language={props.currentLanguage}>
            Back
          </Translation>
        </button>
        <button className='btn btn-access' onClick={() => props.create()}>
          <Translation i18nkey="Create apis" language={props.currentLanguage}>
            Create APIs
          </Translation>
        </button>
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
        <button className='btn btn-access' onClick={() => props.goBackToServices()}>
          <Translation i18nkey="Back" language={props.currentLanguage}>
            Back
          </Translation>
        </button>
        <button className='btn btn-access' onClick={() => props.create()}>
          <Translation i18nkey="Create apis" language={props.currentLanguage}>
            Create APIs
          </Translation>
        </button>
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
      setError({ name: t("api.unique.name.error", props.currentLanguage, false, "Api name must be unique") })
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
          <h3>
            <Translation i18nkey="init.services.title" language={props.currentLanguage} replacements={[props.infos.index + 1, props.infos.total]}>
              Service {props.infos.index + 1}/{props.infos.total}
            </Translation>
          </h3>
          <AsyncSelect
            cacheOptions
            defaultOptions
            placeholder={t("Jump to specific service", props.currentLanguage)}
            className="add-member-select reactSelect ml-2"
            loadOptions={props.getFilteredServices}
            onChange={({ value }) => props.goToStep(value)}
            classNamePrefix="reactSelect"
          />
        </div>
      </div>
      <div className="col-6">
        <div>
          <Translation i18nkey="Otoroshi" language={props.currentLanguage}>
            Otoroshi
          </Translation>
        </div>
        <div>
          <Translation i18nkey="Service" language={props.currentLanguage}>Service</Translation>: {props.service.name}
        </div>
        <div>
          <Translation i18nkey="Service group" language={props.currentLanguage}>Service group</Translation>: {props.groups.find(g => g.id === props.service.groupId).name}</div>
      </div>
      <div className="col-6">
        <div>{props.tenant.name}</div>
        <div className="d-flex flex-row align-items-center mb-3">
          <div className="col-4">
            <div>
              <Translation i18nkey="Api name" language={props.currentLanguage}>Api name</Translation>
            </div>
          </div>
          <div className="d-flex flex-column col-8">
            <input
              type="text"
              autoFocus
              className={classNames("form-control", { "on-error": !!error.name })}
              value={props.maybeCreatedApi.map(a => a.name).getOrElse(service.name)}
              onChange={e => setService({ ...service, name: e.target.value })} />
            {error.name && <small className="invalid-input-info">{error.name}</small>}
          </div>
        </div>
        <div className="d-flex flex-row align-items-center mb-3">
          <div className="col-4">
            <div>
              <Translation i18nkey="Api team" language={props.currentLanguage}>Api team</Translation>
            </div>
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
            placeholder={t("Select a team", props.currentLanguage)}
            formatCreateLabel={value => t('create.team.label', props.currentLanguage, false, `creer l'équipe ${value}`, value)}
          />
        </div>

      </div>
      <div className="d-flex justify-content-between col-12">
        <div>
          <button className='btn btn-access' disabled={props.currentStep === 1 ? 'disabled' : null} onClick={() => props.goToStep(1)}>
            <i className="fas fa-angle-double-left" />
          </button>
          <button className="btn btn-access" disabled={props.currentStep === 1 ? 'disabled' : null}  onClick={props.previousStep}>
            <i className="fas fa-angle-left" />
          </button>
        </div>

        <div className="flex-grow">
          {props.maybeCreatedApi.isDefined && 
            <button className='btn btn-danger' onClick={reset}>
              <Translation i18nkey="Reset" language={props.currentLanguage}>Reset</Translation>  
            </button>}
          {props.maybeCreatedApi.isDefined && 
            <button className='btn btn-access' disabled={!selectedTeam || error.name ? 'disabled' : null} onClick={update}>
              <Translation i18nkey="Update" language={props.currentLanguage}>Update</Translation>
            </button>}
          {!props.maybeCreatedApi.isDefined && 
            <button className='btn btn-access' disabled={!selectedTeam || error.name ? 'disabled' : null} onClick={getIt}>
              <Translation i18nkey="Import" language={props.currentLanguage}>Import</Translation>
            </button>}
        </div>

        <div>
          <button className='btn btn-access' onClick={nextStep}>
            <i className="fas fa-angle-right" />
          </button>
          <button className="btn btn-access" disabled={props.currentStep === props.totalSteps ? 'disabled' : null} onClick={() => props.goToStep(props.totalSteps)}>
            <i className="fas fa-angle-double-right" />
          </button>
        </div>
      </div>
    </div>
  )
}

export const ApiKeyStep = props => {
  const [selectedApi, setSelectedApi] = useState(props.maybeCreatedSub.map(sub => sub.api).getOrNull())
  const [selectedPlan, setSelectedPlan] = useState(props.maybeCreatedSub.map(sub => sub.plan).getOrNull())
  const [selectedTeam, setSelectedTeam] = useState(props.maybeCreatedSub.map(sub => sub.team).getOrNull())
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
            placeholder={t("Jump to specific apikey", props.currentLanguage)}
            className="add-member-select reactSelect ml-2"
            loadOptions={props.getFilteredApikeys}
            onChange={({ value }) => props.goToStep(value)}
            classNamePrefix="reactSelect"
          />
        </div>
      </div>
      <div className="col-6">
        <Translation i18nkey="Otoroshi" language={props.currentLanguage}>
          Otoroshi
        </Translation>
        <div>
          <Translation i18nkey="API key" language={props.currentLanguage}>
            API key
          </Translation>: {props.apikey.clientName}</div>
        <div>
          <Translation i18nkey="Service group" language={props.currentLanguage}>
            Service group
          </Translation>: {Option(maybeGroup).map(g => g.name).getOrElse("???")}</div>
      </div>
      <div className="col-6">
        <div>{props.tenant.name}</div>
        <div className="d-flex flex-row align-items-center mb-3">
          <div className="col-4">
            <div>
              <Translation i18nkey="API" language={props.currentLanguage}>
                API
              </Translation>
            </div>
          </div>
          <div className="d-flex flex-column col-8">
            <Select
              options={apis}
              onChange={slug => setSelectedApi(slug.value)}
              value={apis.find(a => !!selectedApi && a.value._id === selectedApi._id)}
              placeholder={t("Select an API", props.currentLanguage)}
            />
          </div>
        </div>
        <div className="d-flex flex-row align-items-center mb-3">
          <div className="col-4">
            <div>
              <Translation i18nkey="Plan" language={props.currentLanguage}>
                Plan
              </Translation>
            </div>
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
              placeholder={t("Select a plan", props.currentLanguage)}
              formatCreateLabel={value => t('create.plan.label', props.currentLanguage, false, `Create plan ${value}`, value)}
            />
          </div>
        </div>
        <div className="d-flex flex-row align-items-center mb-3">
          <div className="col-4">
            <div>
              <Translation i18nkey="Team" language={props.currentLanguage}>
                Team
              </Translation>
            </div>
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
            placeholder={t("Select a team", props.currentLanguage)}
            formatCreateLabel={value => t('create.team.label', props.currentLanguage, false, `creer l'équipe ${value}`, value)}
          />
        </div>

      </div>
      <div className="d-flex justify-content-between col-12">
        <div>
          <button className='btn btn-access' disabled={props.currentStep === 1 ? 'disabled' : null} onClick={() => props.goToStep(1)}>
            <i className="fas fa-angle-double-left" />
          </button>
          <button className="btn btn-access" disabled={props.currentStep === 1 ? 'disabled' : null} onClick={props.previousStep}>
            <i className="fas fa-angle-left" />
          </button>
        </div>

        <div className="flex-grow">
          {props.maybeCreatedSub.isDefined &&
            <button className='btn btn-danger' onClick={props.resetSub}>
              <Translation i18nkey="Reset" language={props.currentLanguage}>Reset</Translation>
            </button>}
          {props.maybeCreatedSub.isDefined &&
            <button className='btn btn-access' disabled={!selectedTeam || error.name ? 'disabled' : null} onClick={update}>
              <Translation i18nkey="Update" language={props.currentLanguage}>Update</Translation>
            </button>}
          {!props.maybeCreatedSub.isDefined &&
            <button className='btn btn-access' disabled={!selectedTeam || error.name ? 'disabled' : null} onClick={getIt}>
              <Translation i18nkey="Import" language={props.currentLanguage}>Import</Translation>
            </button>}
        </div>

        <div>
          <button className='btn btn-access' onClick={nextStep}>
            <i className="fas fa-angle-right" />
          </button>
          <button className="btn btn-access" disabled={props.currentStep === props.totalSteps ? 'disabled' : null} onClick={() => props.goToStep(props.totalSteps)}>
            <i className="fas fa-angle-double-right" />
          </button>
        </div>
      </div>
    </div>
  )
}