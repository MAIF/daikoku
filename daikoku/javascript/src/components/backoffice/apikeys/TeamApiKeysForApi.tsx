import { getApolloContext } from "@apollo/client";
import { Form, constraints, type } from "@maif/react-forms";
import classNames from "classnames";
import sortBy from "lodash/sortBy";
import React, { useContext, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { toast } from "sonner";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  I18nContext,
  ModalContext,
  useTeamBackOffice,
} from "../../../contexts";
import * as Services from "../../../services";
import {
  IApi,
  IRotation,
  ISafeSubscription,
  ISubscription,
  ISubscriptionExtended,
  ITeamSimple,
  IUsagePlan,
  ResponseError,
  isError,
} from "../../../types";
import {
  BeautifulTitle,
  Can,
  Option,
  PaginatedComponent,
  Spinner,
  apikey,
  formatPlanType,
  read,
  stat,
} from "../../utils";

type ISubscriptionWithChildren = ISubscriptionExtended & {
  children: Array<ISubscriptionExtended>;
};

export const TeamApiKeysForApi = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice();
  const [searched, setSearched] = useState("");

  const location = useLocation();
  const params = useParams();
  const { client } = useContext(getApolloContext());
  const { translate, Translation } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const queryClient = useQueryClient();

  const apiQuery = useQuery({
    queryKey: ["data", "visibleApi", params.apiId, params.versionId],
    queryFn: () =>
      Services.getTeamVisibleApi(
        (currentTeam as ITeamSimple)._id,
        params.apiId!,
        params.versionId!
      ),
    enabled: !!currentTeam && !isError(currentTeam),
  }); //FIXME: not real IAPI (betterApis with plans & pendingPlans)
  const subsQuery = useQuery({
    queryKey: ["data", "subscriptions"],
    queryFn: () =>
      Services.getTeamSubscriptions(
        params.apiId!,
        (currentTeam as ITeamSimple)._id,
        params.versionId!
      ),
    enabled: !!currentTeam && !isError(currentTeam),
  });

  const teamQuery = useQuery({
    queryKey: ["data", "team"],
    queryFn: () => Services.team((apiQuery.data as IApi).team),
    enabled: !!apiQuery.data && !isError(apiQuery.data),
  });

  const subApisQuery = useQuery({
    queryKey: ["data", "subscriptions", "apis"],
    queryFn: () => {
      return client?.query<{ apis: IApi[] }>({
        query: Services.graphql.apisByIds,
        variables: {
          ids: [
            ...new Set(
              (subsQuery.data as Array<ISubscription>).map((s) => s.api)
            ),
          ],
        },
      });
    },
    enabled: !!subsQuery.data && !isError(subsQuery.data),
  });

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["data"] });
  }, [location]);

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ApiKeys`;
  }, [currentTeam]);

  if (isLoading) {
    return <Spinner />;
  } else if (currentTeam && !isError(currentTeam)) {
    const updateCustomName = (
      subscription: ISubscription,
      customName: string
    ) => {
      return Services.updateSubscriptionCustomName(
        currentTeam,
        subscription,
        customName
      );
    };

    const archiveApiKey = (subscription: ISubscription) => {
      return Services.archiveApiKey(
        currentTeam._id,
        subscription._id,
        !subscription.enabled
      ).then(() =>
        queryClient.invalidateQueries({ queryKey: ["data", "subscriptions"] })
      );
    };

    const makeUniqueApiKey = (subscription: ISubscription) => {
      confirm({
        message: translate("team_apikey_for_api.ask_for_make_unique"),
      }).then((ok) => {
        if (ok)
          Services.makeUniqueApiKey(currentTeam._id, subscription._id).then(
            () => {
              queryClient.invalidateQueries({
                queryKey: ["data", "subscriptions"],
              });
              toast.success(
                translate(
                  "team_apikey_for_api.ask_for_make_unique.success_message"
                )
              );
            }
          );
      });
    };

    const toggleApiKeyRotation = (
      subscription: ISubscription,
      plan: IUsagePlan,
      enabled: boolean,
      rotationEvery: number,
      gracePeriod: number
    ) => {
      if (plan.autoRotation) {
        toast.error(translate("rotation.error.message"));
        return Promise.resolve();
      }

      return Services.toggleApiKeyRotation(
        currentTeam._id,
        subscription._id,
        enabled,
        rotationEvery,
        gracePeriod
      ).then((r) => {
        queryClient.invalidateQueries({ queryKey: ["data", "subscriptions"] });
      });
    };

    const regenerateApiKeySecret = (subscription: ISubscription) => {
      return confirm({ message: translate("reset.secret.confirm") }).then(
        (ok) => {
          if (ok) {
            Services.regenerateApiKeySecret(
              currentTeam._id,
              subscription._id
            ).then(() => {
              queryClient.invalidateQueries({
                queryKey: ["data", "subscriptions"],
              });
              toast.success(translate("secret reseted successfully"));
            });
          }
        }
      );
    };

    if (
      apiQuery.isLoading &&
      subsQuery.isLoading &&
      teamQuery.isLoading &&
      subApisQuery.isLoading
    ) {
      return <Spinner />;
    } else if (
      apiQuery.data &&
      subsQuery.data &&
      teamQuery.data &&
      subApisQuery.data &&
      !isError(apiQuery.data) &&
      !isError(subsQuery.data) &&
      !isError(teamQuery.data) &&
      !isError(subApisQuery.data)
    ) {
      const api = apiQuery.data;
      const apiTeam = teamQuery.data;
      const subscriptions = subsQuery.data;
      const subscribedApis = subApisQuery.data.data.apis;

      const search = searched.trim().toLowerCase();
      const filteredApiKeys =
        search === ""
          ? subscriptions
          : subscriptions.filter((subs) => {
              if (
                subs.apiKey.clientName
                  .replace("-", " ")
                  .toLowerCase()
                  .includes(search)
              ) {
                return true;
              } else if (
                subs.customName &&
                subs.customName.toLowerCase().includes(search)
              ) {
                return true;
              } else {
                return formatPlanType(subs.planType, translate)
                  .toLowerCase()
                  .includes(search);
              }
            });

      const sorted = sortBy(filteredApiKeys, ["plan", "customName", "parent"]);
      const sortedApiKeys = sorted
        .filter((f) => f.parent)
        .reduce<Array<ISubscriptionWithChildren>>(
          (acc, sub) => {
            return acc.find((a) => a._id === sub.parent)
              ? acc.map((a) => {
                  if (a._id === sub.parent) a.children.push(sub);
                  return a;
                })
              : [...acc, { ...sub, children: [] }];
          },
          sorted
            .filter((f) => !f.parent)
            .map((sub) => ({ ...sub, children: [] }))
        );

      return (
        <Can I={read} a={apikey} team={currentTeam} dispatchError>
          {api && apiTeam ? (
            <div className="row">
              <div className="col-12 d-flex align-items-center">
                <h1>
                  <Translation i18nkey="Api keys for">Api keys for</Translation>
                  &nbsp;
                  <Link
                    to={`/${apiTeam._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/description`}
                    className="cursor-pointer underline-on-hover a-fake"
                  >
                    {api.name}
                  </Link>
                </h1>
              </div>
              <div className="col-12 mt-2 mb-4">
                <input
                  type="text"
                  className="form-control col-5"
                  placeholder={translate("Search your apiKey...")}
                  aria-label="Search your apikey"
                  value={searched}
                  onChange={(e) => setSearched(e.target.value)}
                />
              </div>

              <div className="col-12">
                <PaginatedComponent
                  items={sortedApiKeys}
                  count={5}
                  formatter={(subscription: ISubscriptionWithChildren) => {
                    return (
                      <ApiKeyCard
                        api={api}
                        currentTeam={currentTeam}
                        statsLink={`/${currentTeam._humanReadableId}/settings/apikeys/${params.apiId}/${params.versionId}/subscription/${subscription._id}/consumptions`}
                        key={subscription.apiKey.clientId}
                        subscription={subscription}
                        subscribedApis={subscribedApis}
                        updateCustomName={(name) =>
                          updateCustomName(subscription, name)
                        }
                        archiveApiKey={() => archiveApiKey(subscription)}
                        makeUniqueApiKey={() => makeUniqueApiKey(subscription)}
                        toggleRotation={(
                          plan,
                          enabled,
                          rotationEvery,
                          gracePeriod
                        ) =>
                          toggleApiKeyRotation(
                            subscription,
                            plan,
                            enabled,
                            rotationEvery,
                            gracePeriod
                          )
                        }
                        regenerateSecret={() =>
                          regenerateApiKeySecret(subscription)
                        }
                      />
                    );
                  }}
                />
              </div>
            </div>
          ) : null}
        </Can>
      );
    } else {
      return <div>an error occured</div>;
    }
  } else {
    toast.error(error?.message || currentTeam?.error);
  }
};

type ApiKeyCardProps = {
  api: IApi;
  subscription: ISubscriptionWithChildren;
  updateCustomName: (
    name: string
  ) => Promise<ResponseError | ISafeSubscription>;
  statsLink: string;
  archiveApiKey: () => void;
  makeUniqueApiKey: () => void;
  toggleRotation: (
    plan: IUsagePlan,
    enabled: boolean,
    rotationEvery: number,
    graceperiod: number
  ) => Promise<void>;
  regenerateSecret: () => void;
  currentTeam: ITeamSimple;
  subscribedApis: Array<IApi>;
};

const ApiKeyCard = ({
  api,
  subscription,
  updateCustomName,
  statsLink,
  archiveApiKey,
  makeUniqueApiKey,
  toggleRotation,
  regenerateSecret,
  currentTeam,
  subscribedApis,
}: ApiKeyCardProps) => {
  const [hide, setHide] = useState(true);
  const [settingMode, setSettingMode] = useState(false);
  const [customName, setCustomName] = useState<string>();

  const [editMode, setEditMode] = useState(false);

  const [activeTab, setActiveTab] = useState<"apikey" | "token" | "basicAuth">(
    "apikey"
  );
  const apiKeyValues = {
    apikey: subscription.apiKey?.clientSecret,
    token: subscription.integrationToken,
    basicAuth: `Basic ${btoa(`${subscription.apiKey?.clientId}:${subscription.apiKey?.clientSecret}`)}`,
  };

  const [showAggregatePlan, setAggregatePlan] = useState(false);

  const { _id, integrationToken } = subscription;

  const { translate, Translation } = useContext(I18nContext);

  const planQuery = useQuery({
    queryKey: ["plan", subscription.plan],
    queryFn: () =>
      Services.getVisiblePlan(api._id, api.currentVersion, subscription.plan),
  });

  useEffect(() => {
    if (planQuery.data && !isError(planQuery.data)) {
      setActiveTab(
        planQuery.data.integrationProcess === "Automatic" ? "token" : "apikey"
      );
      if (!customName) {
        setCustomName(
          subscription.customName ||
            planQuery.data.customName ||
            planQuery.data.type
        );
      }
    }
  }, [planQuery.data]);

  let inputRef = React.createRef<HTMLInputElement>();

  useEffect(() => {
    if (editMode) {
      inputRef.current?.focus();
    }
  }, [editMode]);

  if (planQuery.isLoading) {
    return (
      <div className="col-12 col-sm-6 col-md-4 mb-2">
        <Spinner />
      </div>
    );
  } else if (planQuery.data && !isError(planQuery.data)) {
    const plan = planQuery.data;

    const settingsSchema = {
      enabled: {
        type: type.bool,
        label: translate("Enabled"),
        help: translate("help.apikey.rotation"),
        disabled: plan.autoRotation,
      },
      rotationEvery: {
        type: type.number,
        label: translate("Rotation period"),
        help: translate("help.apikey.rotation.period"),
        disabled: ({ rawValues }: any) => !rawValues.enabled,
        props: { steps: 1, min: 0 },
        constraints: [constraints.positive(translate("constraints.positive"))],
      },
      gracePeriod: {
        type: type.number,
        label: translate("Grace period"),
        help: translate("help.apikey.grace.period"),
        disabled: ({ rawValues }: any) => !rawValues.enabled,
        props: { steps: 1, min: 0 },
        constraints: [
          constraints.positive(translate("constraints.positive")),
          constraints.lessThan(
            constraints.ref<number>("rotationEvery"),
            translate("constraint.apikey.grace.period")
          ),
        ],
      },
    };

    const handleCustomNameChange = () => {
      const _customName = inputRef.current?.value.trim();
      if (_customName) {
        updateCustomName(_customName).then(() => {
          setCustomName(_customName);
          setEditMode(false);
        });
      }
    };

    const abort = () => {
      setSettingMode(false);
    };

    const abortCustomNameEdit = () => {
      setEditMode(false);
    };

    const handleChanges = (rotation: IRotation) => {
      if (subscription.enabled) {
        toggleRotation(
          plan,
          rotation.enabled,
          rotation.rotationEvery,
          rotation.gracePeriod
        ).then(() => setSettingMode(false));
      }
    };

    const disableRotation =
      api.visibility === "AdminOnly" || !!plan.autoRotation;

    return (
      <div className="col-12 col-sm-6 col-md-4 mb-2">
        <div className="card">
          <div className="card-header" style={{ position: "relative" }}>
            <div className="d-flex align-items-center justify-content-between">
              {!settingMode &&
                (!editMode ? (
                  <>
                    <BeautifulTitle
                      title={customName || ""}
                      style={{
                        wordBreak: "break-all",
                        marginBlockEnd: "0",
                        whiteSpace: "nowrap",
                        maxWidth: "85%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      className="plan-name"
                    >
                      {customName}
                    </BeautifulTitle>
                    <button
                      disabled={!subscription.enabled}
                      type="button"
                      className="btn btn-sm btn-access-negative ms-2"
                      onClick={() => setEditMode(true)}
                    >
                      <i className="fas fa-pen cursor-pointer a-fake" />
                    </button>
                  </>
                ) : (
                  <div className="input-group">
                    <input
                      type="text"
                      className="form-control"
                      defaultValue={customName}
                      ref={inputRef}
                    />
                    <div className="input-group-append">
                      <span
                        className="input-group-text cursor-pointer"
                        onClick={handleCustomNameChange}
                      >
                        <i className="fas fa-check accept" />
                      </span>
                      <span
                        className="input-group-text cursor-pointer"
                        onClick={abortCustomNameEdit}
                      >
                        <i className="fas fa-times escape a-fake" />
                      </span>
                    </div>
                  </div>
                ))}
              {settingMode ? (
                <h3>
                  <Translation i18nkey="ApiKey rotation">
                    ApiKey rotation
                  </Translation>
                </h3>
              ) : (
                <span
                  className="badge bg-secondary"
                  style={{
                    position: "absolute",
                    left: "1.25rem",
                    bottom: "-8px",
                  }}
                >
                  {formatPlanType(plan, translate)}
                </span>
              )}
            </div>
          </div>
          <div className="card-body" style={{ margin: 0 }}>
            {!settingMode && (
              <div>
                <div className="d-flex justify-content-end mb-3">
                  <div className="d-flex justify-content-around">
                    {!subscription.parent && (
                      <BeautifulTitle title={translate("Reset secret")}>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger ms-1"
                          disabled={!subscription.enabled}
                          onClick={regenerateSecret}
                        >
                          <i className="fas fa-sync-alt" />
                        </button>
                      </BeautifulTitle>
                    )}
                    <Can I={read} a={stat} team={currentTeam}>
                      <BeautifulTitle
                        title={translate("View usage statistics")}
                      >
                        <Link
                          to={statsLink}
                          className="btn btn-sm btn-access-negative ms-1"
                        >
                          <i className="fas fa-chart-bar" />
                        </Link>
                      </BeautifulTitle>
                    </Can>
                    <BeautifulTitle title={translate("Copy to clipboard")}>
                      <button
                        type="button"
                        disabled={!subscription.enabled}
                        className="btn btn-sm btn-access-negative ms-1"
                        onClick={() => {
                          let credentials = apiKeyValues[activeTab];
                          navigator.clipboard
                            .writeText(credentials)
                            .then(() =>
                              toast.info(translate("credential.copy.success"))
                            )
                            .catch(() =>
                              toast.warning(translate("credential.copy.error"))
                            );
                        }}
                      >
                        <i className="fas fa-copy" />
                      </button>
                    </BeautifulTitle>
                    {!subscription.parent && !disableRotation && (
                      <BeautifulTitle title={translate("Setup rotation")}>
                        <button
                          type="button"
                          className="btn btn-sm btn-access-negative ms-1"
                          onClick={() => setSettingMode(true)}
                        >
                          <i className="fas fa-history" />
                        </button>
                      </BeautifulTitle>
                    )}
                    {!subscription.parent && (
                      <BeautifulTitle title={translate("Enable/Disable")}>
                        <button
                          type="button"
                          disabled={
                            subscription.parent ? !subscription.parentUp : false
                          }
                          aria-label={
                            subscription.enabled ? "disable" : "enable"
                          }
                          className={classNames("btn btn-sm ms-1", {
                            "btn-outline-danger":
                              subscription.enabled &&
                              (subscription.parent
                                ? subscription.parentUp
                                : true),
                            "btn-outline-success":
                              !subscription.enabled &&
                              (subscription.parent
                                ? subscription.parentUp
                                : true),
                          })}
                          onClick={archiveApiKey}
                        >
                          <i className="fas fa-power-off" />
                        </button>
                      </BeautifulTitle>
                    )}
                    {subscription.parent && (
                      <BeautifulTitle
                        title={translate("team_apikey_for_api.make_unique")}
                      >
                        <button
                          type="button"
                          aria-label="make unique"
                          className="btn btn-sm ms-1 btn-outline-danger"
                          onClick={makeUniqueApiKey}
                        >
                          <i className="fas fa-share" />
                        </button>
                      </BeautifulTitle>
                    )}
                  </div>
                </div>
                {subscription.apiKey && (
                  <div className="row">
                    <ul className="nav nav-tabs flex-column flex-sm-row mb-2 col-12">
                      <li className="nav-item cursor-pointer">
                        <span
                          className={`nav-link ${activeTab === "apikey" ? "active" : ""}`}
                          onClick={() => setActiveTab("apikey")}
                        >
                          <Translation i18nkey="ApiKey">ApiKey</Translation>
                        </span>
                      </li>
                      {!disableRotation && (
                        <li className="nav-item  cursor-pointer">
                          <span
                            className={`nav-link ${activeTab === "token" ? "active" : ""}`}
                            onClick={() => setActiveTab("token")}
                          >
                            <Translation i18nkey="Integration token">
                              Integration token
                            </Translation>
                          </span>
                        </li>
                      )}
                      <li className="nav-item  cursor-pointer">
                        <span
                          className={`nav-link ${activeTab === "basicAuth" ? "active" : ""}`}
                          onClick={() => setActiveTab("basicAuth")}
                        >
                          <Translation i18nkey="Basic auth">
                            Basic auth
                          </Translation>
                        </span>
                      </li>
                    </ul>
                  </div>
                )}
                {activeTab == "apikey" && (
                  <>
                    <div className="mb-3">
                      <label htmlFor={`client-id-${_id}`} className="">
                        <Translation i18nkey="Client Id">Client Id</Translation>
                      </label>
                      <div className="">
                        <input
                          readOnly
                          disabled={!subscription.enabled}
                          className="form-control input-sm"
                          id={`client-id-${_id}`}
                          value={apiKeyValues[activeTab]}
                        />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label htmlFor={`client-secret-${_id}`} className="">
                        <Translation i18nkey="Client secret">
                          Client secret
                        </Translation>
                      </label>
                      <div className="input-group">
                        <input
                          readOnly
                          disabled={!subscription.enabled}
                          type={hide ? "password" : ""}
                          className="form-control input-sm"
                          id={`client-secret-${_id}`}
                          value={subscription.apiKey?.clientSecret}
                          aria-describedby={`client-secret-addon-${_id}`}
                        />
                        <div className="input-group-append">
                          <span
                            onClick={() => {
                              if (subscription.enabled) {
                                setHide(!hide);
                              }
                            }}
                            className={classNames("input-group-text", {
                              "cursor-pointer": subscription.enabled,
                              "cursor-forbidden": !subscription.enabled,
                            })}
                            id={`client-secret-addon-${_id}`}
                          >
                            {hide ? (
                              <i className="fas fa-eye" />
                            ) : (
                              <i className="fas fa-eye-slash" />
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                {activeTab == "token" && (
                  <>
                    <div className="mb-3">
                      <label htmlFor={`token-${_id}`} className="">
                        <Translation i18nkey="Integration token">
                          Integration token
                        </Translation>
                      </label>
                      <div className="">
                        <textarea
                          readOnly
                          rows={4}
                          className="form-control input-sm"
                          id={`token-${_id}`}
                          value={apiKeyValues[activeTab]}
                        />
                      </div>
                    </div>
                  </>
                )}
                {activeTab == "basicAuth" && (
                  <>
                    <div className="mb-3">
                      <label htmlFor={`basicAuth-${_id}`} className="">
                        <Translation i18nkey="Basic authentication">
                          Basic authentication
                        </Translation>
                      </label>
                      <div className="">
                        <textarea
                          readOnly
                          rows={4}
                          className="form-control input-sm"
                          id={`basicAuth-${_id}`}
                          value={apiKeyValues[activeTab]}
                        />
                      </div>
                    </div>
                  </>
                )}

                {subscription.children.length > 0 && (
                  <>
                    {showAggregatePlan && (
                      <div className="text-center">
                        <h5 className="modal-title">
                          {translate("team_apikey_aggregatePlans_title")}
                        </h5>
                        <div>
                          {subscription.children.map((aggregate) => {
                            const api = subscribedApis.find(
                              (a) => a._id === aggregate.api
                            );
                            console.debug(aggregate);
                            return (
                              <div key={aggregate._id}>
                                <Link
                                  to={`/${currentTeam._humanReadableId}/settings/apikeys/${aggregate._humanReadableId}/${api!.currentVersion}`}
                                >
                                  {`${aggregate.apiName}/${aggregate.planName || aggregate.planType}`}
                                </Link>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <button
                      className={`btn btn-sm btn-outline-info mx-auto d-flex ${
                        showAggregatePlan ? "mt-3" : ""
                      }`}
                      onClick={() => setAggregatePlan(!showAggregatePlan)}
                    >
                      {showAggregatePlan
                        ? translate("team_apikey_for_api.hide_aggregate_sub")
                        : translate("team_apikey_for_api.show_aggregate_sub")}
                    </button>
                  </>
                )}
              </div>
            )}

            {settingMode && (
              <div className="d-flex flex-column flex-grow-0">
                {!plan.autoRotation && (
                  <Form<IRotation>
                    schema={settingsSchema}
                    onSubmit={handleChanges}
                    value={Option(subscription.rotation).getOrElse({
                      enabled: false,
                      rotationEvery: 744,
                      gracePeriod: 168,
                      pendingRotation: false,
                    })}
                    footer={({ valid }) => {
                      return (
                        <div className="d-flex justify-content-end mt-3">
                          <button
                            className="btn btn-outline-danger"
                            onClick={abort}
                          >
                            <Translation i18nkey="Back">Back</Translation>
                          </button>
                          <button
                            className="btn btn-outline-success ms-2"
                            onClick={valid}
                          >
                            <i className="fas fa-save me-1"></i>
                            <Translation i18nkey="Save">Save</Translation>
                          </button>
                        </div>
                      );
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } else {
    return <div>Error while fetching usage plan</div>;
  }
};
type HelpProps = {
  message: string;
};
export const Help = ({ message }: HelpProps) => {
  return (
    <BeautifulTitle place="bottom" title={message}>
      <i className="ms-4 far fa-question-circle" />
    </BeautifulTitle>
  );
};
