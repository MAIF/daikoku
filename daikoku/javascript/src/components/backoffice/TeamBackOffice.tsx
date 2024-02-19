import classNames from "classnames";
import { useContext, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";

import { I18nContext, useTeamBackOffice } from "../../contexts";
import { IState, ITeamSimple, isError } from "../../types";
import {
  TeamApi,
  TeamApiGroup,
  TeamApiKeyConsumption,
  TeamApiKeys,
  TeamApiKeysForApi,
  TeamApis,
  TeamAssets,
  TeamBilling,
  TeamConsumption,
  TeamEdit,
  TeamIncome,
  TeamMembers,
} from "../backoffice";
import { Spinner } from "../utils";
import { LastDemands, LastDemandsExt } from "./widgets";

const BackOfficeContent = (props) => {
  return (
    <div className="" style={{ height: "100%" }}>
      {!props.error.status && props.children}
    </div>
  );
};
type TeamHome = ITeamSimple & {
  apisCount: number;
  subscriptionsCount: number;
  notificationCount: number;
};

const TeamBackOfficeHome = (props: TeamBackOfficeProps) => {
  const { translate } = useContext(I18nContext);
  const [mode, setMode] = useState<"producer" | "consumer">("consumer");

  useEffect(() => {
    document.title = `${props.currentTeam.name}`;
  }, [props.currentTeam]);

  return (
    <div className="row">
      <div className="col">
        <div className="d-flex flex-row justify-content-center gap-1">
          <button
            className={classNames("btn btn-outline-primary", {
              active: mode === "producer",
            })}
            onClick={() => setMode("producer")}
          >
            {translate('team.dashboard.label.producer')}
          </button>
          <button
            className={classNames("btn btn-outline-primary", {
              active: mode === "consumer",
            })}
            onClick={() => setMode("consumer")}
          >
            {translate('team.dashboard.label.consumer')}
          </button>
        </div>
        <div>
          {mode === "producer" && <ProducerDashboard {...props}/>}
          {mode === "consumer" && <ConsumerDashboard {...props}/>}
        </div>
      </div>
    </div>
  );
};

export type TeamBackOfficeProps<P = unknown> = P & { currentTeam: ITeamSimple, reloadCurrentTeam: () => Promise<void> }

export const TeamBackOffice = () => {
  const { isLoading, currentTeam, reloadCurrentTeam } = useTeamBackOffice()

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = currentTeam.name;
  }, [currentTeam]);

  if (isLoading) {
    return <Spinner />
  } else if (currentTeam && !isError(currentTeam)) {
    return (
      <div className="row">
        <main role="main" className="ml-sm-auto px-4 mt-3">
          <div
            className={classNames("back-office-overlay", {
              active: isLoading && !error.status,
            })}
          />
          <BackOfficeContent error={error}>
            <Routes>
              <Route path={`/edition`} element={<TeamEdit currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />} />
              <Route path={`/assets`} element={<TeamAssets currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />} />

              <Route path={`/consumption`} element={<TeamConsumption currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />} />
              <Route path={`/billing`} element={<TeamBilling currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />} />
              <Route path={`/income`} element={<TeamIncome currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />} />
              <Route
                path={`/apikeys/:apiId/:versionId/subscription/:subscription/consumptions`}
                element={<TeamApiKeyConsumption currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />}
              />
              <Route
                path={`/apikeys/:apiId/:versionId`}
                element={<TeamApiKeysForApi currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />}
              />
              <Route path={`/apikeys`} element={<TeamApiKeys currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />} />
              <Route path={`/members`} element={<TeamMembers currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />} />
              <Route
                path={`/apis/:apiId/:versionId/:tab/*`}
                element={<TeamApi creation={false} currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />}
              />
              <Route
                path={`/apis/:apiId/:tab`}
                element={<TeamApi creation={true} currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />}
              />
              <Route
                path={`/apigroups/:apiGroupId/:tab/*`}
                element={<TeamApiGroup currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam}/>}
              />
              <Route path={`/apis`} element={<TeamApis currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />} />
              <Route path="/" element={<TeamBackOfficeHome currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam} />} />
            </Routes>
          </BackOfficeContent>
        </main>
      </div>
    );
  } else {
    return <div>Error while fetching team</div>
  }

};

type ProducerDashboardType = {};
const ProducerDashboard = (props: TeamBackOfficeProps<ProducerDashboardType>) => {
  return (
    <>
      <div className="col-12 mt-5 tbo__dasboard">
        <LastDemandsExt team={props.currentTeam} />
        {/* <Revenus size="small" title="My Revenus small" /> */}
      </div>
      {/* <div className="col-12 mt-5 tbo__dasboard">
        <Revenus size="large" title="My Revenus large" />
      </div> */}
    </>
  );
};

type ConsumerDashboardType = {};
const ConsumerDashboard = (props: TeamBackOfficeProps<ConsumerDashboardType>) => {
  return (
    <div className="col-12 mt-5 tbo__dasboard">
      <LastDemands team={props.currentTeam} />
    </div>
  );
};
