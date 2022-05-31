import React, { useContext, useEffect, useState } from 'react';
import classNames from 'classnames';
import { useSelector } from 'react-redux';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
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
import { Can, daikoku, manage, tenant as TENANT } from '../utils';

const BackOfficeContent = (props) => {
  return (
    <div className="" style={{ height: '100%' }}>
      {!props.error.status && props.children}
    </div>
  );
};

const TeamBackOfficeHome = () => {
  const { currentTeam } = useSelector((state) => state.context);
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

  return (
    <div className="row">
      <div className="col">
        <h1>
          {currentTeam.name}
          <a
            className="ms-1 btn btn-sm btn-access-negative"
            title="View this Team"
            href={`/${currentTeam._humanReadableId}`}
          >
            <i className="fas fa-eye"></i>
          </a>
        </h1>
        <div className="d-flex justify-content-center align-items-center col-12 mt-5">
          <div className="home-tiles d-flex justify-content-center align-items-center flex-wrap">
            <Link to={`/${currentTeam._humanReadableId}/settings/apis`} className="home-tile">
              <span className="home-tile-number">{team.apisCount}</span>
              <span className="home-tile-text">
                <Translation i18nkey="apis published" count={team.apisCount}>
                  apis published
                </Translation>
              </span>
            </Link>
            <Link to={`/${currentTeam._humanReadableId}/settings/apikeys`} className="home-tile">
              <span className="home-tile-number">{team.subscriptionsCount}</span>
              <span className="home-tile-text">
                <Translation i18nkey="apis subcriptions" count={team.subscriptionsCount}>
                  apis subcriptions
                </Translation>
              </span>
            </Link>
            <Link
              to={
                currentTeam.type === 'Personal'
                  ? '#'
                  : `/${currentTeam._humanReadableId}/settings/members`
              }
              className="home-tile"
              disabled={currentTeam.type === 'Personal' ? 'disabled' : null}
            >
              {currentTeam.type !== 'Personal' ? (
                <>
                  <span className="home-tile-number">{team.users.length}</span>
                  <span className="home-tile-text">
                    <Translation i18nkey="members" count={team.users.length}>
                      members
                    </Translation>
                  </span>
                </>
              ) : (
                <>
                  <span className="home-tile-number">{1}</span>
                  <span className="home-tile-text">
                    <Translation i18nkey="members" count={1}>
                      members
                    </Translation>
                  </span>
                </>
              )}
            </Link>
            <Link to={'/notifications'} className="home-tile">
              <span className="home-tile-number">{team.notificationCount}</span>
              <span className="home-tile-text">
                <Translation i18nkey="unread notifications" count={team.notificationCount}>
                  unread notifications
                </Translation>
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TeamBackOffice = ({ isLoading, title }) => {
  const { currentTeam } = useSelector((s) => s.context);
  const error = useSelector((s) => s.error);

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

export const UserBackOffice = ({ tab, title, notificationSubMenu, isLoading, children }) => {
  useEffect(() => {
    if (title) {
      document.title = title;
    }
  }, [title]);

  const { tenant } = useSelector((s) => s.context);
  const error = useSelector((s) => s.error);

  const location = useLocation();
  const { translateMethod, Translation } = useContext(I18nContext);

  if (location.pathname !== '/settings/pages' && location.pathname.startsWith('/settings/pages'))
    return (
      <main role="main" className="col-md-9 offset-md-3 d-flex">
        <div className={classNames('back-office-overlay', { active: isLoading })} />
        {!error.status && children}
      </main>
    );

  return (
    <div className="row">
      <button
        id="toggle-sidebar"
        type="button"
        className="navbar-toggle btn btn-sm btn-access-negative float-left me-2"
        data-toggle="collapse"
        data-target="#sidebar"
        aria-expanded="false"
        aria-controls="sidebar"
      >
        <span className="sr-only">Toggle sidebar</span>
        <span className="chevron" />
      </button>
      <nav className="col-md-2 d-md-block sidebar collapse" id="sidebar">
        <div className="sidebar-sticky">
          <ul className="nav flex-column mt-3">
            <li className="nav-item">
              <Link className={`nav-link ${tab === 'Me' ? 'active' : ''}`} to={'/settings/me'}>
                <i className="fas fa-user" />
                <Translation i18nkey="My profile">My profile</Translation>
              </Link>
            </li>
            <li className="nav-item">
              <Link
                className={`nav-link ${tab === 'Notifications' ? 'active' : ''}`}
                to={'/notifications'}
              >
                <i className="fas fa-bell" />
                <Translation i18nkey="Notifications">Notifications</Translation>
              </Link>
              {notificationSubMenu || null}
            </li>
          </ul>

          <Can I={manage} a={TENANT}>
            <h6 className="sidebar-heading d-flex justify-content-between align-items-center px-3 mt-4 mb-1 text-muted">
              <Translation i18nkey="Tenant administration">Tenant administration</Translation>
              <Link
                to={`/settings/tenants/${tenant._humanReadableId}`}
                className=""
                title={translateMethod('Update tenant')}
              >
                <i className="fas fa-pen" />
              </Link>
            </h6>
            <ul className="nav flex-column mb-2">
              <li className="nav-item">
                <Link
                  className={`nav-link ${tab === 'Messages' ? 'active' : ''}`}
                  to={'/settings/messages'}
                >
                  <i className="fas fa-comment-alt" />
                  <Translation i18nkey="Message" isPlural>
                    Messages
                  </Translation>
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link ${tab === 'Otoroshi' ? 'active' : ''}`}
                  to={'/settings/otoroshis'}
                >
                  <i className="fas fa-pastafarianism" />
                  <Translation i18nkey="Otoroshi instance" isPlural>
                    Otoroshi instances
                  </Translation>
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`me-1 nav-link ${tab === 'Admins' ? 'active' : ''}`}
                  to={'/settings/admins'}
                >
                  <i className="fas fa-user-shield me-1" />
                  <Translation i18nkey="Admins">Admins</Translation>
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link ${tab === 'Audit trail' ? 'active' : ''}`}
                  to={'/settings/audit'}
                >
                  <i className="fas fa-book" />
                  <Translation i18nkey="Audit trail">Audit trail</Translation>
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link ${tab === 'Teams' ? 'active' : ''}`}
                  to={'/settings/teams'}
                >
                  <i className="fas fa-user-friends" />
                  <Translation i18nkey="Teams">Teams</Translation>
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link ${tab === 'Assets' ? 'active' : ''}`}
                  to={'/settings/assets'}
                >
                  <i className="fas fa-tools" />
                  <Translation i18nkey="Tenant assets">Tenant assets</Translation>
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link ${tab === 'Initialization' ? 'active' : ''}`}
                  to={'/settings/init'}
                >
                  <i className="fas fa-cloud-download-alt" />
                  <Translation i18nkey="Initialization">Initalization</Translation>
                </Link>
              </li>
              <li className="nav-item">
                <NavLink
                  className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
                  to={'/settings/internationalization/mail'}
                >
                  <i className="fas fa-language" />
                  <Translation i18nkey="Internationalization">Internationalization</Translation>
                </NavLink>
              </li>
              <li className="nav-item">
                <NavLink
                  className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
                  to={'/settings/pages'}
                >
                  <i className="fas fa-pager" />
                  <Translation i18nkey="Pages">Pages</Translation>
                </NavLink>
              </li>
            </ul>
          </Can>

          <Can I={manage} a={daikoku}>
            <h6 className="sidebar-heading d-flex justify-content-between align-items-center px-3 mt-4 mb-1 text-muted">
              <span>
                <Translation i18nkey="Daikoku administration">Daikoku administration</Translation>
              </span>
            </h6>
            <ul className="nav flex-column mb-2">
              <li className="nav-item">
                <Link
                  className={`nav-link ${tab === 'Tenants' ? 'active' : ''}`}
                  to={'/settings/tenants'}
                >
                  <i className="fas fa-globe" />

                  <Translation i18nkey="Tenants">Tenants</Translation>
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link ${tab === 'Users' ? 'active' : ''}`}
                  to={'/settings/users'}
                >
                  <i className="fas fa-users" />
                  <Translation i18nkey="Users">Users</Translation>
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link ${tab === 'User sessions' ? 'active' : ''}`}
                  to={'/settings/sessions'}
                >
                  <i className="fas fa-address-card" />
                  <Translation i18nkey="User sessions">User sessions</Translation>
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link ${tab === 'Import / Export' ? 'active' : ''}`}
                  to={'/settings/import-export'}
                >
                  <i className="fas fa-download" />
                  <Translation i18nkey="Import / Export">Import / Export</Translation>
                </Link>
              </li>
            </ul>
          </Can>
        </div>
      </nav>
      <main role="main" className="col-md-9 offset-md-2 px-4">
        <div className={classNames('back-office-overlay', { active: isLoading })} />
        <BackOfficeContent error={error}>{children}</BackOfficeContent>
      </main>
    </div>
  );
};
