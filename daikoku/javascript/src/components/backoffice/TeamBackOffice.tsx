import classNames from "classnames";
import { PropsWithChildren, ReactNode, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { toast } from 'sonner';

import { I18nContext, useTeamBackOffice } from "../../contexts";
import { ITeamSimple, isError } from "../../types";
import {
  TeamApiKeyConsumption,
  TeamApiKeys,
  TeamApiKeysForApi,
  TeamAssets,
  TeamBilling,
  TeamConsumption,
  TeamEdit,
  TeamIncome,
  TeamMembers,
} from "../backoffice";
import { Can, Spinner, read, manage, api, apikey, asset, stat, team, backoffice } from "../utils";
import { LastDemands, LastDemandsExt } from "./widgets";
import { TeamApis } from "./apis/TeamApis";

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
              className={classNames("btn --secondary", {
                active: mode === "producer",
              })}
              onClick={() => setMode("producer")}
            >
              {translate('team.dashboard.label.producer')}
            </button>
            <button
              className={classNames("btn --secondary", {
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

/**
 * Route guard for the team back-office. Loads the current team and only renders
 * its children if the connected user has the required permission on it.
 * Otherwise it shows an "Unauthorized" toast and redirects the user away
 * (back to the team dashboard by default, or to `fallback` when given).
 */
type TeamRouteProps = {
  I: number;
  a: string;
  children: ReactNode;
  fallback?: string;
};
const TeamRoute = ({ I, a, children, fallback }: TeamRouteProps) => {
  const { teamId } = useParams();
  const { currentTeam, isLoading } = useTeamBackOffice();

  if (isLoading) {
    return <Spinner />;
  }

  // Not a team we can read (unknown team / not a member): get out.
  if (!currentTeam || isError(currentTeam)) {
    return <Navigate to="/" replace />;
  }

  return (
    <Can
      I={I}
      a={a}
      team={currentTeam}
      dispatchError
      orElse={<Navigate to={fallback ?? `/${teamId}/settings/dashboard`} replace />}
    >
      {children}
    </Can>
  );
};

export const TeamBackOffice = () => {

  return (
    <div className="row">
      <main role="main" className="ml-sm-auto px-4 mt-3">
        <BackOfficeContent>
          <Routes>
            <Route path={`/edition`} element={<TeamRoute I={manage} a={team}><TeamEdit /></TeamRoute>} />
            <Route path={`/assets`} element={<TeamRoute I={manage} a={asset}><TeamAssets /></TeamRoute>} />

            <Route path={`/consumption`} element={<TeamRoute I={read} a={stat}><TeamConsumption /></TeamRoute>} />
            <Route path={`/billing`} element={<TeamRoute I={manage} a={team}><TeamBilling /></TeamRoute>} />
            <Route path={`/income`} element={<TeamRoute I={manage} a={team}><TeamIncome /></TeamRoute>} />
            <Route
              path={`/apikeys/:apiId/:versionId/subscription/:subscription/consumptions`}
              element={<TeamRoute I={read} a={apikey}><TeamApiKeyConsumption /></TeamRoute>}
            />
            <Route
              path={`/apikeys/:apiId/:versionId`}
              element={<TeamRoute I={read} a={apikey}><TeamApiKeysForApi /></TeamRoute>}
            />
            <Route path={`/apikeys`} element={<TeamRoute I={read} a={apikey}><TeamApiKeys /></TeamRoute>} />
            <Route path={`/members`} element={<TeamRoute I={read} a={team}><TeamMembers /></TeamRoute>} />
            <Route path={`/apis`} element={<TeamRoute I={read} a={api}><TeamApis /></TeamRoute>} />
            <Route path="/dashboard" element={<TeamRoute I={read} a={backoffice} fallback="/"><TeamBackOfficeHome /></TeamRoute>} />
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
