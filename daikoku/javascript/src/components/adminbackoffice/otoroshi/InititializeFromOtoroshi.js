import { getApolloContext, gql } from '@apollo/client';
import { useMachine } from '@xstate/react';
import _ from 'lodash';
import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import StepWizard from 'react-step-wizard';
import { I18nContext } from '../../../core';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
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

const InitializeFromOtoroshiComponent = (props) => {
  const [state, send] = useMachine(theMachine);

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
        `daikoku-initialization-${props.tenant._id}`,
        JSON.stringify({
          otoroshi: state.context.otoroshi,
          tenant: props.tenant._id,
          step,
          createdApis,
          createdSubs,
        })
      );
    }
  }, [createdApis, createdSubs]);

  useEffect(() => {
    Promise.all([
      Services.teams(),
      Services.allSimpleOtoroshis(props.tenant._id),
      getVisibleApis(),
    ]).then(([teams, otoroshis, apis]) => {
      setTeams(teams);
      setOtoroshis(otoroshis);
      setApis(apis);
    });
  }, [props.tenant]);

  const getVisibleApis = () =>
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
        visibleApis.map(({ api }) => ({
          ...api,
          team: api.team._id,
        }))
      );

  const updateApi = (api) => {
    return Services.teamApi(api.team, api._humanReadableId, api.currentVersion)
      .then((oldApi) =>
        Services.saveTeamApi(api.team, { ...oldApi, ...api }, oldApi.currentVersion)
      )
      .then((updatedApi) => {
        const filteredApis = apis.filter((a) => a._id !== updatedApi._id);
        setApis([...filteredApis, updatedApi]);
      });
  };

  const orderedServices = _.orderBy(state.context.services, ['groiupId', 'name']);
  const filterServices = (inputValue) =>
    Promise.resolve(
      orderedServices
        .map(({ name }, index) => ({ label: name, value: index + 1 }))
        .filter((s) => s.label.toLowerCase().includes(inputValue.toLowerCase()))
    );
  const servicesSteps = orderedServices.map((s, idx) => (
    <ServicesStep
      key={`service-${idx}`}
      service={s}
      groups={state.context.groups}
      teams={teams}
      addNewTeam={(t) => setTeams([...teams, t])}
      addService={(s, team) => setCreatedApis([...createdApis, { ...s, team }])}
      infos={{ index: idx, total: state.context.services.length }}
      recap={() => send('RECAP')}
      maybeCreatedApi={Option(createdApis.find((a) => a.id === s.id))}
      updateService={(s, team) =>
        setCreatedApis([...createdApis.filter((a) => a.id !== s.id), { ...s, team }])
      }
      resetService={() => setCreatedApis([...createdApis.filter((a) => a.id !== s.id)])}
      getFilteredServices={filterServices}
      tenant={props.tenant}
      cancel={() => send('CANCEL')}
    />
  ));

  const orderedApikeys = _.orderBy(state.context.apikeys, ['clientName']);

  const filterApikeys = (entitie) => {
    return orderedApikeys.filter((apikey) =>
      (apikey.authorizedEntities || '').includes(`${entitie.prefix}${entitie.value}`)
    );
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
      localStorage.getItem(`daikoku-initialization-${props.tenant._id}`)
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

  return (
    <UserBackOffice tab="Initialization">
      <Can I={manage} a={TENANT} dispatchError>
        <div className="d-flex flex-row align-items-center">
          <h1>
            <Translation i18nkey="Daikoku initialization">Daikoku initialization</Translation>
          </h1>
          {state.matches('completeServices') && <Help />}
        </div>
        <div className="section py-3 px-2">
          {state.value === 'otoroshiSelection' && (
            <SelectOtoStep
              tenant={props.tenant}
              loadPreviousState={(previousState) => loadPreviousState(previousState)}
              setOtoInstance={(oto) =>
                send('LOAD', { otoroshi: oto.value, tenant: props.tenant._id })
              }
              otoroshis={otoroshis}
            />
          )}
          {(state.matches('loadingOtoroshiGroups') ||
            state.matches('loadingServices') ||
            state.matches('loadingApikeys')) && <Spinner />}
          {state.value === 'stepSelection' && (
            <SelectionStepStep
              goToServices={() => send('LOAD_SERVICE', { up: true })}
              goToApikeys={() => send('LOAD_APIKEY')}
            />
          )}
          {state.matches('completeServices') && (
            <StepWizard
              initialStep={step}
              isLazyMount={true}
              transitions={{}}
              onStepChange={(x) => setStep(x.activeStep)}
            >
              {servicesSteps}
            </StepWizard>
          )}
          {state.matches('recap') && (
            <RecapServiceStep
              cancel={() => send('CANCEL')}
              createdApis={createdApis}
              groups={state.context.groups}
              teams={teams}
              goBackToServices={() => send('ROLLBACK')}
              create={() =>
                send('CREATE_APIS', { createdApis, callBackCreation: () => afterCreation() })
              }
            />
          )}
          {state.matches('completeApikeys') && (
            <>
              <ApiKeyStep
                otoroshi={state.context.otoroshi}
                teams={teams}
                apis={apis}
                groups={state.context.groups}
                services={state.context.services}
                addNewTeam={(t) => setTeams([...teams, t])}
                addSub={(apikey, team, api, plan) =>
                  setCreatedSubs([...createdSubs, { ...apikey, team, api, plan }])
                }
                infos={(idx) => ({ index: idx, total: state.context.apikeys.length })}
                updateApi={(api) => updateApi(api)}
                recap={() => send('RECAP')}
                maybeCreatedSub={(apikey) =>
                  Option(createdSubs.find((s) => apikey.clientId === s.clientId))
                }
                updateSub={(apikey, team, api, plan) =>
                  setCreatedSubs([
                    ...createdSubs.filter((s) => s.clientId !== apikey.clientId),
                    { ...apikey, team, api, plan },
                  ])
                }
                resetSub={(apikey) =>
                  setCreatedSubs([...createdSubs.filter((s) => s.clientId !== apikey.clientId)])
                }
                getFilteredApikeys={filterApikeys}
                tenant={props.tenant}
                cancel={() => send('CANCEL')}
                createdSubs={createdSubs}
              />
              {createdSubs.length > 0 && (
                <RecapSubsStep
                  createdSubs={createdSubs}
                  cancel={() => {
                    setCreatedSubs([]);
                    send('CANCEL');
                  }}
                  apis={apis}
                  teams={teams}
                  goBackToServices={() => send('CANCEL')}
                  create={() =>
                    send('CREATE_APIKEYS', {
                      createdSubs,
                      callBackCreation: () => afterSubCreation(),
                    })
                  }
                />
              )}
            </>
          )}
          {state.matches('recapSubs') && (
            <RecapSubsStep
              createdSubs={createdSubs}
              cancel={() => send('CANCEL')}
              apis={apis}
              teams={teams}
              goBackToServices={() => send('ROLLBACK')}
              create={() =>
                send('CREATE_APIKEYS', { createdSubs, callBackCreation: () => afterSubCreation() })
              }
            />
          )}
          {state.matches('complete') && <Translation i18nkey="Done">Done</Translation>}

          {state.matches('failure') && (
            <div className="alert alert-danger">{state.context.error.error}</div>
          )}
        </div>
      </Can>
    </UserBackOffice>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const InitializeFromOtoroshi = connect(mapStateToProps)(InitializeFromOtoroshiComponent);

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
