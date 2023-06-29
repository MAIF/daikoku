import classNames from "classnames";
import { useContext, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Route, Routes } from "react-router-dom";

import { useTeamBackOffice } from "../../contexts";
import { I18nContext } from "../../core";
import * as Services from "../../services";
import { IState, IStateError, ITeamSimple } from "../../types";
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
import { LastDemands, LastDemandsExt, Revenus } from "./widgets";

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

const TeamBackOfficeHome = () => {
  const currentTeam = useSelector<IState, ITeamSimple>(
    (state) => state.context.currentTeam
  );
  useTeamBackOffice(currentTeam);

  const { Translation } = useContext(I18nContext);
  const [team, setTeam] = useState<TeamHome>();
  const [mode, setMode] = useState<"producer" | "consumer">("consumer");

  useEffect(() => {
    Services.teamHome(currentTeam._id).then(setTeam);

    document.title = `${currentTeam.name}`;
  }, []);

  if (!team) {
    return null;
  }

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
            Producer
          </button>
          <button
            className={classNames("btn btn-outline-primary", {
              active: mode === "consumer",
            })}
            onClick={() => setMode("consumer")}
          >
            Consumer
          </button>
        </div>
        <div>
          {mode === "producer" && <ProducerDashboard />}
          {mode === "consumer" && <ConsumerDashboard />}
        </div>
      </div>
    </div>
  );
};

type TeamBackOfficeProps = {
  isLoading: boolean;
};
export const TeamBackOffice = ({ isLoading }: TeamBackOfficeProps) => {
  const currentTeam = useSelector<IState, ITeamSimple>(
    (s) => s.context.currentTeam
  );
  const error = useSelector<IState, IStateError>((s) => s.error);

  useEffect(() => {
    document.title = currentTeam.name;
  }, []);

  if (!currentTeam) {
    return null;
  }

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
            <Route path="/" element={<TeamBackOfficeHome />} />
          </Routes>
        </BackOfficeContent>
      </main>
    </div>
  );
};

type ProducerDashboardType = {};
const ProducerDashboard = (props: ProducerDashboardType) => {
  const currentTeam = useSelector<IState, ITeamSimple>(
    (state) => state.context.currentTeam
  );
  return (
    <>
      <div className="col-12 mt-5 tbo__dasboard">
        <LastDemandsExt team={currentTeam} />
        <Revenus size="small" title="My Revenus small" />
      </div>
      <div className="col-12 mt-5 tbo__dasboard">
        <Revenus size="large" title="My Revenus large" />
      </div>
    </>
  );
};

type ConsumerDashboardType = {};
const ConsumerDashboard = (props: ConsumerDashboardType) => {
  const currentTeam = useSelector<IState, ITeamSimple>(
    (state) => state.context.currentTeam
  );
  return (
    <div className="col-12 mt-5 tbo__dasboard">
      <LastDemands team={currentTeam} />
    </div>
  );
};
