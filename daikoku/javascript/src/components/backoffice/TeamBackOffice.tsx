import React, { useContext, useEffect, useState } from 'react';
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

const BackOfficeContent = (props: any) => {
  return (
    <div className="" style={{ height: '100%' }}>
      {!props.error.status && props.children}
    </div>
  );
};

const TeamBackOfficeHome = () => {
  const { currentTeam } = useSelector((state) => (state as any).context);
  useTeamBackOffice(currentTeam);

  const { Translation } = useContext(I18nContext);
  const [team, setTeam] = useState();

  useEffect(() => {
    Services.teamHome(currentTeam._id).then(setTeam);

    document.title = `${currentTeam.name}`;
  }, []);

  if (!team) {
    return null;
  }

  return (<div className="row">
    <div className="col">
      <h1>
        {currentTeam.name}
        <a className="ms-1 btn btn-sm btn-access-negative" title="View this Team" href={`/${currentTeam._humanReadableId}`}>
          <i className="fas fa-eye"></i>
        </a>
      </h1>
      <div className="d-flex justify-content-center align-items-center col-12 mt-5">
        <div className="home-tiles d-flex justify-content-center align-items-center flex-wrap">
          <Link to={`/${currentTeam._humanReadableId}/settings/apis`} className="home-tile">
            <span className="home-tile-number">{(team as any).apisCount}</span>
            <span className="home-tile-text">
              <Translation i18nkey="apis published" count={(team as any).apisCount}>
                apis published
              </Translation>
            </span>
          </Link>
          <Link to={`/${currentTeam._humanReadableId}/settings/apikeys`} className="home-tile">
            <span className="home-tile-number">{(team as any).subscriptionsCount}</span>
            <span className="home-tile-text">
              <Translation i18nkey="apis subcriptions" count={(team as any).subscriptionsCount}>
                apis subcriptions
              </Translation>
            </span>
          </Link>
          <Link
            to={currentTeam.type === 'Personal' ? '#' : `/${currentTeam._humanReadableId}/settings/members`}
            className="home-tile">
            {currentTeam.type !== 'Personal' ? (<>
              <span className="home-tile-number">{(team as any).users.length}</span>
              <span className="home-tile-text">
                <Translation i18nkey="members" count={(team as any).users.length}>
                  members
                </Translation>
              </span>
            </>) : (<>
              <span className="home-tile-number">{1}</span>
              <span className="home-tile-text">
                <Translation i18nkey="members" count={1}>
                  members
                </Translation>
              </span>
            </>)}
          </Link>
          <Link to={'/notifications'} className="home-tile">
            <span className="home-tile-number">{(team as any).notificationCount}</span>
            <span className="home-tile-text">
              <Translation i18nkey="unread notifications" count={(team as any).notificationCount}>
                unread notifications
              </Translation>
            </span>
          </Link>
        </div>
      </div>
    </div>
  </div>);
};

export const TeamBackOffice = ({
  isLoading,
  title
}: any) => {
  const { currentTeam } = useSelector((s) => (s as any).context);
  const error = useSelector((s) => (s as any).error);

  useEffect(() => {
    if (title) {
      document.title = title;
    }
  }, [title]);

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
            <Route path={`/apis/:apiId/:versionId/:tab/*`} element={<TeamApi />} />
            <Route path={`/apis/:apiId/:tab`} element={<TeamApi creation />} />
            <Route path={`/apigroups/:apiGroupId/:tab/*`} element={<TeamApiGroup />} />
            <Route path={`/apis`} element={<TeamApis />} />
            <Route path="/" element={<TeamBackOfficeHome />} />
          </Routes>
        </BackOfficeContent>
      </main>
    </div>
  );
};
