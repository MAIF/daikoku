import { useMachine } from '@xstate/react';
import orderBy from 'lodash/orderBy';
import { useContext, useEffect, useState } from 'react';
import ReactDOMServer from 'react-dom/server';
import StepWizard from 'react-step-wizard';
import { toast } from 'sonner';

import { I18nContext, useTenantBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { ITeamFull, ITeamFullGql, isError } from '../../../types';
import { BeautifulTitle, Can, Option, Spinner, tenant as TENANT, manage } from '../../utils';
import {
  ApiKeyStep,
  RecapServiceStep,
  RecapSubsStep,
  SelectOtoStep,
  SelectionStepStep,
  ServicesStep,
  theMachine,
} from './initialization';
import { useQueries, useQueryClient } from '@tanstack/react-query';

type IVisibleApiGQL = {
  api: {
    _id: string,
    name: string,
    tenant: {
      id: string,
    }
    team: {
      _id: string
    }
    currentVersion: string
    possibleUsagePlans: {
      _id: string
      customName: string
      type: string
    }
    _humanReadableId: string
  }
}

export const InitializeFromOtoroshi = () => {
  const { tenant, customGraphQLClient } = useContext(GlobalContext);
  useTenantBackOffice();

  const [state, send] = useMachine<any>(theMachine);

  const { Translation, translate } = useContext(I18nContext);

  const [createdTeams, setCreatedTeams] = useState<Array<any>>([]);
  const [createdApis, setCreatedApis] = useState<Array<any>>([]);
  const [createdSubs, setCreatedSubs] = useState<Array<any>>([]);

  const [step, setStep] = useState<number>(1);

  const queryClient = useQueryClient();
  const queries = useQueries({
    queries: [
      {
        queryKey: [tenant._id, "teams"],
        queryFn: () => {
          return customGraphQLClient.request<{ teamsPagination: { teams: Array<ITeamFullGql>, total: number } }>(
            `
            query getAllteams ($research: String, $limit: Int, $offset: Int) {
              teamsPagination (research: $research, limit: $limit, offset: $offset){
                teams {
                  _id
                  _humanReadableId
                  name
                  avatar
                }
                total
              }
            }`, {
            research: "",
            limit: -1,
            offset: -1
          })
            .then((data) => {
              return data.teamsPagination
            })
        }
      },
      {
        queryKey: [tenant._id, "teams"],
        queryFn: () => {
          return customGraphQLClient.request<{ visibleApis: { apis: Array<IVisibleApiGQL> } }>(
            `query AllVisibleApis {
              visibleApis {
                apis {
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
            }`)
            .then(({ visibleApis: { apis } }) =>
              apis.map(({ api }) => ({
                ...api,
                team: api.team._id,
              }))
            )
        }
      },
      {
        queryKey: [tenant._id, 'otoroshis'],
        queryFn: () => Services.allSimpleOtoroshis(tenant._id)
      }
    ]
  })


  useEffect(() => {
    if (queries[1].data && queries[1].data.length && state.context.otoroshi && (createdApis.length || createdSubs.length)) {
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

  if (queries.some(q => q.isFetching || q.isLoading)) {
    return <Spinner />
  } else if (queries.every(q => q.data && !isError(q.data))) {

    const teams = queries[0].data!.teams
    const apis = queries[1].data!
    const otoroshis = queries[2].data!

    const orderedServices = orderBy([...state.context.services, ...state.context.routes], ['groupId', 'id', 'name']);
    const filterServices = (inputValue: any) => Promise.resolve(orderedServices
      .map(({ name }, index) => ({ label: name, value: index + 1 }))
      .filter((s) => (s.label as any).toLowerCase().includes(inputValue.toLowerCase())));
    const servicesSteps = orderedServices.map((s, idx) => (
      <ServicesStep
        key={`service-${idx}`}
        service={s}
        groups={state.context.groups}
        teams={teams}
        addNewTeam={(t: any) => setCreatedTeams([...createdTeams, t])}
        addService={(s: any, team: any) => setCreatedApis([...createdApis, { ...s, team }])}
        infos={{ index: idx, total: [...state.context.services, ...state.context.routes].length }}
        recap={() => send('RECAP')}
        maybeCreatedApi={Option(createdApis.find((a) => (a as any).id === (s as any).id))}
        updateService={(s: any, team: any) => setCreatedApis([...createdApis.filter((a) => (a as any).id !== s.id), { ...s, team }])}
        resetService={() => setCreatedApis([...createdApis.filter((a) => (a as any).id !== (s as any).id)])}
        getFilteredServices={filterServices}
        tenant={tenant}
        cancel={() => send('CANCEL')} />));

    const orderedApikeys = orderBy(state.context.apikeys, ['clientName']);

    const filterApikeys = (entity: { label: string, prefix: string, value: string }) => {
      return orderedApikeys.filter((apikey) => (apikey.authorizedEntities || '').includes(`${entity.prefix}${entity.value}`));
    };

    const afterCreation = () => {

      queryClient.invalidateQueries({ queryKey: [tenant._id] })
        .then(() => setStep(1))
        .then(() => toast.success(translate('Apis successfully created')));
    };

    const afterSubCreation = () => {
      setStep(1);
      setCreatedSubs([]);
      toast.success(translate('Subscriptions successfully created'));
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
        toast.warning(translate('Seems to have no saved state...please continue'));
      }
    };

    return (
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
              tenant={tenant}
              loadPreviousState={() => loadPreviousState()}
              setOtoInstance={(oto: any) => send('LOAD', { otoroshi: oto.value, tenant: tenant._id })}
              otoroshis={otoroshis} />)}
          {(state.matches('loadingOtoroshiGroups') ||
            state.matches('loadingServices') ||
            state.matches('loadingApikeys')) && <Spinner />}
          {state.value === 'stepSelection' && (<SelectionStepStep
            goToServices={() => send('LOAD_SERVICE', { up: true })}
            goToApikeys={() => send('LOAD_APIKEY')} />)}
          {state.matches('completeServices') && <StepWizard initialStep={step} isLazyMount={true} transitions={{}} onStepChange={(x) => setStep(x.activeStep)}>
            {servicesSteps}
          </StepWizard>}
          {state.matches('recap') && (<RecapServiceStep
            cancel={() => send('CANCEL')}
            createdApis={createdApis}
            groups={state.context.groups}
            teams={teams}
            goBackToServices={() => send('ROLLBACK')}
            create={() => send('CREATE_APIS', { createdApis, callBackCreation: () => afterCreation() })} />)}
          {state.matches('completeApikeys') && (<>
            <ApiKeyStep
              groups={state.context.groups}
              services={state.context.services}
              routes={state.context.routes}
              getFilteredApikeys={filterApikeys}
              cancel={() => send('CANCEL')}
              createdSubs={createdSubs} />
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
      </Can>
    );
  } else {
    return (<div>Error while fetching data</div>)
  }

};

const Help = () => {
  const { Translation } = useContext(I18nContext);
  return (
    <BeautifulTitle
      place="bottom"
      title={ReactDOMServer.renderToString(
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
      )}
    >
      <i className="ms-4 far fa-question-circle" />
    </BeautifulTitle>
  );
};
