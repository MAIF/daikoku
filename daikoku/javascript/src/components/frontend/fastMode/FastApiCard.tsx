import { useQueryClient } from "@tanstack/react-query";
import React, { useContext, useEffect, useState } from "react";
import { toastr } from "react-redux-toastr";
import { constraints, format, type as formType } from "@maif/react-forms";
import Select from "react-select";

import { IFastApi, IFastPlan, IFastSubscription, ITeamSimple } from "../../../types";
import { I18nContext } from "../../../contexts/i18n-context";
import * as Services from "../../../services";
import { ModalContext } from "../../../contexts";

type FastApiCardProps = {
  team: ITeamSimple,
  apisWithAuthorization: Array<IFastApi>,
  subscriptions: Array<Array<IFastSubscription>>,
  input: string
  showPlan: Function
  showApiKey: Function
  planResearch: string
}
export const FastApiCard = (props: FastApiCardProps) => {
  const { openFormModal } = useContext(ModalContext);

  const queryClient = useQueryClient();

  const { translate } = useContext(I18nContext);
  const [selectedApiV, setSelectedApiV] = useState(props.apisWithAuthorization.find(a => a.api.isDefault)?.api.currentVersion || props.apisWithAuthorization[0].api.currentVersion);
  const [selectedApi, setSelectedApi] = useState<IFastApi>(props.apisWithAuthorization.find((api) => api.api.currentVersion === selectedApiV)!)

  useEffect(() => {
    setSelectedApi(props.apisWithAuthorization.find((api) => api.api.currentVersion === selectedApiV)!)
  }, [props.apisWithAuthorization])


  const changeApiV = (version: string) => {
    setSelectedApiV(version)
    setSelectedApi(props.apisWithAuthorization.find((api) => api.api.currentVersion === version)!)
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
      openFormModal<{ motivation: string }>({
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
        onSubmit: ({ motivation }) => {
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
      })

    }
  }
  return (
    <div className="row py-2">
      <div className="col-12">
        <div className="d-flex flex-row mx-3 justify-content-between">
          {/* TODO: overflow ellips  for title*/}
          <h3>{selectedApi.api.name}</h3>
          {props.apisWithAuthorization.length > 1 &&
            <Select
              name="versions-selector"
              classNamePrefix="reactSelect"
              className="me-2"
              menuPlacement="auto"
              menuPosition="fixed"
              value={{ value: selectedApiV, label: selectedApiV }}
              isClearable={false}
              options={props.apisWithAuthorization.map((api) => {
                return { value: api.api.currentVersion, label: api.api.currentVersion }
              })}
              onChange={(e) => { changeApiV(e!.value) }}
            />}
        </div>
        <div className="d-flex flex-column fast_api">
          {selectedApi.subscriptionsWithPlan
            .map((subPlan) => {
              const plan = selectedApi.api.possibleUsagePlans.find((pPlan) => pPlan._id === subPlan.planId)!
              const otoroshiSetUp =
                plan.otoroshiTarget && plan.otoroshiTarget.authorizedEntities !== null
                && (plan.otoroshiTarget.authorizedEntities.groups.length >= 1
                || plan.otoroshiTarget.authorizedEntities.services.length >= 1
                || plan.otoroshiTarget.authorizedEntities.routes.length >= 1)
              if (!plan.customName?.includes(props.planResearch) || plan.otoroshiTarget?.authorizedEntities === null) {
                return;
              }
              return (
                <div className="fast__hover plan cursor-pointer" key={subPlan.planId}>
                  <div className="mx-3 d-flex justify-content-between my-1">
                    <div className="flex-grow-1" onClick={() => props.showPlan(plan)}
                      style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {plan.customName}
                    </div>
                    {otoroshiSetUp && subPlan.subscriptionsCount > 0 &&
                      <button className={"btn btn-outline-success me-1"}
                        onClick={() =>
                          props.showApiKey(
                            selectedApi.api._id,
                            props.team._id,
                            selectedApiV,
                            plan
                          )}
                        style={{ whiteSpace: "nowrap" }}>
                        {translate({key: 'fastMode.button.seeApiKey', plural: subPlan.subscriptionsCount > 1})}
                      </button>}
                    {otoroshiSetUp && subPlan.isPending &&
                      <button style={{ whiteSpace: "nowrap" }} disabled={true}
                        className={"btn btn-outline-primary disabled me-1"}>
                        {translate('fastMode.button.pending')}
                      </button>}
                    { otoroshiSetUp && (!subPlan.subscriptionsCount || plan.allowMultipleKeys) && !subPlan.isPending &&
                      <button
                        style={{ whiteSpace: "nowrap" }}
                        className={"btn btn-sm btn-outline-primary me-1"}
                        onClick={() => subscribe(
                          props.input,
                          selectedApi.api._id,
                          props.team,
                          plan
                        )}>

                        {translate(plan.subscriptionProcess === 'Automatic' ? ('Get API key') : ('Request API key'))}
                      </button>}
                    {!plan.otoroshiTarget &&
                        <span className="badge bg-danger">{translate('otoroshi.missing.target')}</span>
                    }
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}