import { useMachine } from "@xstate/react";
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import toastr from 'react-redux-toastr';
import StepWizard from 'react-step-wizard';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { Can, manage, Spinner, tenant as TENANT, Option } from '../../utils';
import {theMachine, SelectOtoStep, SelectionStepStep, ServicesStep, ApiKeyStep, RecapServiceStep, RecapSubsStep} from './initialization';
import {Translation} from '../../../locales'

const InitializeFromOtoroshiComponent = props => {
  const [state, send] = useMachine(theMachine)

  const [otoroshis, setOtoroshis] = useState([])
  const [teams, setTeams] = useState([])
  const [apis, setApis] = useState([])
  const [step, setStep] = useState(1)

  const [createdApis, setCreatedApis] = useState([])
  const [createdSubs, setCreatedSubs] = useState([])

  useEffect(() => {
    if (apis.length && state.context.otoroshi) {
      localStorage.setItem(`daikoku-initialization-${props.tenant._id}`, JSON.stringify({ otoroshi: state.context.otoroshi, tenant: props.tenant._id, step, createdApis, createdSubs}));
    }
  }, [createdApis, createdSubs])

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

  const updateApi = api => {
    return Services.teamApi(api.team, api._id)
      .then(oldApi => Services.saveTeamApi(api.team, { ...oldApi, ...api }))
      .then(updatedApi => {
        const filteredApis = apis.filter(a => a._id !== updatedApi._id)
        setApis([...filteredApis, updatedApi])
      })
  }

  const orderedServices = _.orderBy(state.context.services, ['groiupId', 'name']);
  const filterServices = inputValue => Promise.resolve(orderedServices
      .map(({ name }, index) => ({ label: name, value: index + 1 }))
      .filter(s => s.label.toLowerCase().includes(inputValue.toLowerCase())));
  const servicesSteps = orderedServices
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
        maybeCreatedApi={Option(createdApis.find(a => a.id === s.id))}
        updateService={(s, team) => setCreatedApis([...createdApis.filter(a => a.id !== s.id), { ...s, team }])}
        resetService={() => setCreatedApis([...createdApis.filter(a => a.id !== s.id)])}
        getFilteredServices={filterServices}
        currentLanguage={props.currentLanguage}
        tenant={props.tenant}
      />
    ))

  const orderedApikeys = _.orderBy(state.context.apikeys, ['authorizedGroup', "clientName"]);
  const filterApikeys = inputValue => Promise.resolve(orderedApikeys
    .map(({ clientName }, index) => ({ label: clientName, value: index + 1 }))
    .filter(s => s.label.toLowerCase().includes(inputValue.toLowerCase())));
  const subsSteps = orderedApikeys
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
        maybeCreatedSub={Option(createdSubs.find(s => apikey.clientId === s.clientId))}
        updateSub={(apikey, team, api, plan) => setCreatedSubs([...createdSubs.filter(s => s.clientId !== apikey.clientId), { ...apikey, team, api, plan }])}
        resetSub={() => setCreatedApis([...createdSubs.filter(s => s.clientId !== apikey.clientId)])}
        getFilteredApikeys={filterApikeys}
        currentLanguage={props.currentLanguage}
        tenant={props.tenant}
      />
    ))

  const afterCreation = () => {
    Services.myVisibleApis()
      .then(apis => {
        setStep(1)
        setApis(apis)
      })
  }


  const loadPreviousState = () => {
    const { otoroshi, tenant, step, createdApis, createdSubs } = JSON.parse(localStorage.getItem(`daikoku-initialization-${props.tenant._id}`));
    if (createdApis.length) {
      setStep(step)
      setCreatedApis(createdApis)
      send("LOAD_PREVIOUS_STATE", { otoroshi, tenant, goto: 'services'})
    } else if (createdSubs.length) {
      setStep(step)
      setCreatedSubs(createdSubs)
      send("LOAD_PREVIOUS_STATE", { otoroshi, tenant, goto: 'apikeys' })
    } else {
      toastr.warning("Seems to have no saved state...please continue")
    }
  }

  return (
    <UserBackOffice tab="Initialization">
      <Can I={manage} a={TENANT} dispatchError>
        <div className="col-12 p-3" style={{
          backgroundColor: "lightGray"
        }}>
          {state.value === 'otoroshiSelection' && (
            <SelectOtoStep 
              tenant={props.tenant}
              loadPreviousState={previousState => loadPreviousState(previousState)}
              setOtoInstance={oto => send("LOAD", { otoroshi: oto.value, tenant: props.tenant._id })} 
              otoroshis={otoroshis} 
              currentLanguage={props.currentLanguage}/>
          )}
          {(state.matches('loadingOtoroshiGroups') || state.matches('loadingServices') || state.matches('loadingApikeys')) && (
            <Spinner />
          )}
          {state.value === 'stepSelection' && (
            <SelectionStepStep
              currentLanguage={props.currentLanguage} 
              goToServices={() => send('LOAD_SERVICE', { up: true })} 
              goToApikeys={() => send('LOAD_APIKEY')} />
          )}
          {state.matches('completeServices') && (
            <StepWizard
              initialStep={step}
              isLazyMount={true}
              transitions={{}}
              onStepChange={x => setStep(x.activeStep)}>
              {servicesSteps}
            </StepWizard>
          )}
          {state.matches('recap') && (
            <RecapServiceStep
              currentLanguage={props.currentLanguage}
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
              create={() => send('CREATE_APIKEYS', { createdSubs })}
              currentLanguage={props.currentLanguage} />
          )}
          {state.matches('complete') && (
            <Translation i18nkey="Done" language={props.currentLanguage}>
              Done
            </Translation>
          )}

          {state.matches('failure') && (
            <div className="alert alert-danger">
              {state.context.error.error}
            </div>
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
