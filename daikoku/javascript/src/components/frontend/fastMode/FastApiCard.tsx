import {useDispatch} from "react-redux";
import {useQueryClient} from "react-query";
import React, {useContext, useState} from "react";
import {toastr} from "react-redux-toastr";
import {constraints, format, type as formType} from "@maif/react-forms";
import Select from "react-select";

import {IFastApi, IFastPlan, IFastSubscription, ITeamSimple} from "../../../types";
import {I18nContext} from "../../../contexts/i18n-context";
import * as Services from "../../../services";
import {openFormModal} from "../../../core";

type ExpertApiCardProps = {
  team: ITeamSimple,
  apiWithAuthorization: Array<IFastApi>,
  subscriptions: Array<Array<IFastSubscription>>,
  input: string
  showPlan: Function
  showApiKey: Function
  planResearch: string
}
export const ExpertApiCard = (props: ExpertApiCardProps) => {
  const dispatch = useDispatch()

  const queryClient = useQueryClient();

  const apisWithAuthorization = props.apiWithAuthorization

  const {translate} = useContext(I18nContext);
  const [selectedApiV, setSelectedApiV] = useState(props.apiWithAuthorization.find(a => a.api.isDefault)?.api.currentVersion || props.apiWithAuthorization[0].api.currentVersion);
  const [selectedApi, setSelectedApi] = useState<IFastApi>(apisWithAuthorization.find((api) => api.api.currentVersion === selectedApiV)!)

  const changeApiV = ( version: string) => {
    setSelectedApiV(version)
    setSelectedApi(apisWithAuthorization.find((api) => api.api.currentVersion === version)!)
  }
  function subscribe(input: string, apiId: string, team: ITeamSimple, plan: IFastPlan) {
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
        title: translate(input === '' ? 'motivations.modal.title' : 'fastMode.subscription.resume'),
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
      <div className="col-12"><span className="d-flex flex-row mx-3 justify-content-between">
        <h3>{props.apiWithAuthorization[0].api.name}</h3>
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
                  return {value: api.api.currentVersion, label: api.api.currentVersion}
                })}
                onChange={(e) => {
                  changeApiV(e!.value)
                }}
            />}
      </span>
        <div className="d-flex flex-column fast_api">
          {selectedApi.subscriptionsWithPlan
            .map((subPlan) => {
              const plan = selectedApi.api.possibleUsagePlans
                .find((pPlan) => pPlan._id === subPlan.planId)!
              if (!plan.customName.includes(props.planResearch)) {
                return;
              }
              return (
                <div className="fast__hover plan cursor-pointer" key={subPlan.planId}>
                  <div className="mx-3 d-flex justify-content-between my-1">
                    <div className="flex-grow-1" onClick={() => props.showPlan(plan)}
                         style={{overflow: "hidden", textOverflow: "ellipsis"}}>
                      {plan.customName}
                    </div>
                    {subPlan.havesubscriptions &&
                        <button className={"btn btn-outline-success me-1"}
                                onClick={() =>
                                  props.showApiKey(
                                    selectedApi.api._id,
                                    props.team._id,
                                    selectedApiV,
                                    plan
                                  )}
                                style={{whiteSpace: "nowrap"}}>
                          {translate('fastMode.button.seeApiKey')}
                        </button>}
                    {subPlan.isPending &&
                        <button style={{whiteSpace: "nowrap"}} disabled={true}
                                className={"btn btn-outline-primary disabled me-1"}>
                          {translate('fastMode.button.pending')}
                        </button>}
                    {(!subPlan.havesubscriptions || plan.allowMultipleKeys) && !subPlan.isPending &&
                        <button
                          style={{whiteSpace: "nowrap"}}
                          className={"btn btn-sm btn-outline-primary me-1"}
                          onClick={() => subscribe(
                            props.input,
                            selectedApi.api._id,
                            props.team,
                            plan
                          )}>
                      {translate(plan.subscriptionProcess === 'Automatic' ? ('Get API key') : ('Request API key'))}
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