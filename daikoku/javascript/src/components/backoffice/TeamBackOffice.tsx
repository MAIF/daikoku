import React, { PropsWithChildren, useContext, useEffect, useState } from 'react';
import classNames from 'classnames';
import { useSelector } from 'react-redux';
import { Link, Route, Routes } from 'react-router-dom';
import { useTeamBackOffice } from '../../contexts';
import { I18nContext } from '../../core';
import * as Services from '../../services';
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
} from '../backoffice';
import { IState, IStateError, ITeamSimple } from '../../types';
import { Spinner } from '../utils';
import { getApolloContext, gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { isError } from 'lodash';

const BackOfficeContent = (props) => {
  return (
    <div className="" style={{ height: '100%' }}>
      {!props.error.status && props.children}
    </div>
  );
};
type TeamHome = ITeamSimple & {
  apisCount: number
  subscriptionsCount: number
  notificationCount: number
}



const TeamBackOfficeHome = () => {
  const currentTeam = useSelector<IState, ITeamSimple>((state) => state.context.currentTeam);
  useTeamBackOffice(currentTeam);

  const { Translation } = useContext(I18nContext);
  const [team, setTeam] = useState<TeamHome>();

  useEffect(() => {
    Services.teamHome(currentTeam._id)
      .then(setTeam);

    document.title = `${currentTeam.name}`;
  }, []);

  if (!team) {
    return null;
  }

  return (<div className="row">
    <div className="col">
      <div className="col-12 mt-5 tbo__dasboard">
        <LastDemandsExt team={currentTeam}/>
        <LastDemands team={currentTeam}/>
      </div>
    </div>
  </div>);
};

type LastDemandsProps = {
  team: ITeamSimple
}
const LastDemandsExt = (props: LastDemandsProps) => {
  const { client } = useContext(getApolloContext());

  const GET_LAST_DEMANDS = gql`
    query GetLastDemands($teamId: String!, $limit: Int, $offset: Int) {
      subscriptionDemandsForAdmin(teamId: $teamId , limit: $limit, offset: $offset) {
        count
        subscriptionDemands {
          api {
            name
          }
          plan {
            customName
            type
          }
          state
          team {
            name
          }
          from {
            name
          }
          date
        }
      }
    }
  `

  const {isLoading, isError, data} = useQuery(["widget", "widget_last_demands_ext"],  () => client?.query({
    query: GET_LAST_DEMANDS,
    variables: {teamId: props.team._id, offset: 0, limit: 5}
  }))


  return (
    <Widget isLoading={isLoading} isError={isError} size="small" title="In Progress demands">
      <div>
      {data?.data && data.data.subscriptionDemandsForAdmin.count === 0 && <span>no demands</span>}
      {data?.data && data.data.subscriptionDemandsForAdmin.count > 0 && data.data.subscriptionDemandsForAdmin.subscriptionDemands.map((d: any) => {
        return (
          <span>{d.api.name}</span>
        )
      })}
      </div>
    </Widget>
  )
}
const LastDemands = (props: LastDemandsProps) => {
  const GET_TEAM_LAST_DEMANDS = gql`
    query GetTeamLastDemands($teamId: String!, $limit: Int, $offset: Int) {
      teamSubscriptionDemands(teamId: $teamId , limit: $limit, offset: $offset) {
        count
        subscriptionDemands {
          api {
            name
          }
          plan {
            customName
            type
          }
          state
          team {
            name
          }
          from {
            name
          }
          date
        }
      }
    }
  `
  const { client } = useContext(getApolloContext());
  const {isLoading, isError, data} = useQuery(["widget", "widget_team_last_demands"],  () => client?.query({
    query: GET_TEAM_LAST_DEMANDS,
    variables: {teamId: props.team._id, offset: 0, limit: 5}
  }))

  return (
    <Widget isLoading={isLoading} isError={isError} size="small" title="My InProgress demands">
      <div>
      {data?.data && data.data.teamSubscriptionDemands.count === 0 && <span>no demands</span>}
      {data?.data && data.data.teamSubscriptionDemands.count > 0 && data.data.teamSubscriptionDemands.subscriptionDemands.map((d: any) => {
        return (
          <span>{d.api.name}</span>
        )
      })}
      </div>
    </Widget>
  )
}

type WidgetProps = {
  isLoading: boolean
  isError: boolean
  size: "small" | "large"
  title: string
}
const Widget = (props: PropsWithChildren<WidgetProps>) => {
  const isOk = !props.isLoading && !isError
  return (
    <div className={classNames("widget", props.size)}>
      <h4>{props.title}</h4>
      {props.isLoading && <Spinner />}
      {props.isError && <div className='error'>oops</div>}
      {!isOk && <>{props.children}</>}
    </div>
  )
}




type TeamBackOfficeProps = {
  isLoading: boolean
}
export const TeamBackOffice = ({
  isLoading,
}: TeamBackOfficeProps) => {
  const currentTeam = useSelector<IState, ITeamSimple>((s) => s.context.currentTeam);
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
          className={classNames('back-office-overlay', {
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
            <Route path={`/apikeys/:apiId/:versionId`} element={<TeamApiKeysForApi />} />
            <Route path={`/apikeys`} element={<TeamApiKeys />} />
            <Route path={`/members`} element={<TeamMembers />} />
            <Route path={`/apis/:apiId/:versionId/:tab/*`} element={<TeamApi creation={false} />} />
            <Route path={`/apis/:apiId/:tab`} element={<TeamApi creation={true} />} />
            <Route path={`/apigroups/:apiGroupId/:tab/*`} element={<TeamApiGroup />} />
            <Route path={`/apis`} element={<TeamApis />} />
            <Route path="/" element={<TeamBackOfficeHome />} />
          </Routes>
        </BackOfficeContent>
      </main>
    </div>
  );
};
