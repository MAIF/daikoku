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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="" style={{ height: '100%' }}>
      {!props.error.status && props.children}
    </div>
  );
};

const TeamBackOfficeHome = () => {
  const { currentTeam } = useSelector((state) => (state as any).context);
  useTeamBackOffice(currentTeam);

  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);
  const [team, setTeam] = useState();

  useEffect(() => {
    Services.teamHome(currentTeam._id).then(setTeam);

    document.title = `${currentTeam.name}`;
  }, []);

  if (!team) {
    return null;
  }

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div className="row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h1>
          {currentTeam.name}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <a className="ms-1 btn btn-sm btn-access-negative" title="View this Team" href={`/${currentTeam._humanReadableId}`}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-eye"></i>
          </a>
        </h1>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex justify-content-center align-items-center col-12 mt-5">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="home-tiles d-flex justify-content-center align-items-center flex-wrap">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Link to={`/${currentTeam._humanReadableId}/settings/apis`} className="home-tile">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className="home-tile-number">{(team as any).apisCount}</span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className="home-tile-text">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="apis published" count={(team as any).apisCount}>
                  apis published
                </Translation>
              </span>
            </Link>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Link to={`/${currentTeam._humanReadableId}/settings/apikeys`} className="home-tile">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className="home-tile-number">{(team as any).subscriptionsCount}</span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className="home-tile-text">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="apis subcriptions" count={(team as any).subscriptionsCount}>
                  apis subcriptions
                </Translation>
              </span>
            </Link>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Link to={currentTeam.type === 'Personal'
        ? '#'
        // @ts-expect-error TS(2322): Type '{ children: Element; to: string; className: ... Remove this comment to see the full error message
        : `/${currentTeam._humanReadableId}/settings/members`} className="home-tile" disabled={currentTeam.type === 'Personal' ? 'disabled' : null}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {currentTeam.type !== 'Personal' ? (<>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <span className="home-tile-number">{(team as any).users.length}</span>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <span className="home-tile-text">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Translation i18nkey="members" count={(team as any).users.length}>
                      members
                    </Translation>
                  </span>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                </>) : (<>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <span className="home-tile-number">{1}</span>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <span className="home-tile-text">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Translation i18nkey="members" count={1}>
                      members
                    </Translation>
                  </span>
                </>)}
            </Link>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Link to={'/notifications'} className="home-tile">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className="home-tile-number">{(team as any).notificationCount}</span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className="home-tile-text">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <main role="main" className="ml-sm-auto px-4 mt-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div
          className={classNames('back-office-overlay', {
            active: isLoading && !error.status,
          })}
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <BackOfficeContent error={error}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Routes>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path={`/edition`} element={<TeamEdit />} />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path={`/assets`} element={<TeamAssets />} />

            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path={`/consumption`} element={<TeamConsumption />} />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path={`/billing`} element={<TeamBilling />} />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path={`/income`} element={<TeamIncome />} />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route
              path={`/apikeys/:apiId/:versionId/subscription/:subscription/consumptions`}
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              element={<TeamApiKeyConsumption />}
            />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path={`/apikeys/:apiId/:versionId`} element={<TeamApiKeysForApi />} />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path={`/apikeys`} element={<TeamApiKeys />} />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path={`/members`} element={<TeamMembers />} />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path={`/apis/:apiId/:versionId/:tab/*`} element={<TeamApi />} />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path={`/apis/:apiId/:tab`} element={<TeamApi creation />} />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path={`/apigroups/:apiGroupId/:tab/*`} element={<TeamApiGroup />} />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path={`/apis`} element={<TeamApis />} />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path="/" element={<TeamBackOfficeHome />} />
          </Routes>
        </BackOfficeContent>
      </main>
    </div>
  );
};
