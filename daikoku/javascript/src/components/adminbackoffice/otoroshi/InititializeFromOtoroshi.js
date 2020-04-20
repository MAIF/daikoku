import { useMachine } from "@xstate/react";
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import StepWizard from 'react-step-wizard';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { Can, manage, Spinner, tenant as TENANT, Option } from '../../utils';
import {theMachine, SelectOtoStep, SelectionStepStep, ServicesStep, ApiKeyStep, EndStep, RecapSubsStep} from './initialization';

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
        maybeCreatedApi={Option(createdApis.find(a => a.id === s.id))}
        updateService={(s, team) => setCreatedApis([...createdApis.filter(a => a.id !== s.id), { ...s, team }])}
        resetService={() => setCreatedApis([...createdApis.filter(a => a.id !== s.id)])}
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
        maybeCreatedSub={Option(createdsubs.find(a => a.clienId === s.clientId))}
        updateSub={(apikey, team, api, plan) => setCreatedSubs([...createdSubs.filter(s => s.clientId !== apikey.clientId), { ...apikey, team, api, plan }])}
        resetSub={() => setCreatedApis([...createdSubs.filter(s => s.clientId !== apikey.clientId)])}
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
    <UserBackOffice tab="Initialization">
      <Can I={manage} a={TENANT} dispatchError>
        <div className="col-12 p-3" style={{
          backgroundColor: "lightGray"
        }}>
          {state.value === 'otoroshiSelection' && (
            <SelectOtoStep setOtoInstance={oto => send("LOAD", { otoroshi: oto.value, tenant: props.tenant._id })} otoroshis={otoroshis} />
          )}
          {state.value === 'loadingOtoroshiGroups' && (
            <Spinner />
          )}
          {state.value === 'stepSelection' && (
            <SelectionStepStep goToServices={() => send('LOAD_SERVICE', { up: true })} goToApikeys={() => send('LOAD_APIKEY')} />
          )}
          {state.matches('completeServices') && (
            <StepWizard
              isLazyMount={true}
              transitions={{}}
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
            <div>Thank you</div>
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
