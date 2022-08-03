import { getApolloContext, gql } from '@apollo/client';
import { useMachine } from '@xstate/react';
import orderBy from 'lodash/orderBy';
import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
import StepWizard from 'react-step-wizard';
import { useTenantBackOffice } from '../../../contexts';
import { I18nContext } from '../../../core';

import * as Services from '../../../services';
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
  const tenant = useSelector((s) => (s as any).context.tenant);
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  useTenantBackOffice();

  const [state, send] = useMachine(theMachine);

  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);

  const [otoroshis, setOtoroshis] = useState([]);
  const [teams, setTeams] = useState([]);
  const [apis, setApis] = useState([]);
  const [step, setStep] = useState(1);

  const [createdApis, setCreatedApis] = useState([]);
  const [createdSubs, setCreatedSubs] = useState([]);

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
    Promise.all([Services.teams(), Services.allSimpleOtoroshis(tenant._id), getVisibleApis()]).then(
      ([teams, otoroshis, apis]) => {
        setTeams(teams);
        setOtoroshis(otoroshis);
        setApis(apis);
      }
    );
  }, [tenant]);

  const getVisibleApis = () =>
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    client
      .query({
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
        visibleApis.map(({
          api
        }: any) => ({
          ...api,
          team: api.team._id,
        }))
      );

  const updateApi = (api: any) => {
    return Services.teamApi(api.team, api._humanReadableId, api.currentVersion)
      .then((oldApi) =>
        Services.saveTeamApi(api.team, { ...oldApi, ...api }, oldApi.currentVersion)
      )
      .then((updatedApi) => {
        const filteredApis = apis.filter((a) => (a as any)._id !== updatedApi._id);
        // @ts-expect-error TS(2322): Type 'any' is not assignable to type 'never'.
        setApis([...filteredApis, updatedApi]);
      });
  };

  const orderedServices = orderBy(state.context.services, ['groiupId', 'name']);
  const filterServices = (inputValue: any) => Promise.resolve(orderedServices
    .map(({ name }, index) => ({ label: name, value: index + 1 }))
    .filter((s) => (s.label as any).toLowerCase().includes(inputValue.toLowerCase())));
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  const servicesSteps = orderedServices.map((s, idx) => (<ServicesStep key={`service-${idx}`} service={s} groups={state.context.groups} teams={teams} addNewTeam={(t: any) => setTeams([...teams, t])} addService={(s: any, team: any) => setCreatedApis([...createdApis, { ...s, team }])} infos={{ index: idx, total: state.context.services.length }} recap={() => send('RECAP')} maybeCreatedApi={Option(createdApis.find((a) => (a as any).id === (s as any).id))} updateService={(s: any, team: any) => setCreatedApis([...createdApis.filter((a) => (a as any).id !== s.id), { ...s, team }])} resetService={() => setCreatedApis([...createdApis.filter((a) => (a as any).id !== (s as any).id)])} getFilteredServices={filterServices} tenant={tenant} cancel={() => send('CANCEL')}/>));

  const orderedApikeys = orderBy(state.context.apikeys, ['clientName']);

  const filterApikeys = (entitie: any) => {
    return orderedApikeys.filter((apikey) => ((apikey as any).authorizedEntities || '').includes(`${entitie.prefix}${entitie.value}`));
  };

  const afterCreation = () => {
    getVisibleApis().then((apis) => {
      setStep(1);
      // setApis(apis);
      setCreatedApis([]);
      toastr.success('Apis successfully created');
    });
  };

  const afterSubCreation = () => {
    setStep(1);
    setCreatedSubs([]);
    toastr.success('Subscriptions successfully created');
  };

  const loadPreviousState = () => {
    const { otoroshi, tenant, step, createdApis, createdSubs } = JSON.parse(
      // @ts-expect-error TS(2345): Argument of type 'string | null' is not assignable... Remove this comment to see the full error message
      localStorage.getItem(`daikoku-initialization-${tenant._id}`)
    );
    if (createdApis.length) {
      setStep(step);
      setCreatedApis(createdApis);
      send('LOAD_PREVIOUS_STATE', { otoroshi, tenant, goto: 'services' });
    } else if (createdSubs.length) {
      setStep(step);
      setCreatedSubs(createdSubs);
      send('LOAD_PREVIOUS_STATE', { otoroshi, tenant, goto: 'apikeys' });
    } else {
      toastr.warning('Seems to have no saved state...please continue');
    }
  };

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<Can I={manage} a={TENANT} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex flex-row align-items-center">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h1>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Daikoku initialization">Daikoku initialization</Translation>
        </h1>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {state.matches('completeServices') && <Help />}
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="section py-3 px-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {state.value === 'otoroshiSelection' && (<SelectOtoStep tenant={tenant} loadPreviousState={(previousState: any) => loadPreviousState(previousState)} setOtoInstance={(oto: any) => send('LOAD', { otoroshi: oto.value, tenant: tenant._id })} otoroshis={otoroshis}/>)}
        {(state.matches('loadingOtoroshiGroups') ||
        state.matches('loadingServices') ||
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        state.matches('loadingApikeys')) && <Spinner />}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {state.value === 'stepSelection' && (<SelectionStepStep goToServices={() => send('LOAD_SERVICE', { up: true })} goToApikeys={() => send('LOAD_APIKEY')}/>)}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {state.matches('completeServices') && (<StepWizard initialStep={step} isLazyMount={true} transitions={{}} onStepChange={(x) => setStep(x.activeStep)}>
            {servicesSteps}
          </StepWizard>)}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {state.matches('recap') && (<RecapServiceStep cancel={() => send('CANCEL')} createdApis={createdApis} groups={state.context.groups} teams={teams} goBackToServices={() => send('ROLLBACK')} create={() => send('CREATE_APIS', { createdApis, callBackCreation: () => afterCreation() })}/>)}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {state.matches('completeApikeys') && (<>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ApiKeyStep otoroshi={state.context.otoroshi} teams={teams} apis={apis} groups={state.context.groups} services={state.context.services} addNewTeam={(t: any) => setTeams([...teams, t])} addSub={(apikey: any, team: any, api: any, plan: any) => setCreatedSubs([...createdSubs, { ...apikey, team, api, plan }])} infos={(idx: any) => ({
            index: idx,
            total: state.context.apikeys.length
        })} updateApi={(api: any) => updateApi(api)} recap={() => send('RECAP')} maybeCreatedSub={(apikey: any) => Option(createdSubs.find((s) => apikey.clientId === (s as any).clientId))} updateSub={(apikey: any, team: any, api: any, plan: any) => setCreatedSubs([
            // @ts-expect-error TS(2322): Type 'any' is not assignable to type 'never'.
            ...createdSubs.filter((s) => (s as any).clientId !== apikey.clientId),
            // @ts-expect-error TS(2322): Type 'any' is not assignable to type 'never'.
            { ...apikey, team, api, plan },
        ])} resetSub={(apikey: any) => setCreatedSubs([...createdSubs.filter((s) => (s as any).clientId !== apikey.clientId)])} getFilteredApikeys={filterApikeys} tenant={tenant} cancel={() => send('CANCEL')} createdSubs={createdSubs}/>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {createdSubs.length > 0 && (<RecapSubsStep createdSubs={createdSubs} cancel={() => {
                setCreatedSubs([]);
                send('CANCEL');
            }} apis={apis} teams={teams} goBackToServices={() => send('CANCEL')} create={() => send('CREATE_APIKEYS', {
                createdSubs,
                callBackCreation: () => afterSubCreation(),
            })}/>)}
          </>)}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {state.matches('recapSubs') && (<RecapSubsStep createdSubs={createdSubs} cancel={() => send('CANCEL')} apis={apis} teams={teams} goBackToServices={() => send('ROLLBACK')} create={() => send('CREATE_APIKEYS', { createdSubs, callBackCreation: () => afterSubCreation() })}/>)}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {state.matches('complete') && <Translation i18nkey="Done">Done</Translation>}

        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {state.matches('failure') && (<div className="alert alert-danger">{state.context.error.error}</div>)}
      </div>
    </Can>);
};

const Help = () => {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <BeautifulTitle
      place="bottom"
      title={
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="d-flex flex-column">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h4>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Keyboard shortcuts">Keyboard shortcut</Translation>
          </h4>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ul>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <li>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="keyboard.shortcuts.arrow.left">
                arrow-left: previous step
              </Translation>
            </li>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <li>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="keyboard.shortcuts.arrow.right">
                arrow-right: next step or import
              </Translation>
            </li>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <li>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="keyboard.shortcuts.tab">tab: focus on api name</Translation>
            </li>
          </ul>
        </div>
      }
    >
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <i className="ms-4 far fa-question-circle" />
    </BeautifulTitle>
  );
};
