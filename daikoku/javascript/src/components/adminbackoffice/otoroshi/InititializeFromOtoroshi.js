import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import Select from 'react-select';
import Creatable from 'react-select/creatable';
import StepWizard from 'react-step-wizard';
import classNames from "classnames";

import { UserBackOffice } from '../../backoffice';
import { Can, manage, tenant as TENANT, Spinner } from '../../utils';

import * as Services from '../../../services';
import { Tabs } from 'antd';


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
          setApis(apis.map(({_id, name}) => ({_id, name})))
          instance.nextStep()
        })
    }
  }, [otoroshiInstance])

  useEffect(() => {
    Services.allSimpleOtoroshis(props.tenant._id)
      .then(r => setOtoroshis(r))
  }, [props.tenant])

  const createApis = () => {
    new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve(console.debug({ createdApis }));
      }, 1000);
    })
      .then(() => instance.nextStep())
  }

  const onStepChange = step => console.debug({ step })

  const servicesSteps = services.map((s, idx) => (
    <ServicesStep
      key={idx}
      service={s}
      groups={groups}
      teams={teams}
      testApiName={name => apis.some(a => a.name.toLowerCase() === name.toLowerCase()) || createdApis.some(a => a.name.toLowerCase() === name.toLowerCase())}
      addNewTeam={t => setTeams([...teams, t])}
      addService={(s, team) => setCreatedApis([...createdApis, { ...s, team }])} />
  ))

  const subsSteps = apikeys.map((apikey, idx) => {
    <ApiKeyStep
      key={idx}
      apikey={apikey}
      teams={teams}
      apis={createdApis}
      addNewTeam={t => setTeams([...teams, t])}
      addSub={(apikey, team, api) => setCreatedSubs([...createdSubs, { ...s, team, api }])}
    />
  })

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
              ...servicesSteps,
              <EndStep key="end" createdApis={createdApis} groups={groups} teams={teams} />,
              <CreationStep key="creation" createApis={createApis} />,
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
      setError({name: "Une api doit avoir un nom unique"})
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
        <h3>Service 1/23</h3>
        <div>Otoroshi</div>
        <div>Service: {props.service.name}</div>
        <div>Group: {props.groups.find(g => g.id === props.service.groupId).name }</div>
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
          <button className='btn btn-access' onClick={props.nextStep}>Next</button>
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
      props.createApis();
    }
  }, [props.isActive])
  return (
    <Spinner />
  )
}

const ApiKeyStep = props => {
  const [selectedApi, setSelectedApi] = useState(undefined)
  const [selectedTeam, setSelectedTeam] = useState(undefined)

  const apis = props.apis.map(a => ({ label: a.clientName, value: a.clientId }))
  const teams = props.teams.map(t => ({ label: t.name, value: t._id }))
  return (
    <div>
      <h4>{props.apikey.clientName}</h4>
      <Select
        options={apis}
        onChange={slug => setSelectedApi(slug.value)}
        value={apis.find(a => a.value === selectedApi)}
      />
      <Creatable
        isClearable
        isDisabled={loading}
        isLoading={loading}
        onChange={slug => setSelectedTeam(slug.value)}
        onCreateOption={setNewTeam}
        options={teams}
        value={teams.find(t => t.value === selectedTeam)}
      />
    </div>
  )
}