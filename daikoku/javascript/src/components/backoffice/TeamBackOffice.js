import React, { Component } from 'react';
import { Link, Route } from 'react-router-dom';
import classNames from 'classnames';
import { connect } from 'react-redux';

import * as Services from '../../services';
import { Error, Can, manage, read, api, apikey, stat, team, asset, daikoku } from '../utils';
import { t, Translation } from '../../locales';

function elvis(value, f) {
  if (value) {
    return f(value);
  } else {
    return value;
  }
}

const BackOfficeContent = props => {
  return (
    <div className="pt-5 pr-3 pl-3" style={{ height: '100%' }}>
      {props.error.status && <Error error={props.error} />}
      {!props.error.status && props.children}
    </div>
  );
};

class TeamBackOfficeHomeComponent extends Component {
  state = {
    team: undefined,
  };

  componentDidMount() {
    this.props.history.listen(() => {
      elvis(document.getElementById('sidebar'), e =>
        e.setAttribute('class', 'col-md-2 d-md-block sidebar collapse')
      );
      // document.getElementById('navbar').setAttribute('class', 'navbar-collapse collapse');
      elvis(document.getElementById('toggle-sidebar'), e =>
        e.setAttribute('class', 'navbar-toggle menu collapsed')
      );
      // document.getElementById('toggle-navigation').setAttribute('class', 'navbar-toggle collapsed');
    });

    Services.teamHome(this.props.currentTeam._id).then(team => this.setState({ team }));
  }

  render() {
    if (!this.state.team) {
      return null;
    }

    return (
      <TeamBackOffice tab="Home">
        <div className="row">
          <div className="col">
            <h1>{this.props.currentTeam.name} </h1>
            <div className="d-flex justify-content-center align-items-center col-12 mt-5">
              <div className="home-tiles d-flex justify-content-center align-items-center flex-wrap">
                <Link
                  to={`/${this.props.currentTeam._humanReadableId}/settings/apis`}
                  className="home-tile">
                  <span className="home-tile-number">{this.state.team.apisCount}</span>
                  <span className="home-tile-text">
                    <Translation
                      i18nkey="apis published"
                      language={this.props.currentLanguage}
                      count={this.state.team.apisCount}>
                      apis published
                    </Translation>
                  </span>
                </Link>
                <Link
                  to={`/${this.props.currentTeam._humanReadableId}/settings/apikeys`}
                  className="home-tile">
                  <span className="home-tile-number">{this.state.team.subscriptionsCount}</span>
                  <span className="home-tile-text">
                    <Translation
                      i18nkey="apis subcriptions"
                      language={this.props.currentLanguage}
                      count={this.state.team.subscriptionsCount}>
                      apis subcriptions
                    </Translation>
                  </span>
                </Link>
                <Link
                  to={
                    this.props.currentTeam.type === 'Personal'
                      ? '#'
                      : `/${this.props.currentTeam._humanReadableId}/settings/members`
                  }
                  className="home-tile">
                  <span className="home-tile-number">{this.state.team.users.length}</span>
                  <span className="home-tile-text">
                    <Translation
                      i18nkey="members"
                      language={this.props.currentLanguage}
                      count={this.state.team.users.length}>
                      members
                    </Translation>
                  </span>
                </Link>
                <Link to={'/notifications'} className="home-tile">
                  <span className="home-tile-number">{this.state.team.notificationCount}</span>
                  <span className="home-tile-text">
                    <Translation
                      i18nkey="unread notifications"
                      language={this.props.currentLanguage}
                      count={this.state.team.notificationCount}>
                      unread notifications
                    </Translation>
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </TeamBackOffice>
    );
  }
}

class TeamBackOfficeComponent extends Component {
  state = {
    tenant: null,
  };

  UNSAFE_componentWillMount() {
    if (!this.props.currentTeam || (this.props.currentTeam && !this.props.currentTeam._id)) {
      console.warn(
        'The <TeamBackOffice /> component does not have a team id props. Everything will fail !'
      );
    }
  }

  __componentWillReceiveProps(nextProps) {
    if (
      this.props.currentTeam &&
      nextProps.team &&
      nextProps.team._id !== this.props.currentTeam._id
    ) {
      console.log('force');
      this.forceUpdate();
    }
  }

  render() {
    const { tab, currentTeam } = this.props;

    if (!currentTeam) {
      return null;
    }
    return (
      <>
        <Route
          path={['/teams/:teamId/settings', '/:teamId/settings']}
          render={() => (
            <div className="row">
              <button
                id="toggle-sidebar"
                type="button"
                className="navbar-toggle btn btn-sm btn-access-negative float-left mr-2"
                data-toggle="collapse"
                data-target="#sidebar"
                aria-expanded="false"
                aria-controls="sidebar">
                <span className="sr-only">Toggle sidebar</span>
                <span className="chevron" />
              </button>
              <nav className="col-md-2 d-md-block sidebar collapse" id="sidebar">
                <div className="sidebar-sticky">
                  <h6 className="sidebar-heading d-flex justify-content-between align-items-center px-3 mt-4 mb-1 text-muted">
                    <Link to={`/${currentTeam._humanReadableId}/settings`}>
                      {this.props.currentTeam.name}
                    </Link>
                    <Can I={manage} a={team} team={this.props.currentTeam}>
                      <Link
                        to={`/${this.props.currentTeam._humanReadableId}/settings/edition`}
                        className=""
                        title={t('Update team', this.props.currentLanguage)}>
                        <i className="fas fa-pen" />
                      </Link>
                    </Can>
                  </h6>
                  <ul className="nav flex-column mt-3">
                    <Can I={read} a={api} team={this.props.currentTeam}>
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'Apis' ? 'active' : ''}`}
                          to={`/${currentTeam._humanReadableId}/settings/apis`}>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 1024 1024"
                            className="nav-icon">
                            <path
                              d="M917.7 148.8l-42.4-42.4c-1.6-1.6-3.6-2.3-5.7-2.3s-4.1.8-5.7 2.3l-76.1 76.1a199.27 199.27 0 0 0-112.1-34.3c-51.2 0-102.4 19.5-141.5 58.6L432.3 308.7a8.03 8.03 0 0 0 0 11.3L704 591.7c1.6 1.6 3.6 2.3 5.7 2.3 2 0 4.1-.8 5.7-2.3l101.9-101.9c68.9-69 77-175.7 24.3-253.5l76.1-76.1c3.1-3.2 3.1-8.3 0-11.4zM769.1 441.7l-59.4 59.4-186.8-186.8 59.4-59.4c24.9-24.9 58.1-38.7 93.4-38.7 35.3 0 68.4 13.7 93.4 38.7 24.9 24.9 38.7 58.1 38.7 93.4 0 35.3-13.8 68.4-38.7 93.4zm-190.2 105a8.03 8.03 0 0 0-11.3 0L501 613.3 410.7 523l66.7-66.7c3.1-3.1 3.1-8.2 0-11.3L441 408.6a8.03 8.03 0 0 0-11.3 0L363 475.3l-43-43a7.85 7.85 0 0 0-5.7-2.3c-2 0-4.1.8-5.7 2.3L206.8 534.2c-68.9 69-77 175.7-24.3 253.5l-76.1 76.1a8.03 8.03 0 0 0 0 11.3l42.4 42.4c1.6 1.6 3.6 2.3 5.7 2.3s4.1-.8 5.7-2.3l76.1-76.1c33.7 22.9 72.9 34.3 112.1 34.3 51.2 0 102.4-19.5 141.5-58.6l101.9-101.9c3.1-3.1 3.1-8.2 0-11.3l-43-43 66.7-66.7c3.1-3.1 3.1-8.2 0-11.3l-36.6-36.2zM441.7 769.1a131.32 131.32 0 0 1-93.4 38.7c-35.3 0-68.4-13.7-93.4-38.7a131.32 131.32 0 0 1-38.7-93.4c0-35.3 13.7-68.4 38.7-93.4l59.4-59.4 186.8 186.8-59.4 59.4z"
                              fill="#999"
                            />
                          </svg>
                          <Translation i18nkey="Team Apis" language={this.props.currentLanguage}>
                            Team Apis
                          </Translation>
                        </Link>
                      </li>
                    </Can>
                    <Can I={read} a={stat} team={this.props.currentTeam}>
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'Income' ? 'active' : ''}`}
                          to={`/${currentTeam._humanReadableId}/settings/income`}>
                          <svg
                            aria-hidden="true"
                            focusable="false"
                            data-prefix="fas"
                            data-icon="file-invoice-dollar"
                            role="img"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 384 512"
                            className="nav-icon">
                            <path
                              fill="#999"
                              d="M377 105L279.1 7c-4.5-4.5-10.6-7-17-7H256v128h128v-6.1c0-6.3-2.5-12.4-7-16.9zm-153 31V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zM64 72c0-4.42 3.58-8 8-8h80c4.42 0 8 3.58 8 8v16c0 4.42-3.58 8-8 8H72c-4.42 0-8-3.58-8-8V72zm0 80v-16c0-4.42 3.58-8 8-8h80c4.42 0 8 3.58 8 8v16c0 4.42-3.58 8-8 8H72c-4.42 0-8-3.58-8-8zm144 263.88V440c0 4.42-3.58 8-8 8h-16c-4.42 0-8-3.58-8-8v-24.29c-11.29-.58-22.27-4.52-31.37-11.35-3.9-2.93-4.1-8.77-.57-12.14l11.75-11.21c2.77-2.64 6.89-2.76 10.13-.73 3.87 2.42 8.26 3.72 12.82 3.72h28.11c6.5 0 11.8-5.92 11.8-13.19 0-5.95-3.61-11.19-8.77-12.73l-45-13.5c-18.59-5.58-31.58-23.42-31.58-43.39 0-24.52 19.05-44.44 42.67-45.07V232c0-4.42 3.58-8 8-8h16c4.42 0 8 3.58 8 8v24.29c11.29.58 22.27 4.51 31.37 11.35 3.9 2.93 4.1 8.77.57 12.14l-11.75 11.21c-2.77 2.64-6.89 2.76-10.13.73-3.87-2.43-8.26-3.72-12.82-3.72h-28.11c-6.5 0-11.8 5.92-11.8 13.19 0 5.95 3.61 11.19 8.77 12.73l45 13.5c18.59 5.58 31.58 23.42 31.58 43.39 0 24.53-19.05 44.44-42.67 45.07z"
                            />
                          </svg>
                          <Translation i18nkey="Team Income" language={this.props.currentLanguage}>
                            Team Income
                          </Translation>
                        </Link>
                      </li>
                    </Can>
                    <Can I={read} a={apikey} team={this.props.currentTeam}>
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'ApiKeys' ? 'active' : ''}`}
                          to={`/${currentTeam._humanReadableId}/settings/apikeys`}>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 32 32"
                            className="nav-icon">
                            <path
                              d="M20 3c-4.945 0-9 4.055-9 9 0 .52.085.978.156 1.438L3.28 21.28l-.28.314V29h7v-3h3v-3h3v-2.97c1.18.58 2.555.97 4 .97 4.945 0 9-4.055 9-9s-4.055-9-9-9zm0 2c3.855 0 7 3.145 7 7s-3.145 7-7 7a7.37 7.37 0 0 1-3.406-.875l-.25-.125H14v3h-3v3H8v3H5v-4.563l7.906-7.937.375-.344-.092-.53c-.1-.6-.188-1.137-.188-1.626 0-3.855 3.145-7 7-7zm2 3a2 2 0 1 0-.001 3.999A2 2 0 0 0 22 8z"
                              fill="#999"
                            />
                          </svg>
                          <Translation
                            i18nkey="Team api keys"
                            language={this.props.currentLanguage}>
                            Team api keys
                          </Translation>
                        </Link>
                      </li>
                    </Can>
                    <Can I={read} a={stat} team={this.props.currentTeam}>
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'Billing' ? 'active' : ''}`}
                          to={`/${currentTeam._humanReadableId}/settings/billing`}>
                          <svg
                            aria-hidden="true"
                            focusable="false"
                            data-prefix="fas"
                            data-icon="file-invoice-dollar"
                            role="img"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 384 512"
                            className="nav-icon">
                            <path
                              fill="#999"
                              d="M377 105L279.1 7c-4.5-4.5-10.6-7-17-7H256v128h128v-6.1c0-6.3-2.5-12.4-7-16.9zm-153 31V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zM64 72c0-4.42 3.58-8 8-8h80c4.42 0 8 3.58 8 8v16c0 4.42-3.58 8-8 8H72c-4.42 0-8-3.58-8-8V72zm0 80v-16c0-4.42 3.58-8 8-8h80c4.42 0 8 3.58 8 8v16c0 4.42-3.58 8-8 8H72c-4.42 0-8-3.58-8-8zm144 263.88V440c0 4.42-3.58 8-8 8h-16c-4.42 0-8-3.58-8-8v-24.29c-11.29-.58-22.27-4.52-31.37-11.35-3.9-2.93-4.1-8.77-.57-12.14l11.75-11.21c2.77-2.64 6.89-2.76 10.13-.73 3.87 2.42 8.26 3.72 12.82 3.72h28.11c6.5 0 11.8-5.92 11.8-13.19 0-5.95-3.61-11.19-8.77-12.73l-45-13.5c-18.59-5.58-31.58-23.42-31.58-43.39 0-24.52 19.05-44.44 42.67-45.07V232c0-4.42 3.58-8 8-8h16c4.42 0 8 3.58 8 8v24.29c11.29.58 22.27 4.51 31.37 11.35 3.9 2.93 4.1 8.77.57 12.14l-11.75 11.21c-2.77 2.64-6.89 2.76-10.13.73-3.87-2.43-8.26-3.72-12.82-3.72h-28.11c-6.5 0-11.8 5.92-11.8 13.19 0 5.95 3.61 11.19 8.77 12.73l45 13.5c18.59 5.58 31.58 23.42 31.58 43.39 0 24.53-19.05 44.44-42.67 45.07z"
                            />
                          </svg>
                          <Translation i18nkey="Team billing" language={this.props.currentLanguage}>
                            Team billing
                          </Translation>
                        </Link>
                      </li>
                    </Can>

                    {this.props.currentTeam.type !== 'Personal' && (
                      <Can I={manage} a={team} team={this.props.currentTeam}>
                        <li className="nav-item">
                          <Link
                            className={`nav-link ${tab === 'Members' ? 'active' : ''}`}
                            to={`/${currentTeam._humanReadableId}/settings/members`}>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="feather feather-users">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                            <Translation
                              i18nkey="Team members"
                              language={this.props.currentLanguage}>
                              Team members
                            </Translation>
                          </Link>
                        </li>
                      </Can>
                    )}
                    <Can I={manage} a={asset} team={this.props.currentTeam}>
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'Assets' ? 'active' : ''}`}
                          to={`/${currentTeam._humanReadableId}/settings/assets`}>
                          <i
                            className="fas fa-copy"
                            style={{
                              color: tab === 'Assets' ? '#999' : '',
                              marginLeft: 2,
                              marginRight: 5,
                            }}
                          />
                          <Translation i18nkey="Team assets" language={this.props.currentLanguage}>
                            Team assets
                          </Translation>
                        </Link>
                      </li>
                    </Can>
                  </ul>
                </div>
              </nav>
              <main role="main" className="col-md-10 ml-sm-auto px-4 sidebar-next-main">
                <div
                  className={classNames('back-office-overlay', {
                    active: this.props.isLoading && !this.props.error.status,
                  })}
                />
                <BackOfficeContent error={this.props.error}>
                  {this.props.children}
                </BackOfficeContent>
              </main>
            </div>
          )}
        />
      </>
    );
  }
}

class UserBackOfficeComponent extends Component {
  render() {
    const { tab } = this.props;

    return (
      <>
        <Route
          path={['/notifications', '/settings']}
          render={() => (
            <div className="row">
              <button
                id="toggle-sidebar"
                type="button"
                className="navbar-toggle btn btn-sm btn-access-negative float-left mr-2"
                data-toggle="collapse"
                data-target="#sidebar"
                aria-expanded="false"
                aria-controls="sidebar">
                <span className="sr-only">Toggle sidebar</span>
                <span className="chevron" />
              </button>
              <nav className="col-md-2 d-md-block sidebar collapse" id="sidebar">
                <div className="sidebar-sticky">
                  <ul className="nav flex-column mt-3">
                    <li className="nav-item">
                      <Link
                        className={`nav-link ${tab === 'Me' ? 'active' : ''}`}
                        to={'/settings/me'}>
                        <i className="fas fa-user mr-1" />
                        <Translation i18nkey="My profile" language={this.props.currentLanguage}>
                          My profile
                        </Translation>
                      </Link>
                    </li>
                    <li className="nav-item">
                      <Link
                        className={`nav-link ${tab === 'Notifications' ? 'active' : ''}`}
                        to={'/notifications'}>
                        <i className="fas fa-bell mr-1" />
                        <Translation i18nkey="Notifications" language={this.props.currentLanguage}>
                          Notifications
                        </Translation>
                      </Link>
                      {this.props.notificationSubMenu || null}
                    </li>
                  </ul>

                  <Can I={manage} a={daikoku}>
                    <h6 className="sidebar-heading d-flex justify-content-between align-items-center px-3 mt-4 mb-1 text-muted">
                      <span>
                        <Translation
                          i18nkey="Tenant administration"
                          language={this.props.currentLanguage}>
                          Tenant administration
                        </Translation>
                      </span>
                    </h6>
                    <ul className="nav flex-column mb-2">
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'Otoroshi' ? 'active' : ''}`}
                          to={'/settings/otoroshis'}>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 640 512"
                            className="nav-icon">
                            <path
                              d="M624.54 347.67c-32.7-12.52-57.36 4.25-75.37 16.45-17.06 11.53-23.25 14.42-31.41 11.36-8.12-3.09-10.83-9.38-15.89-29.38-3.33-13.15-7.44-29.32-17.95-42.65 2.24-2.91 4.43-5.79 6.38-8.57C500.47 304.45 513.71 312 532 312c33.95 0 50.87-25.78 62.06-42.83 10.59-16.14 15-21.17 21.94-21.17 13.25 0 24-10.75 24-24s-10.75-24-24-24c-33.95 0-50.87 25.78-62.06 42.83-10.6 16.14-15 21.17-21.94 21.17-17.31 0-37.48-61.43-97.26-101.91l17.25-34.5C485.43 125.5 512 97.98 512 64c0-35.35-28.65-64-64-64s-64 28.65-64 64c0 13.02 3.94 25.1 10.62 35.21l-18.15 36.3c-16.98-4.6-35.6-7.51-56.46-7.51s-39.49 2.91-56.46 7.51l-18.15-36.3C252.06 89.1 256 77.02 256 64c0-35.35-28.65-64-64-64s-64 28.65-64 64c0 33.98 26.56 61.5 60.02 63.6l17.25 34.5C145.68 202.44 125.15 264 108 264c-6.94 0-11.34-5.03-21.94-21.17C74.88 225.78 57.96 200 24 200c-13.25 0-24 10.75-24 24s10.75 24 24 24c6.94 0 11.34 5.03 21.94 21.17C57.13 286.22 74.05 312 108 312c18.29 0 31.53-7.55 41.7-17.11 1.95 2.79 4.14 5.66 6.38 8.57-10.51 13.33-14.62 29.5-17.95 42.65-5.06 20-7.77 26.28-15.89 29.38-8.11 3.06-14.33.17-31.41-11.36-18.03-12.2-42.72-28.92-75.37-16.45-12.39 4.72-18.59 18.58-13.87 30.97 4.72 12.41 18.61 18.61 30.97 13.88 8.16-3.09 14.34-.19 31.39 11.36 13.55 9.16 30.83 20.86 52.42 20.84 7.17 0 14.83-1.28 22.97-4.39 32.66-12.44 39.98-41.33 45.33-62.44 2.21-8.72 3.99-14.49 5.95-18.87 16.62 13.61 36.95 25.88 61.64 34.17-9.96 37-32.18 90.8-60.26 90.8-13.25 0-24 10.75-24 24s10.75 24 24 24c66.74 0 97.05-88.63 107.42-129.14 6.69.6 13.42 1.14 20.58 1.14s13.89-.54 20.58-1.14C350.95 423.37 381.26 512 448 512c13.25 0 24-10.75 24-24s-10.75-24-24-24c-27.94 0-50.21-53.81-60.22-90.81 24.69-8.29 45-20.56 61.62-34.16 1.96 4.38 3.74 10.15 5.95 18.87 5.34 21.11 12.67 50 45.33 62.44 8.14 3.11 15.8 4.39 22.97 4.39 21.59 0 38.87-11.69 52.42-20.84 17.05-11.55 23.28-14.45 31.39-11.36 12.39 4.75 26.27-1.47 30.97-13.88 4.71-12.4-1.49-26.26-13.89-30.98zM448 48c8.82 0 16 7.18 16 16s-7.18 16-16 16-16-7.18-16-16 7.18-16 16-16zm-256 0c8.82 0 16 7.18 16 16s-7.18 16-16 16-16-7.18-16-16 7.18-16 16-16z"
                              fill="#999"
                            />
                          </svg>{' '}
                          <Translation
                            i18nkey="Otoroshi instance"
                            language={this.props.currentLanguage}
                            isPlural>
                            Otoroshi instances
                          </Translation>
                        </Link>
                      </li>
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'Audit trail' ? 'active' : ''}`}
                          to={'/settings/audit'}>
                          <i className="fas fa-copy mr-1" />
                          <Translation i18nkey="Audit trail" language={this.props.currentLanguage}>
                            Audit trail
                          </Translation>
                        </Link>
                      </li>
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'Teams' ? 'active' : ''}`}
                          to={'/settings/teams'}>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="feather feather-users">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>{' '}
                          <Translation i18nkey="Teams" language={this.props.currentLanguage}>
                            Teams
                          </Translation>
                        </Link>
                      </li>
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'Assets' ? 'active' : ''}`}
                          to={'/settings/assets'}>
                          <i
                            className="fas fa-copy mr-1"
                          />
                          <Translation
                            i18nkey="Tenant assets"
                            language={this.props.currentLanguage}>
                            Tenant assets
                          </Translation>
                        </Link>
                      </li>
                    </ul>
                    <h6 className="sidebar-heading d-flex justify-content-between align-items-center px-3 mt-4 mb-1 text-muted">
                      <span>
                        <Translation
                          i18nkey="Daikoku administration"
                          language={this.props.currentLanguage}>
                          Daikoku administration
                        </Translation>
                      </span>
                    </h6>
                    <ul className="nav flex-column mb-2">
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'Tenants' ? 'active' : ''}`}
                          to={'/settings/tenants'}>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="feather feather-file-text">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>

                          <Translation i18nkey="Tenants" language={this.props.currentLanguage}>
                            Tenants
                          </Translation>
                        </Link>
                      </li>
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'Users' ? 'active' : ''}`}
                          to={'/settings/users'}>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="feather feather-users">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>{' '}
                          <Translation i18nkey="Users" language={this.props.currentLanguage}>
                            Users
                          </Translation>
                        </Link>
                      </li>
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'User sessions' ? 'active' : ''}`}
                          to={'/settings/sessions'}>
                          <i className="fas fa-address-card mr-1" />
                          <Translation
                            i18nkey="User sessions"
                            language={this.props.currentLanguage}>
                            User sessions
                          </Translation>
                        </Link>
                      </li>
                      <li className="nav-item">
                        <Link
                          className={`nav-link ${tab === 'Import / Export' ? 'active' : ''}`}
                          to={'/settings/import-export'}>
                          <i className="fas fa-download mr-1" />
                          <Translation
                            i18nkey="Import / Export"
                            language={this.props.currentLanguage}>
                            Import / Export
                          </Translation>
                        </Link>
                      </li>
                    </ul>
                  </Can>
                </div>
              </nav>
              <main role="main" className="col-md-10 ml-sm-auto px-4 sidebar-next-main">
                <div
                  className={classNames('back-office-overlay', { active: this.props.isLoading })}
                />
                <BackOfficeContent error={this.props.error}>
                  {this.props.children}
                </BackOfficeContent>
              </main>
            </div>
          )}
        />
      </>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
  error: state.error,
});

export const TeamBackOffice = connect(mapStateToProps)(TeamBackOfficeComponent);
export const UserBackOffice = connect(mapStateToProps)(UserBackOfficeComponent);

export const TeamBackOfficeHome = connect(mapStateToProps)(TeamBackOfficeHomeComponent);
