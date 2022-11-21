import { getApolloContext, gql } from '@apollo/client';
import { useMachine } from '@xstate/react';
import orderBy from 'lodash/orderBy';
import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import StepWizard from 'react-step-wizard';
import { useTenantBackOffice } from '../../../contexts';
import { I18nContext } from '../../../core';

import * as Services from '../../../services';
import { isError } from '../../../types';
import { Can, manage, Spinner, tenant as TENANT, Option, BeautifulTitle } from '../../utils';
import {
  theMachine,
  SelectOtoStep,
  SelectionStepStep,
  ServicesStep,
  ApiKeyStep,
  RecapServiceStep,
  RecapSubsStep,
} from './initialization';

export const InitializeFromOtoroshi = () => {
  const tenant = useSelector((s: any) => s.context.tenant);
  useTenantBackOffice();

  const [state, send] = useMachine<any>(theMachine);

  const { Translation, translate } = useContext(I18nContext);

  const [otoroshis, setOtoroshis] = useState<Array<any>>([]);
  const [teams, setTeams] = useState<Array<any>>([]);
  const [apis, setApis] = useState<Array<any>>([]);
  const [step, setStep] = useState<number>(1);

  const [createdApis, setCreatedApis] = useState<Array<any>>([]);
  const [createdSubs, setCreatedSubs] = useState<Array<any>>([]);

  const { client } = useContext(getApolloContext());

  useEffect(() => {
    if (apis.length && state.context.otoroshi && (createdApis.length || createdSubs.length)) {
      localStorage.setItem(
        `daikoku-initialization-${tenant._id}`,
        JSON.stringify({
          otoroshi: state.context.otoroshi,
          tenant: tenant._id,
          step,
          createdApis,
          createdSubs,
        })
      );
    }
  }, [createdApis, createdSubs]);

  useEffect(() => {
    Promise.all([Services.teams(), Services.allSimpleOtoroshis(tenant._id), getVisibleApis()])
      .then(
        ([teams, otoroshis, apis]) => {
          setTeams(teams);
          setOtoroshis(otoroshis);
          setApis(apis);
        }
      );
  }, [tenant]);

  const getVisibleApis = () => {//FIXME:handle client is created
    if (!client) {
      return Promise.resolve([] as Array<any>)
    }
    return client.query({
      query: gql`
          query AllVisibleApis {
            visibleApis {
              api {
                _id
                name
                tenant {
                  id
                }
                team {
                  _id
                }
                currentVersion
                possibleUsagePlans {
                  _id
                  customName
                  type
                }
                _humanReadableId
              }
            }
          }
        `,
    })
      .then(({ data: { visibleApis } }) =>
        visibleApis.map(({ api }: any) => ({
          ...api,
          team: api.team._id,
        }))
      );
  }

  const updateApi = (api: any) => {
    return Services.teamApi(api.team, api._humanReadableId, api.currentVersion)
      .then((oldApi) => {
        if (!isError(oldApi)) {
          return Services.saveTeamApi(api.team, { ...oldApi, ...api }, oldApi.currentVersion)
            .then((updatedApi) => {
              const filteredApis = apis.filter((a) => (a as any)._id !== updatedApi._id);
              setApis([...filteredApis, updatedApi]);
            })
        }
      });
  };

  const orderedServices = orderBy(state.context.services, ['groiupId', 'name']);
  const filterServices = (inputValue: any) => Promise.resolve(orderedServices
    .map(({ name }, index) => ({ label: name, value: index + 1 }))
    .filter((s) => (s.label as any).toLowerCase().includes(inputValue.toLowerCase())));
  const servicesSteps = orderedServices.map((s, idx) => (
    <ServicesStep
      key={`service-${idx}`}
      service={s}
      groups={state.context.groups}
      teams={teams}
      addNewTeam={(t: any) => setTeams([...teams, t])}
      addService={(s: any, team: any) => setCreatedApis([...createdApis, { ...s, team }])}
      infos={{ index: idx, total: state.context.services.length }}
      recap={() => send('RECAP')}
      maybeCreatedApi={Option(createdApis.find((a) => (a as any).id === (s as any).id))}
      updateService={(s: any, team: any) => setCreatedApis([...createdApis.filter((a) => (a as any).id !== s.id), { ...s, team }])}
      resetService={() => setCreatedApis([...createdApis.filter((a) => (a as any).id !== (s as any).id)])}
      getFilteredServices={filterServices}
      tenant={tenant}
      cancel={() => send('CANCEL')} />));

  const orderedApikeys = orderBy(state.context.apikeys, ['clientName']);

  const filterApikeys = (entitie: any) => {
    return orderedApikeys.filter((apikey) => ((apikey as any).authorizedEntities || '').includes(`${entitie.prefix}${entitie.value}`));
  };

  const afterCreation = () => {
    getVisibleApis().then((apis) => {
      setStep(1);
      // setApis(apis);
      setCreatedApis([]);
      toastr.success(translate('Success'), translate('Apis successfully created'));
    });
  };

  const afterSubCreation = () => {
    setStep(1);
    setCreatedSubs([]);
    toastr.success(translate('Success'), translate('Subscriptions successfully created'));
  };

  const loadPreviousState = () => {
    const prevState = JSON.parse(
      localStorage.getItem(`daikoku-initialization-${tenant._id}`) || '{}'
    );
    if (prevState.createdApis.length) {
      setStep(prevState.step);
      setCreatedApis(prevState.createdApis);
      send('LOAD_PREVIOUS_STATE', { otoroshi: prevState.otoroshi, tenant: prevState.tenant, goto: 'services' });
    } else if (prevState.createdSubs.length) {
      setStep(prevState.step);
      setCreatedSubs(prevState.createdSubs);
      send('LOAD_PREVIOUS_STATE', { otoroshi: prevState.otoroshi, tenant: prevState.tenant, goto: 'apikeys' });
    } else {
      toastr.warning(translate('Warning'), translate('Seems to have no saved state...please continue'));
    }
  };

  return (<Can I={manage} a={TENANT} dispatchError>
    <div className="d-flex flex-row align-items-center">
      <h1>
        <Translation i18nkey="Daikoku initialization">Daikoku initialization</Translation>
      </h1>
      {state.matches('completeServices') && <Help />}
    </div>
    <div className="section py-3 px-2">
      {state.value === 'otoroshiSelection' && (
        <SelectOtoStep
          tenant={tenant}
          loadPreviousState={() => loadPreviousState()}
          setOtoInstance={(oto: any) => send('LOAD', { otoroshi: oto.value, tenant: tenant._id })}
          otoroshis={otoroshis} />)}
      {(state.matches('loadingOtoroshiGroups') ||
        state.matches('loadingServices') ||
        state.matches('loadingApikeys')) && <Spinner />}
      {state.value === 'stepSelection' && (<SelectionStepStep goToServices={() => send('LOAD_SERVICE', { up: true })} goToApikeys={() => send('LOAD_APIKEY')} />)}
      {state.matches('completeServices') && (<StepWizard initialStep={step} isLazyMount={true} transitions={{}} onStepChange={(x) => setStep(x.activeStep)}>
        {servicesSteps}
      </StepWizard>)}
      {state.matches('recap') && (<RecapServiceStep cancel={() => send('CANCEL')} createdApis={createdApis} groups={state.context.groups} teams={teams} goBackToServices={() => send('ROLLBACK')} create={() => send('CREATE_APIS', { createdApis, callBackCreation: () => afterCreation() })} />)}
      {state.matches('completeApikeys') && (<>
        <ApiKeyStep otoroshi={state.context.otoroshi} teams={teams} apis={apis} groups={state.context.groups} services={state.context.services} addNewTeam={(t: any) => setTeams([...teams, t])} addSub={(apikey: any, team: any, api: any, plan: any) => setCreatedSubs([...createdSubs, { ...apikey, team, api, plan }])} infos={(idx: any) => ({
          index: idx,
          total: state.context.apikeys.length
        })} updateApi={(api: any) => updateApi(api)} recap={() => send('RECAP')} maybeCreatedSub={(apikey: any) => Option(createdSubs.find((s) => apikey.clientId === (s as any).clientId))} updateSub={(apikey: any, team: any, api: any, plan: any) => setCreatedSubs([
          ...createdSubs.filter((s) => (s as any).clientId !== apikey.clientId),
          { ...apikey, team, api, plan },
        ])} resetSub={(apikey: any) => setCreatedSubs([...createdSubs.filter((s) => (s as any).clientId !== apikey.clientId)])} getFilteredApikeys={filterApikeys} tenant={tenant} cancel={() => send('CANCEL')} createdSubs={createdSubs} />
        {createdSubs.length > 0 && (<RecapSubsStep createdSubs={createdSubs} cancel={() => {
          setCreatedSubs([]);
          send('CANCEL');
        }} apis={apis} teams={teams} goBackToServices={() => send('CANCEL')} create={() => send('CREATE_APIKEYS', {
          createdSubs,
          callBackCreation: () => afterSubCreation(),
        })} />)}
      </>)}
      {state.matches('recapSubs') && (<RecapSubsStep createdSubs={createdSubs} cancel={() => send('CANCEL')} apis={apis} teams={teams} goBackToServices={() => send('ROLLBACK')} create={() => send('CREATE_APIKEYS', { createdSubs, callBackCreation: () => afterSubCreation() })} />)}
      {state.matches('complete') && <Translation i18nkey="Done">Done</Translation>}

      {state.matches('failure') && (<div className="alert alert-danger">{state.context.error.error}</div>)}
    </div>
  </Can>);
};

const Help = () => {
  const { Translation } = useContext(I18nContext);
  return (
    <BeautifulTitle
      place="bottom"
      title={
        <div className="d-flex flex-column">
          <h4>
            <Translation i18nkey="Keyboard shortcuts">Keyboard shortcut</Translation>
          </h4>
          <ul>
            <li>
              <Translation i18nkey="keyboard.shortcuts.arrow.left">
                arrow-left: previous step
              </Translation>
            </li>
            <li>
              <Translation i18nkey="keyboard.shortcuts.arrow.right">
                arrow-right: next step or import
              </Translation>
            </li>
            <li>
              <Translation i18nkey="keyboard.shortcuts.tab">tab: focus on api name</Translation>
            </li>
          </ul>
        </div>
      }
    >
      <i className="ms-4 far fa-question-circle" />
    </BeautifulTitle>
  );
};
