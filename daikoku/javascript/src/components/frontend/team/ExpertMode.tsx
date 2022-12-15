import React, {useContext, useState} from "react";
import {useQuery, useQueryClient} from "react-query";
import Select from 'react-select';
import {getApolloContext} from "@apollo/client";
import classNames from "classnames";
import {useDispatch, useSelector} from "react-redux";
import {toastr} from "react-redux-toastr"
import {constraints, format, type as formType} from "@maif/react-forms";
import "../../../style/components/fastApiCard.scss";

import * as Services from "../../../services";
import {Spinner} from "../../utils";
import {
  IAccessibleApi, IAccessiblePlan, IAccessibleSubscription, IState,
  ITeamSimple, ITenant,
} from "../../../types";
import {I18nContext, openFormModal} from '../../../core';
import {converter} from "../../../services/showdown";
import {useNavigate} from "react-router-dom";


const GRID = 'GRID';
const LIST = 'LIST';

type ExpertApiListProps = {
  team: ITeamSimple,
  apiWithAuthorizations: Array<IAccessibleApi>
}
type ExpertApiCardProps = {
  team: ITeamSimple,
  apiWithAuthorization: Array<IAccessibleApi>,
  subscriptions: Array<Array<IAccessibleSubscription>>,
  input: string
}

const ExpertApiList = (props: ExpertApiListProps) => {
  const [input, setInput] = useState('');
  const {translate} = useContext(I18nContext);

  return (
      <div className="row">
        <div className="col-12 col-sm mb-2">
          <input
            type="text"
            className="form-control"
            placeholder={translate('expertMode.input.reasonSubscription')}
            aria-label=""
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
            }}
          />
        </div>
        {props.apiWithAuthorizations.map((api) => {
          if (!api.parent) {
            const tmp = props.apiWithAuthorizations.filter((temp) => temp.name == api.name)
            if (tmp.length > 1) {
              return (
                <div >
                  <div className="card mb-4 shadow-sm api-card ">
                    <ExpertApiCard apiWithAuthorization={tmp} team={props.team}
                                   subscriptions={tmp.map((tmpapi) => tmpapi.subscriptionsWithPlan)} input={input}/>
                  </div>
                </div>
              )
            } else {
              return (
                <div >
                  <div className="card mb-4 shadow-sm api-card ">
                    <ExpertApiCard apiWithAuthorization={[api]} team={props.team}
                                   subscriptions={[api.subscriptionsWithPlan]} input={input}/>
                  </div>
                </div>
              )
            }
          }
        })}
      </div>
  )
}


const ExpertApiCard = (props: ExpertApiCardProps) => {
  const dispatch = useDispatch()
  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const [view] = useState<'LIST' | 'GRID'>(LIST);
  const {translate} = useContext(I18nContext);
  const [selectedApiV, setSelectedApiV] = useState(props.apiWithAuthorization.find(a => a.isDefault)?.currentVersion || props.apiWithAuthorization[0].currentVersion);

  function subscribe(input: string, apiId: string, team: ITeamSimple, plan: IAccessiblePlan) {
    const teamsSubscriber = new Array(team._id)

    if (plan.subscriptionProcess === 'Automatic') {
      Services.askForApiKey(apiId, teamsSubscriber, plan._id)
        .then((response) => {
          if (response[0].error) {
            toastr.error(
              translate('Error'),
              response[0].error
            )
          } else {
            toastr.success(
              translate('Done'),
              translate(
                {
                  key: 'subscription.plan.accepted',
                  replacements: [
                    plan.customName!,
                    team.name
                  ]
                }))
            queryClient.invalidateQueries(['data'])
          }
        })
    } else {
      dispatch(openFormModal<{ motivation: string }>({
        title: translate(input === '' ? 'motivations.modal.title' : 'expertMode.subscription.resume'),
        schema: {
          motivation: {
            defaultValue: input,
            type: formType.string,
            format: format.text,
            label: null,
            constraints: [
              constraints.required()
            ]
          }
        },
        onSubmit: ({motivation}) => {
          Services.askForApiKey(apiId, teamsSubscriber, plan._id, motivation)
            .then((response) => {
                if (response[0].error) {
                  toastr.error(
                    translate('Error'),
                    response[0].error
                  )
                } else {
                  toastr.success(
                    translate('Done'),
                    translate(
                      {
                        key: 'subscription.plan.waiting',
                        replacements: [
                          plan.customName!,
                          team.name
                        ]
                      }))
                  queryClient.invalidateQueries(['data'])
                }
              }
            )

        },
        actionLabel: translate('Send')
      }))

    }
  }


    return (
      <div className="row py-2">
        <div className="col-12">
        <span className="d-flex flex-row ms-3 me-3 justify-content-between border-bottom" >
          <h3>{props.apiWithAuthorization[0].name}</h3>
          {props.apiWithAuthorization.length > 1 &&
          <Select
            name="versions-selector"
            classNamePrefix="reactSelect"
            className="me-2"
            menuPlacement="auto"
            menuPosition="fixed"
            value={{value: selectedApiV, label: selectedApiV}}
          isClearable={false}
          options={props.apiWithAuthorization.map((api) => {
            return {value: api.currentVersion, label: api.currentVersion}
          })}
          onChange={(e) => {
            setSelectedApiV(props.apiWithAuthorization.find((api) => api.currentVersion == e?.value)!.currentVersion)
          }}
        />}
          {props.apiWithAuthorization.length == 1 &&
            <h3>version : {selectedApiV}</h3>
          }
        </span>

        <div className=" d-flex flex-column">
          {props.apiWithAuthorization.find((api) => api.currentVersion === selectedApiV)!.subscriptionsWithPlan
            .map((subPlan) => {
              const plan = props.apiWithAuthorization.find((api) => api.currentVersion === selectedApiV)!.possibleUsagePlans.find((pPlan) => pPlan._id == subPlan.planId)!
              return (
                <div className="fast__hover">
                <div className="ms-2 me-2 d-flex justify-content-between my-1">
                  {props.apiWithAuthorization.find((api) => api.currentVersion === selectedApiV)!.possibleUsagePlans.find((pPlan) => pPlan._id == subPlan.planId)!.customName}
                  {subPlan.havesubscriptions && <button className={"btn btn-outline-success me-1"} onClick={() => navigate(`/${props.team._humanReadableId}/settings/apikeys/${props.apiWithAuthorization[0]._humanReadableId}/${selectedApiV}`)}>
                    See the api key
                  </button>}
                  {subPlan.isPending && <button disabled={true} className={"btn btn-outline-primary disabled me-1"}> Pending </button>}
                  {(!subPlan.havesubscriptions || plan.allowMultipleKeys ) && !subPlan.isPending && <button
                    className={"btn btn-sm btn-outline-primary me-1"}
                    onClick={() => subscribe(props.input, props.apiWithAuthorization.find((api) => api.currentVersion === selectedApiV)!._id, props.team, props.apiWithAuthorization.find((api) => api.currentVersion === selectedApiV)!.possibleUsagePlans.find((pPlan) => pPlan._id == subPlan.planId)!)}>
                    {translate(props.apiWithAuthorization.find((api) => api.currentVersion === selectedApiV)!.possibleUsagePlans.find((pPlan) => pPlan._id == subPlan.planId)!.subscriptionProcess === 'Automatic' ? ('Get API key') : ('Request API key'))}
                  </button>}
                </div>
                </div>
              )
          })}
        </div>
        </div>
      </div>
    )
}


export const ExpertMode = () => {
  const {translate} = useContext(I18nContext);
  const tenant = useSelector<IState, ITenant>(s => s.context.tenant)
  const maybeTeam = localStorage.getItem('selectedteam')
  const [selectedTeam, setSelectedTeam] = useState<ITeamSimple>(maybeTeam ? JSON.parse(maybeTeam) : undefined);
  const myTeamsRequest = useQuery(['myTeams'], () => Services.myTeams())
  const {client} = useContext(getApolloContext());
  const dataRequest = useQuery<IAccessibleApi[]>({
    queryKey: ["data", selectedTeam?._id],
    queryFn: ({queryKey}) => {
      return client!.query<{ accessibleApis: Array<{ api: IAccessibleApi, subscriptionsWithPlan: any }> }>({
        query: Services.graphql.getApisWithSubscription,
        variables: {teamId: queryKey[1]}
      }).then(({data: {accessibleApis}}) => {

        return accessibleApis.map(({
                                       api,
                                       subscriptionsWithPlan
                                     }) => ({...api, subscriptionsWithPlan}))
        }
      )
    },
    enabled: !!selectedTeam && !!client
  })

  if (myTeamsRequest.isLoading || dataRequest.isLoading) {
    return <Spinner/>

  } else if (myTeamsRequest.data){
    return (
      <main role="main">
        <section className="organisation__header col-12 mb-4 p-3">
          <div className="container">
            <div className="row text-center">
              <div className="col-sm-4">
                <img
                  className="organisation__avatar"
                  src={tenant.logo ? tenant.logo : '/assets/images/daikoku.svg'}
                  alt="avatar"
                />
              </div>
              <div className="col-sm-7 d-flex flex-column justify-content-center">
                <h1 className="jumbotron-heading">
                  {tenant.title ? tenant.title : translate('Your APIs center')}
                </h1>
                <Description description={tenant.description} />
              </div>
            </div>
          </div>
        </section>
        <section className="container">
          <div className="row mb-2">
            <div className="col-12 col-sm mb-2">
            <Select
              name="team-selector"
              className="tag__selector filter__select reactSelect col-6 col-sm mb-2"
              value={{value: selectedTeam, label: selectedTeam?.name}}
              isClearable={false}
              options={myTeamsRequest.data.map((team) => {
                return {value: team, label: team.name}
              })}
              onChange={(e) => {
                setSelectedTeam(e!.value)
                localStorage.setItem('selectedteam', JSON.stringify(e!.value));

              }}
              classNamePrefix="reactSelect"
            />
            {selectedTeam && dataRequest.data &&
                <div>
                  <ExpertApiList team={selectedTeam} apiWithAuthorizations={dataRequest.data}/>
                </div>
            }
            {!selectedTeam &&
                <div> {translate('expertMode.title.chooseTeam')}</div>
            }
            </div>
          </div>
        </section>
      </main>
    )
  } else {
    return (
      <div>{translate('expertMode.error.searching.team')}</div>
    )
  }

}
const Description = (props: any) => {
  const { Translation } = useContext(I18nContext);

  if (!props.description) {
    return (
      <p className="lead">
        <Translation i18nkey="Daikoku description start">Daikoku is the perfect</Translation>
        <a href="https://www.otoroshi.io">Otoroshi</a>
        <Translation i18nkey="Daikoku description end">
          companion to manage, document, and expose your beloved APIs to your developpers community.
          Publish a new API in a few seconds
        </Translation>
      </p>
    );
  }

  return (
    <div dangerouslySetInnerHTML={{ __html: converter.makeHtml(props.description || '') }}></div>
  );
};