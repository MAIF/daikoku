import React, { useState, useEffect, useContext } from 'react';
import _ from 'lodash';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import classNames from 'classnames';
import Select, { components } from 'react-select';
import AsyncSelect from 'react-select/async';
import { Sun, Moon } from 'react-feather';

import * as Services from '../../services';
import {
  logout,
  updateNotications,
  updateTenant,
} from '../../core/context/actions';
import { languages } from '../../locales';
import { Can, manage, daikoku, tenant } from '../utils';
import { MessagesTopBarTools } from '../backoffice/messages';
import { I18nContext } from '../../locales/i18n-context';

const GuestUserMenu = ({ loginProvider }) => {
  const { translateMethod } = useContext(I18nContext)

  return <>
    <a href={`/auth/${loginProvider}/login`} className="btn btn-outline-success mx-1 login-button">
      {translateMethod('Login')}
    </a>
    <a
      href={`${loginProvider === 'Local' ? '/signup' : `/auth/${loginProvider}/login`}`}
      className="btn btn-success register-button">
      {translateMethod('Register')}
    </a>
  </>
}

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
  const [daikokuVersion, setVersion] = useState(null);

  const isTranslationMode = props.tenant.tenantMode && props.tenant.tenantMode === "Translation";
  const isMaintenanceMode = props.tenant.tenantMode && props.tenant.tenantMode !== 'Default' && !isTranslationMode;

  useEffect(() => {
    Promise.all([Services.myUnreadNotificationsCount(), Services.teams()]).then(
      ([unreadNotifications, teams]) => {
        props.updateNotificationsCount(unreadNotifications.count);
        setTeams(teams);
      }
    );
  }, []);

  const { translateMethod, setLanguage, language } = useContext(I18nContext);

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

  function getDaikokuVersion() {
    Services.getDaikokuVersion().then((res) => setVersion(res.version));
  }

  const toggleMaintenanceMode = () => {
    const toggleApi = isMaintenanceMode
      ? Services.disableMaintenanceMode
      : Services.enableMaintenanceMode;

    toggleApi().then((maybeTenant) => {
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
        label: translateMethod('My profile'),
        type: 'link',
        url: '/settings/me',
      },
    ];
    if (props.connectedUser.isDaikokuAdmin)
      options.push({
        value: 'daikoku',
        label: translateMethod('Daikoku settings'),
        type: 'link',
        url: `/settings/tenants/${props.tenant._humanReadableId}`,
      });

    const utils = {
      label: 'Daikoku',
      options: options.filter((i) => i.label.toLowerCase().includes(inputValue.toLowerCase())),
    };

    return Services.search(inputValue).then((result) => [
      utils,
      ...result.map((item) => ({ ...item, label: translateMethod(item.label) })),
    ]);
  };

  const isDefaultLogo = props.tenant.logo === '/assets/images/daikoku.svg';
  return (
    <header className={impersonator ? 'impersonator-topbar-mb' : ''}>
      { }
      <div className="navbar shadow-sm fixed-top">
        <div className="container-fluid d-flex justify-content-center justify-content-lg-between align-items-end px-0">
          <div className="d-flex flex-column flex-md-row">
            <div className="pl-1 pr-2">
              <Link
                to="/apis"
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
                  placeholder={translateMethod('Search')}
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
                <i className="fas fa-user-ninja" /> {translateMethod('Quit impersonation')}
                <b className="ml-1">{impersonator.email}</b>
              </a>
            )}
            {!props.connectedUser._humanReadableId && (
              <Select
                className="language-selector"
                value={languages.find((l) => l.value === language)}
                placeholder="Select a language"
                options={languages}
                onChange={(e) => setLanguage(e.value)}
                classNamePrefix="reactSelect"
              />
            )}
            {props.connectedUser.isGuest && (
              <GuestUserMenu
                loginProvider={props.loginProvider}
              />
            )}
            {!props.connectedUser.isGuest && (
              <div className="d-flex justify-content-end align-items-center mt-1 mt-lg-0">
                <Can I={manage} a={tenant} isTenantAdmin={props.connectedUser.isDaikokuAdmin ||
                  (props.tenant.admins || []).indexOf(props.connectedUser._id) > -1}>
                  {isMaintenanceMode && (
                    <span className="badge badge-danger mr-3">
                      {translateMethod('Global maintenance mode enabled')}
                    </span>
                  )}
                  {isTranslationMode && (
                    <span className="badge badge-warning mr-3">
                      {translateMethod('Translation mode enabled')}
                    </span>
                  )}
                </Can>
                <DarkModeActivator />
                <Link
                  className={classNames({
                    'notification-link': true,
                    'unread-notifications': !!unreadNotificationsCount,
                  })}
                  to="/notifications"
                  title={translateMethod('Access to the notifications')}>
                  <i className="fas fa-bell" />
                </Link>
                {(props.connectedUser.isDaikokuAdmin || props.isTenantAdmin) && (
                  <MessagesTopBarTools
                    connectedUser={props.connectedUser}
                  />
                )}
                <div className="dropdown" onClick={getDaikokuVersion}>
                  <img
                    style={{ width: 38, marginLeft: '5px', ...impersonatorStyle }}
                    src={props.connectedUser.picture}
                    className="dropdown-toggle logo-anonymous user-logo"
                    data-toggle="dropdown"
                    title={
                      impersonator
                        ? `${props.connectedUser.name} (${props.connectedUser.email}) ${translateMethod(
                          'Impersonated by'
                        )} ${impersonator.name} (${impersonator.email})`
                        : props.connectedUser.name
                    }
                    alt="user menu"
                  />
                  <div className="dropdown-menu dropdown-menu-right">
                    <p className="dropdown-item">
                      {translateMethod('Logged in as')} <b>{props.connectedUser.email}</b>
                    </p>
                    {props.impersonator && (
                      <p className="dropdown-item">
                        {translateMethod('Impersonated by')} <b>{props.impersonator.email}</b>
                      </p>
                    )}
                    <div className="dropdown-divider" />
                    <Link className="dropdown-item" to={'/settings/me'}>
                      <i className="fas fa-user" /> {translateMethod('My profile')}
                    </Link>
                    {!props.tenant.hideTeamsPage && (
                      <>
                        <div className="dropdown-divider" />
                        <Link className="dropdown-item" to={'/teams'}>
                          <i className="fas fa-users" /> {translateMethod('All teams')}
                        </Link>
                      </>
                    )}
                    <div className="dropdown-divider" />
                    <Can I={manage} a={tenant}>
                      <Link className="dropdown-item" to={'/settings/teams'}>
                        <i className="fas fa-cogs" /> {props.tenant.name}{' '}
                        {translateMethod('settings')}
                      </Link>
                    </Can>
                    <Can I={manage} a={daikoku}>
                      <Link className="dropdown-item" to={'/settings/tenants'}>
                        <i className="fas fa-cogs" /> {translateMethod('Daikoku settings')}
                      </Link>
                    </Can>
                    <Can I={manage} a={tenant}>
                      <div className="dropdown-divider" />
                    </Can>
                    {props.connectedUser.isDaikokuAdmin && (
                      <a className="dropdown-item" href="#" onClick={toggleMaintenanceMode}>
                        <i className="fas fa-lock" />{' '}
                        {translateMethod(isMaintenanceMode ? 'Disable maintenance' : 'Maintenance mode')}
                      </a>
                    )}
                    {props.tenant.mode === 'Dev' && (
                      <a className="dropdown-item" href="#" onClick={reset}>
                        <i className="fas fa-skull-crossbones" />{' '}
                        {translateMethod('Reset')}
                      </a>
                    )}
                    <a className="dropdown-item" href="/logout">
                      <i className="fas fa-sign-out-alt" /> {translateMethod('Logout')}
                    </a>

                    {daikokuVersion && (
                      <>
                        <div className="dropdown-divider" />
                        <div className="dropdown-item">
                          <span>
                            {translateMethod('Version used')} : {daikokuVersion}
                          </span>
                        </div>
                      </>
                    )}
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
  updateTenant: (t) => updateTenant(t),
};

export const TopBar = connect(mapStateToProps, mapDispatchToProps)(TopBarComponent);
