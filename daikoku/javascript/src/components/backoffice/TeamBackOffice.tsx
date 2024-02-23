import classNames from "classnames";
import { PropsWithChildren, useContext, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { toast } from 'sonner';

import { I18nContext, useTeamBackOffice } from "../../contexts";
import { ITeamSimple, isError } from "../../types";
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

const BackOfficeContent = (props: PropsWithChildren) => {

  return (
    <div style={{ height: "100%" }}>
      {props.children}
    </div>
  );
};

const TeamBackOfficeHome = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice()

  const { translate } = useContext(I18nContext);
  const [mode, setMode] = useState<"producer" | "consumer">("consumer");

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name}`;
  }, [currentTeam]);

  if (isLoading) {
    return <Spinner />
  } else if (currentTeam && !isError(currentTeam)) {
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
            {mode === "producer" && <ProducerDashboard currentTeam={currentTeam} />}
            {mode === "consumer" && <ConsumerDashboard currentTeam={currentTeam} />}
          </div>
        </div>
      </div>
    );
  } else {
    toast.error(error?.message || currentTeam?.error)
    return <></>;
  }


};

export const TeamBackOffice = () => {

  return (
    <div className="row">
      <main role="main" className="ml-sm-auto px-4 mt-3">
        <BackOfficeContent>
          <Routes>
            <Route path={`/edition`} element={<TeamEdit />} />
            <Route path={`/assets`} element={<TeamAssets />} />

            <Route path={`/consumption`} element={<TeamConsumption />} />
            <Route path={`/billing`} element={<TeamBilling />} />
            <Route path={`/income`} element={<TeamIncome />} />
            <Route
              path={`/apikeys/:apiId/:versionId/subscription/:subscription/consumptions`}
              element={<TeamApiKeyConsumption />}
            />
            <Route
              path={`/apikeys/:apiId/:versionId`}
              element={<TeamApiKeysForApi />}
            />
            <Route path={`/apikeys`} element={<TeamApiKeys />} />
            <Route path={`/members`} element={<TeamMembers />} />
            <Route
              path={`/apis/:apiId/:versionId/:tab/*`}
              element={<TeamApi creation={false} />}
            />
            <Route
              path={`/apis/:apiId/:tab`}
              element={<TeamApi creation={true} />}
            />
            <Route
              path={`/apigroups/:apiGroupId/:tab/*`}
              element={<TeamApiGroup />}
            />
            <Route path={`/apis`} element={<TeamApis />} />
            <Route path="/dashboard" element={<TeamBackOfficeHome />} />
          </Routes>
        </BackOfficeContent>
      </main>
    </div>
  );
};

type ProducerDashboardType = { currentTeam: ITeamSimple };
const ProducerDashboard = (props: ProducerDashboardType) => {
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

type ConsumerDashboardType = { currentTeam: ITeamSimple };
const ConsumerDashboard = (props: ConsumerDashboardType) => {
  return (
    <div className="col-12 mt-5 tbo__dasboard">
      <LastDemands team={props.currentTeam} />
    </div>
  );
};
