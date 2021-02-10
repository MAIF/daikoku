import React, { Component, useState, useEffect } from 'react';
import _ from 'lodash';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import classNames from 'classnames';
import Select, { components } from 'react-select';
import AsyncSelect from 'react-select/async';
import { Sun, Moon } from 'react-feather';

import * as Services from '../../services';
import { logout, updateNotications, udpateLanguage } from '../../core/context/actions';
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
export class TopBarComponent extends Component {
  state = {
    error: null,
    unreadNotifications: false,
    search: '',
    teams: [],
    isMaintenanceMode: false
  };

  componentDidCatch(e) {
    console.log('TopBarError', e);
  }

  removeError = () => {
    this.setState({ error: null });
  };

  selectSearchedItem = (item) => {
    const team = this.state.teams.find((t) => t._id === item.team);
    switch (item.type) {
      case 'link':
        this.props.history.push(item.url);
        break;
      case 'tenant':
        this.props.history.push(`/settings/tenants/${item.value}`);
        break;
      case 'team':
        this.props.history.push(`/${item.value}`);
        break;
      case 'api':
        this.props.history.push(`/${team ? team._humanReadableId : item.team}/${item.value}`);
        break;
    }
  };

  checkNavigationErrors = (props) => {
    if (props.location.state && props.location.state && props.location.state.error) {
      this.setState({ error: props.location.state.error });
    }
  };

  listenToSlash = (e) => {
    // in select : ref={r => (this.selector = r)}
    if (
      e.keyCode === 191 &&
      e.target.tagName.toLowerCase() !== 'input' &&
      e.target.className &&
      e.target.className.indexOf('ace_text-input') === -1
    ) {
      setTimeout(() => this.selector.focus());
    }
  };

  componentWillUnmount() {
    if (this.mounted) {
      this.mounted = false;
      document.removeEventListener('keydown', this.listenToSlash);
    }
  }

  componentDidMount() {
    if (!this.mounted) {
      this.mounted = true;
      document.addEventListener('keydown', this.listenToSlash, false);
    }

    Services.myUnreadNotificationsCount().then((unreadNotifications) => {
      this.props.updateNotificationsCount(unreadNotifications.count);
    });

    Services.teams().then((teams) => this.setState({ teams }));

    Services.isMaintenanceMode().then(res => this.setState({ isMaintenanceMode: res.isMaintenanceMode }))

    this.checkNavigationErrors(this.props);
  }

  UNSAFE_componentWillReceiveProps(next) {
    this.checkNavigationErrors(next);
  }

  userMenu = () => {
    const { isMaintenanceMode } = this.state;
    return (
      <div className="dropdown-menu dropdown-menu-right">
        <p className="dropdown-item">
          {t('Logged in as', this.props.currentLanguage)} <b>{this.props.connectedUser.email}</b>
        </p>
        {this.props.impersonator && (
          <p className="dropdown-item">
            {t('Impersonated by')} <b>{this.props.impersonator.email}</b>
          </p>
        )}
        <div className="dropdown-divider" />
        <Link className="dropdown-item" to={'/settings/me'}>
          <i className="fas fa-user" /> {t('My profile', this.props.currentLanguage)}
        </Link>
        {!this.props.tenant.hideTeamsPage && (
          <>
            <div className="dropdown-divider" />
            <Link className="dropdown-item" to={'/teams'}>
              <i className="fas fa-users" /> {t('All teams', this.props.currentLanguage)}
            </Link>
          </>
        )}
        <div className="dropdown-divider" />
        <Can I={manage} a={tenant}>
          <Link className="dropdown-item" to={'/settings/teams'}>
            <i className="fas fa-cogs" /> {this.props.tenant.name}{' '}
            {t('settings', this.props.currentLanguage)}
          </Link>
        </Can>
        <Can I={manage} a={daikoku}>
          <Link className="dropdown-item" to={'/settings/tenants'}>
            <i className="fas fa-cogs" /> {t('Daikoku settings', this.props.currentLanguage)}
          </Link>
        </Can>
        <Can I={manage} a={tenant}>
          <div className="dropdown-divider" />
        </Can>
        {this.props.connectedUser.isDaikokuAdmin && <a className="dropdown-item" href="#" onClick={isMaintenanceMode ? this.disableMaintenanceMode : this.enableMaintenanceMode}>
          <i className="fas fa-lock" /> {t(isMaintenanceMode ? 'Disable maintenance' : 'Maintenance mode', this.props.currentLanguage)}
        </a>}
        {this.props.tenant.mode === 'Dev' && (
          <a className="dropdown-item" href="#" onClick={this.reset}>
            <i className="fas fa-skull-crossbones" /> {t('Reset', this.props.currentLanguage)}
          </a>
        )}
        <a className="dropdown-item" href="/logout">
          <i className="fas fa-sign-out-alt" /> {t('Logout', this.props.currentLanguage)}
        </a>
      </div>
    );
  };

  enableMaintenanceMode = () => {
    fetch(`/api/state/lock`, { method: 'POST' })
      .then(() => {
        window.location.reload();
      });
  }

  disableMaintenanceMode = () => {
    fetch(`/api/state/unlock`, { method: 'POST' })
      .then(() => {
        window.location.reload();
      });
  }

  reset = () => {
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

  handleSearch = (search) => {
    this.setState({ search });
  };

  render() {
    if (!this.props.connectedUser) {
      return null;
    }

    const { impersonator, unreadNotificationsCount } = this.props;

    const impersonatorStyle = impersonator
      ? { border: '3px solid red', boxShadow: '0px 0px 5px 2px red' }
      : {};

    const promiseOptions = (inputValue) => {
      const options = [
        {
          value: 'me',
          label: t('My profile', this.props.currentLanguage),
          type: 'link',
          url: '/settings/me',
        },
      ];
      if (this.props.connectedUser.isDaikokuAdmin)
        options.push({
          value: 'daikoku',
          label: t('Daikoku settings', this.props.currentLanguage),
          type: 'link',
          url: `/settings/tenants/${this.props.tenant._humanReadableId}`,
        });

      const utils = {
        label: 'Daikoku',
        options: options.filter((i) => i.label.toLowerCase().includes(inputValue.toLowerCase())),
      };

      return Services.search(inputValue).then((result) => [
        utils,
        ...result.map((item) => ({ ...item, label: t(item.label, this.props.currentLanguage) })),
      ]);
    };

    const isDefaultLogo = this.props.tenant.logo === '/assets/images/daikoku.svg';
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
                  {this.props.tenant.logo && !isDefaultLogo && (
                    <img
                      src={this.props.tenant.logo}
                      style={{
                        height: 'auto',
                        maxWidth: '100%',
                      }}
                    />
                  )}
                  {(!this.props.tenant.logo || !!isDefaultLogo) && this.props.tenant.name}
                </Link>
              </div>
              {!this.props.connectedUser.isGuest && (
                <div className="input-group">
                  <div className="input-group-prepend d-none d-lg-flex">
                    <div className="input-group-text">
                      <i className="fas fa-search" />
                    </div>
                  </div>
                  <AsyncSelect
                    placeholder={t('Search', this.props.currentLanguage)}
                    className="general-search px-1 px-lg-0"
                    ref={(r) => (this.selector = r)}
                    cacheOptions
                    defaultOptions
                    components={(props) => <components.Group {...props} />}
                    loadOptions={_.debounce(promiseOptions, 100, { leading: true })}
                    onChange={this.selectSearchedItem}
                    classNamePrefix="reactSelect"
                  />
                </div>
              )}
            </div>
            <div className="d-flex flex-column flex-md-row mt-1 mt-xl-0">
              {this.props.impersonator && (
                <a href="/api/me/_deimpersonate" className="btn btn-danger">
                  <i className="fas fa-user-ninja" />{' '}
                  {t('Quit impersonation', this.props.currentLanguage)}
                  <b className="ml-1">{impersonator.email}</b>
                </a>
              )}
              {!this.props.connectedUser._humanReadableId && (
                <Select
                  className="language-selector"
                  value={languages.find((l) => l.value === this.props.currentLanguage)}
                  placeholder="Select a language"
                  options={languages}
                  onChange={(e) => this.props.udpateLanguageProp(e.value)}
                  classNamePrefix="reactSelect"
                />
              )}
              {this.props.connectedUser.isGuest && (
                <GuestUserMenu
                  user={this.props.connectedUser}
                  loginAction={this.props.loginAction}
                  loginProvider={this.props.loginProvider}
                  currentLanguage={this.props.currentLanguage}
                />
              )}
              {!this.props.connectedUser.isGuest && (
                <div className="d-flex justify-content-end align-items-center mt-1 mt-lg-0">
                  {this.state.isMaintenanceMode && <span className="badge badge-danger mr-3">
                    {t("Global maintenance mode enabled", this.props.currentLanguage)}
                  </span>}
                  <DarkModeActivator />
                  <Link
                    className={classNames({
                      'notification-link': true,
                      'unread-notifications': !!unreadNotificationsCount,
                    })}
                    to="/notifications"
                    title={t('Access to the notifications', this.props.currentLanguage)}>
                    <i className="fas fa-bell" />
                  </Link>
                  {(this.props.connectedUser.isDaikokuAdmin || this.props.isTenantAdmin) && (
                    <MessagesTopBarTools
                      currentLanguage={this.props.currentLanguage}
                      connectedUser={this.props.connectedUser}
                    />
                  )}
                  <div className="dropdown">
                    <img
                      style={{ width: 38, marginLeft: '5px', ...impersonatorStyle }}
                      src={this.props.connectedUser.picture}
                      className="dropdown-toggle logo-anonymous user-logo"
                      data-toggle="dropdown"
                      title={
                        impersonator
                          ? `${this.props.connectedUser.name} (${this.props.connectedUser.email
                          }) ${t('Impersonated by', this.props.currentLanguage)} ${impersonator.name
                          } (${impersonator.email})`
                          : this.props.connectedUser.name
                      }
                      alt="user menu"
                    />
                    {this.userMenu()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {this.state.error && (
          <div className="alert alert-danger alert-dismissible fade show mb-0" role="alert">
            <strong>Holy guacamole!</strong> {this.state.error}.
            <button type="button" className="close" onClick={this.removeError} aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
        )}
      </header>
    );
  }
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  logout: () => logout(),
  updateNotificationsCount: (count) => updateNotications(count),
  udpateLanguageProp: (l) => udpateLanguage(l),
};

export const TopBar = connect(mapStateToProps, mapDispatchToProps)(TopBarComponent);
