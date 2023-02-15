import { useQueryClient } from "@tanstack/react-query";
import React, { useContext, useEffect, useState } from "react";
import { toastr } from "react-redux-toastr";
import { constraints, format, type as formType } from "@maif/react-forms";
import Select from "react-select";
import { getApolloContext } from "@apollo/client";

import { IApi, IFastApi, IFastPlan, IFastSubscription, ISubscription, ISubscriptionWithApiInfo, isValidationStepTeamAdmin, ITeamSimple, IUsagePlan } from "../../../types";
import { I18nContext } from "../../../contexts/i18n-context";
import * as Services from "../../../services";
import { ModalContext } from "../../../contexts";
import { isSubscriptionProcessIsAutomatic, Option } from '../../utils';

type FastApiCardProps = {
  team: ITeamSimple,
  apisWithAuthorization: Array<IFastApi>,
  subscriptions: Array<Array<IFastSubscription>>,
  input: string
  showPlan: (plan: IFastPlan) => void
  showApiKey: (apiId: string, teamId: string, version: string, plan: IFastPlan) => void
  planResearch: string
  setReasonSub: (reason: string) => void
}
export const FastApiCard = (props: FastApiCardProps) => {
  const { openFormModal, openApiKeySelectModal } = useContext(ModalContext);

  const queryClient = useQueryClient();
  const { client } = useContext(getApolloContext());

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

  const subscribe = (input: string, apiId: string, team: ITeamSimple, plan: IFastPlan, apiKey?: ISubscription) => {
    const apiKeyDemand = (motivation?: string) => apiKey
      ? Services.extendApiKey(apiId, apiKey._id, team._id, plan._id, motivation)
      : Services.askForApiKey(apiId, team._id, plan._id, motivation)

    if (plan.subscriptionProcess.steps.some(p => isValidationStepTeamAdmin(p))) {
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
          apiKeyDemand(motivation)
            .then((response) => {
              props.setReasonSub(motivation)
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
    } else {
      apiKeyDemand()
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
    }
  }


  const subscribeOrExtends = (input: string, apiId: string, team: ITeamSimple, plan: IFastPlan) => {
    if (client) {
      Services.getAllTeamSubscriptions(props.team._id)
        .then((subscriptions) => client.query({
          query: Services.graphql.apisByIdsWithPlans,
          variables: { ids: [...new Set(subscriptions.map((s) => s.api))] },
        })
          .then(({ data }) => ({ apis: data.apis, subscriptions }))
        )
        .then(({ apis, subscriptions }: { apis: Array<IApi>, subscriptions: Array<ISubscriptionWithApiInfo> }) => {
          const int = subscriptions
            .map((subscription) => {
              const api = apis.find((a) => a._id === subscription.api);
              const plan: IUsagePlan = Option(api?.possibleUsagePlans)
                .flatMap((plans: Array<IUsagePlan>) => Option(plans.find((plan) => plan._id === subscription.plan)))
                .getOrNull();
              return { subscription, api, plan };
            })

          const filteredApiKeys = int.filter((infos) => infos.plan?.otoroshiTarget?.otoroshiSettings ===
            plan?.otoroshiTarget?.otoroshiSettings && infos.plan.aggregationApiKeysSecurity
          )
            .map((infos) => infos.subscription);

          if (!plan.aggregationApiKeysSecurity || subscriptions.length <= 0) {
            subscribe(input, apiId, team, plan);
          } else {
            openApiKeySelectModal({
              plan,
              apiKeys: filteredApiKeys,
              onSubscribe: () => subscribe(input, apiId, team, plan),
              extendApiKey: (apiKey: ISubscription) => subscribe(input, apiId, team, plan, apiKey),
            });
          }
        });
    }

  }

  return (
    <div className="row py-2">
      <div className="col-12">
        <div className="d-flex flex-row mx-3 justify-content-between">
          {/* TODO: overflow ellips  for title*/}
          <h3 style={{ overflow: 'hidden', textOverflow: "ellipsis", whiteSpace: 'nowrap' }}>{selectedApi.api.name}</h3>
          {props.apisWithAuthorization.length > 1 &&
            <Select
              name="versions-selector"
              classNamePrefix="reactSelect"
              className="me-2 col-2"
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
            .map(subPlan => {
              const plan = selectedApi.api.possibleUsagePlans.find((pPlan) => pPlan._id === subPlan.planId)!
              return { plan, ...subPlan }
            })
            .sort((a, b) => (a.plan.customName || '').localeCompare(b.plan.customName || ''))
            .filter(({ plan }) => plan.otoroshiTarget && plan.otoroshiTarget.authorizedEntities !== null
              && (!!plan.otoroshiTarget.authorizedEntities.groups.length
                || !!plan.otoroshiTarget.authorizedEntities.services.length
                || !!plan.otoroshiTarget.authorizedEntities.routes.length))
            .map(({ plan, subscriptionsCount, isPending }) => {
              if (!plan.customName?.toLowerCase().includes(props.planResearch.toLowerCase()) || plan.otoroshiTarget?.authorizedEntities === null) {
                return;
              }
              return (
                <div className="fast__hover plan cursor-pointer" key={plan._id}>
                  <div className="mx-3 d-flex justify-content-between my-1">
                    <div className="flex-grow-1" onClick={() => props.showPlan(plan)}
                      style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {plan.customName}
                    </div>
                    {!!subscriptionsCount &&
                      <button className={"btn btn-sm btn-outline-success"}
                        onClick={() =>
                          props.showApiKey(
                            selectedApi.api._id,
                            props.team._id,
                            selectedApiV,
                            plan
                          )}
                        style={{ whiteSpace: "nowrap" }}>
                        {translate({ key: 'fastMode.button.seeApiKey', plural: subscriptionsCount > 1 })}
                      </button>}
                    {((!subscriptionsCount && !isPending) || plan.allowMultipleKeys) &&
                      <button
                        style={{ whiteSpace: "nowrap" }}
                        className={"btn btn-sm btn-outline-primary"}
                        onClick={() => subscribeOrExtends(
                          props.input,
                          selectedApi.api._id,
                          props.team,
                          plan
                        )}>
                        {translate(isSubscriptionProcessIsAutomatic(plan) ? ('Get API key') : ('Request API key'))}
                      </button>}
                    {isPending &&
                      <button style={{ whiteSpace: "nowrap" }} disabled={true}
                        className={"btn btn-sm btn-outline-primary disabled"}>
                        {translate('fastMode.button.pending')}
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