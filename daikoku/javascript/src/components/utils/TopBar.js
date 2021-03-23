import React, { useState, useEffect } from 'react';
import _ from 'lodash';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import classNames from 'classnames';
import Select, { components } from 'react-select';
import AsyncSelect from 'react-select/async';
import { Sun, Moon } from 'react-feather';

import * as Services from '../../services';
import { logout, updateNotications, udpateLanguage, updateTenant } from '../../core/context/actions';
import { t, Translation, languages } from '../../locales';
import { Can, manage, daikoku, tenant } from '../utils';
import { MessagesTopBarTools } from '../backoffice/messages';

const GuestUserMenu = ({ loginProvider, loginAction, user, currentLanguage }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');

  switch (loginProvider) {
    case 'Local':
    case 'LDAP':
      return (
        <div className="d-flex justify-content-end mt-1 mt-lg-0">
          <div className="dropdown">
            <img
              style={{ width: 38, marginLeft: '5px' }}
              src={user.picture}
              className="dropdown-toggle logo-anonymous user-logo"
              data-toggle="dropdown"
              alt="user menu"
            />
            <div className="dropdown-menu dropdown-menu-right" style={{ width: '300px' }}>
              <form className="form-horizontal text-left mx-1" action={loginAction} method="POST">
                <div className="form-group">
                  <label htmlFor="username">
                    <Translation i18nkey="Email address" language={currentLanguage}>
                      Email address
                    </Translation>
                  </label>
                  <input
                    id="username"
                    type="text"
                    name="username"
                    className="form-control"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="password">
                    <Translation i18nkey="Password" language={currentLanguage}>
                      Password
                    </Translation>
                  </label>
                  <input
                    id="password"
                    type="password"
                    name="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <small className="form-text text-muted">
                    <a href="/reset">
                      <Translation i18nkey="Forgot your password ?" language={currentLanguage}>
                        Forgot your password ?
                      </Translation>
                    </a>
                  </small>
                </div>
                <button type="submit" className="btn btn-access-negative" style={{ marginLeft: 0 }}>
                  <Translation i18nkey="Login" language={currentLanguage}>
                    Login
                  </Translation>
                </button>
              </form>
              <div className="dropdown-divider" />
              <a className="dropdown-item" href="/signup">
                <Translation i18nkey="Create account" language={currentLanguage}>
                  Create account
                </Translation>
              </a>
            </div>
          </div>
        </div>
      );
    case 'OAuth2':
    default:
      return (
        <div className="d-flex justify-content-end mt-1 mt-lg-0">
          <div className="dropdown">
            <img
              style={{ width: 38, marginLeft: '5px' }}
              src={user.picture}
              className="dropdown-toggle logo-anonymous user-logo"
              data-toggle="dropdown"
              alt="user menu"
            />
            <div className="dropdown-menu dropdown-menu-right" style={{ width: '300px' }}>
              <a className="dropdown-item" href={`/auth/${loginProvider}/login`}>
                sign-in
              </a>
            </div>
          </div>
        </div>
      );
  }
};

const DarkModeActivator = ({ initialDark }) => {
  const DARK = 'DARK';
  const LIGHT = 'LIGHT';

  const [theme, setTheme] = useState(initialDark || localStorage.getItem('theme') || LIGHT);

  useEffect(() => {
    if (theme === DARK) {
      document.documentElement.setAttribute('data-theme', DARK);
      localStorage.setItem('theme', DARK);
    } else {
      document.documentElement.setAttribute('data-theme', LIGHT);
      localStorage.setItem('theme', LIGHT);
    }
  }, [theme]);

  return (
    <div
      className="cursor-pointer d-flex align-items-center darkmode"
      onClick={() => setTheme(theme === DARK ? LIGHT : DARK)}>
      {theme === DARK ? <Sun /> : <Moon />}
    </div>
  );
};

const TopBarComponent = (props) => {
  const [teams, setTeams] = useState([]);
  const isMaintenanceMode = props.tenant.tenantMode && props.tenant.tenantMode !== 'Default';

  useEffect(() => {
    Promise.all([
      Services.myUnreadNotificationsCount(),
      Services.teams()
    ])
      .then(([unreadNotifications, teams]) => {
        props.updateNotificationsCount(unreadNotifications.count);
        setTeams(teams);
      });
  }, []);


  const selectSearchedItem = (item) => {
    const team = teams.find((t) => t._id === item.team);
    switch (item.type) {
      case 'link':
        props.history.push(item.url);
        break;
      case 'tenant':
        props.history.push(`/settings/tenants/${item.value}`);
        break;
      case 'team':
        props.history.push(`/${item.value}`);
        break;
      case 'api':
        props.history.push(`/${team ? team._humanReadableId : item.team}/${item.value}`);
        break;
    }
  };

  const toggleMaintenanceMode = () => {
    const toggleApi = isMaintenanceMode ? Services.disableMaintenanceMode : Services.enableMaintenanceMode;

    toggleApi()
      .then(maybeTenant => {
        if (maybeTenant._id) {
          props.updateTenant(maybeTenant);
        }
      });
  };

  const reset = () => {
    fetch('/api/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '',
    }).then(() => {
      window.location.reload();
    });
  };

  if (!props.connectedUser) {
    return null;
  }

  const { impersonator, unreadNotificationsCount } = props;

  const impersonatorStyle = impersonator
    ? { border: '3px solid red', boxShadow: '0px 0px 5px 2px red' }
    : {};

  const promiseOptions = (inputValue) => {
    const options = [
      {
        value: 'me',
        label: t('My profile', props.currentLanguage),
        type: 'link',
        url: '/settings/me',
      },
    ];
    if (props.connectedUser.isDaikokuAdmin)
      options.push({
        value: 'daikoku',
        label: t('Daikoku settings', props.currentLanguage),
        type: 'link',
        url: `/settings/tenants/${props.tenant._humanReadableId}`,
      });

    const utils = {
      label: 'Daikoku',
      options: options.filter((i) => i.label.toLowerCase().includes(inputValue.toLowerCase())),
    };

    return Services.search(inputValue).then((result) => [
      utils,
      ...result.map((item) => ({ ...item, label: t(item.label, props.currentLanguage) })),
    ]);
  };

  const isDefaultLogo = props.tenant.logo === '/assets/images/daikoku.svg';
  return (
    <header className={impersonator ? 'impersonator-topbar-mb' : ''}>
      {}
      <div className="navbar shadow-sm fixed-top">
        <div className="container-fluid d-flex justify-content-center justify-content-lg-between align-items-end">
          <div className="d-flex flex-column flex-md-row">
            <div className="pl-1 pr-2">
              <Link
                to="/"
                className="navbar-brand d-flex align-items-center mr-4"
                title="Daikoku home"
                style={{
                  maxWidth: '59px',
                  maxHeight: '38px',
                }}>
                {props.tenant.logo && !isDefaultLogo && (
                  <img
                    src={props.tenant.logo}
                    style={{
                      height: 'auto',
                      maxWidth: '100%',
                    }}
                  />
                )}
                {(!props.tenant.logo || !!isDefaultLogo) && props.tenant.name}
              </Link>
            </div>
            {!props.connectedUser.isGuest && (
              <div className="input-group">
                <div className="input-group-prepend d-none d-lg-flex">
                  <div className="input-group-text">
                    <i className="fas fa-search" />
                  </div>
                </div>
                <AsyncSelect
                  placeholder={t('Search', props.currentLanguage)}
                  className="general-search px-1 px-lg-0"
                  cacheOptions
                  defaultOptions
                  components={(props) => <components.Group {...props} />}
                  loadOptions={_.debounce(promiseOptions, 100, { leading: true })}
                  onChange={selectSearchedItem}
                  classNamePrefix="reactSelect"
                />
              </div>
            )}
          </div>
          <div className="d-flex flex-column flex-md-row mt-1 mt-xl-0">
            {props.impersonator && (
              <a href="/api/me/_deimpersonate" className="btn btn-danger">
                <i className="fas fa-user-ninja" />{' '}
                {t('Quit impersonation', props.currentLanguage)}
                <b className="ml-1">{impersonator.email}</b>
              </a>
            )}
            {!props.connectedUser._humanReadableId && (
              <Select
                className="language-selector"
                value={languages.find((l) => l.value === props.currentLanguage)}
                placeholder="Select a language"
                options={languages}
                onChange={(e) => props.udpateLanguageProp(e.value)}
                classNamePrefix="reactSelect"
              />
            )}
            {props.connectedUser.isGuest && (
              <GuestUserMenu
                user={props.connectedUser}
                loginAction={props.loginAction}
                loginProvider={props.loginProvider}
                currentLanguage={props.currentLanguage}
              />
            )}
            {!props.connectedUser.isGuest && (
              <div className="d-flex justify-content-end align-items-center mt-1 mt-lg-0">
                {isMaintenanceMode && <span className="badge badge-danger mr-3">
                  {t('Global maintenance mode enabled', props.currentLanguage)}
                </span>}
                <DarkModeActivator />
                <Link
                  className={classNames({
                    'notification-link': true,
                    'unread-notifications': !!unreadNotificationsCount,
                  })}
                  to="/notifications"
                  title={t('Access to the notifications', props.currentLanguage)}>
                  <i className="fas fa-bell" />
                </Link>
                {(props.connectedUser.isDaikokuAdmin || props.isTenantAdmin) && (
                  <MessagesTopBarTools
                    currentLanguage={props.currentLanguage}
                    connectedUser={props.connectedUser}
                  />
                )}
                <div className="dropdown">
                  <img
                    style={{ width: 38, marginLeft: '5px', ...impersonatorStyle }}
                    src={props.connectedUser.picture}
                    className="dropdown-toggle logo-anonymous user-logo"
                    data-toggle="dropdown"
                    title={
                      impersonator
                        ? `${props.connectedUser.name} (${props.connectedUser.email
                        }) ${t('Impersonated by', props.currentLanguage)} ${impersonator.name
                        } (${impersonator.email})`
                        : props.connectedUser.name
                    }
                    alt="user menu"
                  />
                  <div className="dropdown-menu dropdown-menu-right">
                    <p className="dropdown-item">
                      {t('Logged in as', props.currentLanguage)} <b>{props.connectedUser.email}</b>
                    </p>
                    {props.impersonator && (
                      <p className="dropdown-item">
                        {t('Impersonated by')} <b>{props.impersonator.email}</b>
                      </p>
                    )}
                    <div className="dropdown-divider" />
                    <Link className="dropdown-item" to={'/settings/me'}>
                      <i className="fas fa-user" /> {t('My profile', props.currentLanguage)}
                    </Link>
                    {!props.tenant.hideTeamsPage && (
                      <>
                        <div className="dropdown-divider" />
                        <Link className="dropdown-item" to={'/teams'}>
                          <i className="fas fa-users" /> {t('All teams', props.currentLanguage)}
                        </Link>
                      </>
                    )}
                    <div className="dropdown-divider" />
                    <Can I={manage} a={tenant}>
                      <Link className="dropdown-item" to={'/settings/teams'}>
                        <i className="fas fa-cogs" /> {props.tenant.name}{' '}
                        {t('settings', props.currentLanguage)}
                      </Link>
                    </Can>
                    <Can I={manage} a={daikoku}>
                      <Link className="dropdown-item" to={'/settings/tenants'}>
                        <i className="fas fa-cogs" /> {t('Daikoku settings', props.currentLanguage)}
                      </Link>
                    </Can>
                    <Can I={manage} a={tenant}>
                      <div className="dropdown-divider" />
                    </Can>
                    {props.connectedUser.isDaikokuAdmin && <a className="dropdown-item" href="#" onClick={toggleMaintenanceMode}>
                      <i className="fas fa-lock" /> {t(isMaintenanceMode ? 'Disable maintenance' : 'Maintenance mode', props.currentLanguage)}
                    </a>}
                    {props.tenant.mode === 'Dev' && (
                      <a className="dropdown-item" href="#" onClick={reset}>
                        <i className="fas fa-skull-crossbones" /> {t('Reset', props.currentLanguage)}
                      </a>
                    )}
                    <a className="dropdown-item" href="/logout">
                      <i className="fas fa-sign-out-alt" /> {t('Logout', props.currentLanguage)}
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  logout: () => logout(),
  updateNotificationsCount: (count) => updateNotications(count),
  udpateLanguageProp: (l) => udpateLanguage(l),
  updateTenant: (t) => updateTenant(t),
};

export const TopBar = connect(mapStateToProps, mapDispatchToProps)(TopBarComponent);
