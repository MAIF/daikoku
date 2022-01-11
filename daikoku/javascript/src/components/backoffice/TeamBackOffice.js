import React, { useContext, useEffect, useState } from 'react';
import {
  Link,
  Route,
  Routes,
  useParams,
  useLocation,
  useNavigate,
  NavLink,
} from 'react-router-dom';
import classNames from 'classnames';
import Select from 'react-select';
import { connect } from 'react-redux';
import faker from 'faker';

import * as Services from '../../services';
import {
  Error,
  Can,
  manage,
  read,
  api,
  apikey,
  stat,
  team,
  asset,
  daikoku,
  tenant as TENANT,
} from '../utils';

import {
  TeamApiKeys,
  TeamApiKeysForApi,
  TeamApis,
  TeamApi,
  TeamMembers,
  TeamApiKeyConsumption,
  TeamApiConsumption,
  TeamPlanConsumption,
  TeamConsumption,
  TeamBilling,
  TeamIncome,
  AssetsList,
  TeamApiSubscriptions,
  TeamEdit,
} from '../backoffice';

import { I18nContext } from '../../core';
import { toastr } from 'react-redux-toastr';

const BackOfficeContent = (props) => {
  return (
    <div className="" style={{ height: '100%' }}>
      {!props.error.status && props.children}
    </div>
  );
};

function TeamBackOfficeHomeComponent(props) {
  const { Translation } = useContext(I18nContext);
  const [team, setTeam] = useState();

  useEffect(() => {
    Services.teamHome(props.currentTeam._id).then(setTeam);

    document.title = `${props.currentTeam.name}`;
  }, []);

  if (!team) {
    return null;
  }

  return (
    <div className="row">
      <div className="col">
        <h1>
          {props.currentTeam.name}
          <a
            className="ms-1 btn btn-sm btn-access-negative"
            title="View this Team"
            href={`/${props.currentTeam._humanReadableId}`}
          >
            <i className="fas fa-eye"></i>
          </a>
        </h1>
        <div className="d-flex justify-content-center align-items-center col-12 mt-5">
          <div className="home-tiles d-flex justify-content-center align-items-center flex-wrap">
            <Link to={`/${props.currentTeam._humanReadableId}/settings/apis`} className="home-tile">
              <span className="home-tile-number">{team.apisCount}</span>
              <span className="home-tile-text">
                <Translation i18nkey="apis published" count={team.apisCount}>
                  apis published
                </Translation>
              </span>
            </Link>
            <Link
              to={`/${props.currentTeam._humanReadableId}/settings/apikeys`}
              className="home-tile"
            >
              <span className="home-tile-number">{team.subscriptionsCount}</span>
              <span className="home-tile-text">
                <Translation i18nkey="apis subcriptions" count={team.subscriptionsCount}>
                  apis subcriptions
                </Translation>
              </span>
            </Link>
            <Link
              to={
                props.currentTeam.type === 'Personal'
                  ? '#'
                  : `/${props.currentTeam._humanReadableId}/settings/members`
              }
              className="home-tile"
              disabled={props.currentTeam.type === 'Personal' ? 'disabled' : null}
            >
              {props.currentTeam.type !== 'Personal' ? (
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
}

const NavItem = ({ to, icon, name, subItem }) => (
  <li className="nav-item">
    <NavLink className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')} to={to}>
      <i className={`fas fa-${icon}`} style={{ marginLeft: subItem ? '12px' : 0 }} />
      {name}
    </NavLink>
  </li>
);

const CreateNewVersionButton = ({ apiId, versionId, teamId, currentTeam, tab }) => {
  const { translateMethod } = useContext(I18nContext);
  const reservedCharacters = [';', '/', '?', ':', '@', '&', '=', '+', '$', ','];

  const navigate = useNavigate();

  const promptVersion = () => {
    window
      .prompt('Version number', undefined, false, 'New version', `Current version : ${versionId}`)
      .then((newVersion) => {
        if (newVersion) {
          if ((newVersion || '').split('').find((c) => reservedCharacters.includes(c)))
            toastr.error(
              "Can't create version with special characters : " + reservedCharacters.join(' | ')
            );
          else createNewVersion(newVersion);
        }
      });
  };

  const createNewVersion = (newVersion) => {
    Services.createNewApiVersion(apiId, currentTeam._id, newVersion).then((res) => {
      if (res.error) toastr.error(res.error);
      else {
        toastr.success('New version of api created');
        navigate(`/${teamId}/settings/apis/${apiId}/${newVersion}/${tab ? tab : 'infos'}`);
      }
    });
  };

  return (
    <button onClick={promptVersion} className="btn btn-sm btn-outline-primary">
      {translateMethod('teamapi.new_version')}
    </button>
  );
};

const VersionsButton = ({ apiId, currentTeam, versionId, tab, teamId }) => {
  const [versions, setVersions] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    Services.getAllApiVersions(currentTeam._id, apiId).then((res) =>
      setVersions(res.map((v) => ({ label: v, value: v })))
    );
  }, []);

  return (
    <Select
      name="versions-selector"
      value={{ label: versionId, value: versionId }}
      options={versions}
      onChange={(e) => navigate(`/${teamId}/settings/apis/${apiId}/${e.value}/${tab}`)}
      classNamePrefix="reactSelect"
      className="m-2"
      menuPlacement="auto"
      menuPosition="fixed"
    />
  );
};

const TeamBackOfficeComponent = ({ currentTeam, tenant, isLoading, error, title }) => {
  useEffect(() => {
    if (title) {
      document.title = title;
    }
  }, [title]);

  const { Translation, translateMethod } = useContext(I18nContext);

  if (!currentTeam) {
    return null;
  }

  const location = useLocation();
  const navigate = useNavigate();

  const ApiSidebar = () => {
    const sidebarParams = useParams();

    const to = `/${currentTeam._humanReadableId}/settings/apis/${sidebarParams.apiId}/${sidebarParams.versionId}`;

    return (
      <>
        <VersionsButton {...sidebarParams} currentTeam={currentTeam} />
        {[
          { route: 'multistep', icon: 'info', name: translateMethod('multistep') },
          { route: 'infos', icon: 'info', name: translateMethod('Informations') },
          { route: 'description', icon: 'file-alt', name: translateMethod('Description') },
          { route: 'plans', icon: 'dollar-sign', name: translateMethod('Plans') },
          { route: 'swagger', icon: 'file-code', name: translateMethod('Swagger') },
          { route: 'testing', icon: 'vial', name: translateMethod('Testing') },
          { route: 'documentation', icon: 'book', name: translateMethod('Documentation') },
          { route: 'news', icon: 'newspaper', name: translateMethod('News') },
        ].map((item, i) => (
          <NavItem {...item} to={`${to}/${item.route}`} key={`item-${i}`} />
        ))}

        <div className="px-3 mb-4 mt-auto d-flex flex-column">
          <Link
            to={`/${currentTeam._humanReadableId}/${sidebarParams.apiId}/${sidebarParams.versionId}`}
            className="btn btn-sm btn-access-negative mb-2"
          >
            {translateMethod('View this Api')}
          </Link>
          <CreateNewVersionButton {...sidebarParams} currentTeam={currentTeam} />
          <Link
            className="d-flex justify-content-around mt-3 align-items-center"
            style={{
              border: 0,
              background: 'transparent',
              outline: 'none',
            }}
            to={`/${currentTeam._humanReadableId}/settings/apis`}
          >
            <i className="fas fa-chevron-left" />
            Back to {currentTeam._humanReadableId}
          </Link>
        </div>
      </>
    );
  };

  const TeamSidebar = () => {
    const tab = location.pathname.split('/').slice(-1)[0];
    const isOnHomePage = tab === 'settings';

    return (
      <>
        <Can I={read} a={api} team={currentTeam}>
          <li className="nav-item">
            <Link
              className={`nav-link ${isOnHomePage ? 'active' : ''}`}
              to={`/${currentTeam._humanReadableId}/settings`}
            >
              <i className="fas fa-cog" />
              <Translation i18nkey="Settings">Settings</Translation>
            </Link>
          </li>
        </Can>

        <Routes>
          {['/', '/edition', '/members', '/assets'].map((r, i) => (
            <Route
              key={`route-${r}-${i}`}
              path={r}
              element={
                <>
                  <Can I={read} a={api} team={currentTeam}>
                    <NavItem
                      to={`/${currentTeam._humanReadableId}/settings/edition`}
                      icon="info"
                      name={translateMethod('Informations')}
                      subItem={true}
                    />
                  </Can>
                  {currentTeam.type === 'Organization' && (
                    <Can I={manage} a={team} team={currentTeam}>
                      <NavItem
                        to={`/${currentTeam._humanReadableId}/settings/members`}
                        icon="users"
                        name={translateMethod('Member', true)}
                        subItem={true}
                      />
                    </Can>
                  )}
                  {currentTeam.type !== 'Admin' && (
                    <Can I={manage} a={asset} team={currentTeam}>
                      <NavItem
                        to={`/${currentTeam._humanReadableId}/settings/assets`}
                        icon="tools"
                        name={translateMethod('Assets')}
                        subItem={true}
                      />
                    </Can>
                  )}
                </>
              }
            />
          ))}
        </Routes>

        {(!tenant.creationSecurity || currentTeam.apisCreationPermission) && (
          <Can I={read} a={api} team={currentTeam}>
            <NavItem
              to={`/${currentTeam._humanReadableId}/settings/apis`}
              icon="atlas"
              name={translateMethod('Apis')}
            />
          </Can>
        )}
        <Can I={read} a={apikey} team={currentTeam}>
          <NavItem
            to={`/${currentTeam._humanReadableId}/settings/apikeys`}
            icon="key"
            name={translateMethod('Api keys')}
          />
        </Can>

        <Routes>
          {['/apikeys', '/apikeys/:apiId/:versionId', '/consumption'].map((r) => (
            <Route
              key={r}
              path={r}
              element={
                <>
                  <Can I={read} a={stat} team={currentTeam}>
                    <NavItem
                      to={`/${currentTeam._humanReadableId}/settings/consumption`}
                      icon="file-invoice-dollar"
                      name={translateMethod('Global stats')}
                      subItem={true}
                    />
                  </Can>
                </>
              }
            />
          ))}
        </Routes>

        <Can I={read} a={stat} team={currentTeam}>
          <NavItem
            to={`/${currentTeam._humanReadableId}/settings/billing`}
            icon="file-invoice-dollar"
            name={translateMethod('Billing')}
          />
        </Can>

        <Routes>
          {['/billing', '/income'].map((r) => (
            <Route
              key={r}
              path={r}
              element={
                <>
                  {(!tenant.creationSecurity || currentTeam.apisCreationPermission) && (
                    <Can I={read} a={api} team={currentTeam}>
                      <NavItem
                        to={`/${currentTeam._humanReadableId}/settings/income`}
                        icon="file-invoice-dollar"
                        name={translateMethod('Income')}
                        subItem={true}
                      />
                    </Can>
                  )}
                </>
              }
            />
          ))}
          <Route
            path="/apis"
            element={
              <div className="px-3 mb-4 mt-auto d-flex flex-column">
                <button
                  onClick={() => {
                    Services.fetchNewApi()
                      .then((e) => {
                        const verb = faker.hacker.verb();
                        const apiName =
                          verb.charAt(0).toUpperCase() +
                          verb.slice(1) +
                          ' ' +
                          faker.hacker.adjective() +
                          ' ' +
                          faker.hacker.noun() +
                          ' api';

                        e.name = apiName;
                        e._humanReadableId = apiName.replace(/\s/gi, '-').toLowerCase().trim();
                        return e;
                      })
                      .then((newApi) => {
                        navigate(
                          `/${currentTeam._humanReadableId}/settings/apis/${newApi._id}/infos`,
                          {
                            state: {
                              newApi: { ...newApi, team: currentTeam._id },
                            },
                          }
                        );
                      });
                  }}
                  className="btn btn-outline-primary mb-2"
                >
                  {translateMethod('Create a new API')}
                </button>
              </div>
            }
          />
        </Routes>
      </>
    );
  };

  const ConsumptionsBar = () => {
    const params = useParams();
    return (
      <>
        <Can I={read} a={apikey} team={currentTeam}>
          <NavItem
            to={`/${currentTeam._humanReadableId}/settings/apikeys/${params.apiId}/${params.versionId}/subscription/${params.sub}/consumptions`}
            icon="key"
            name={translateMethod('Consumptions')}
          />
        </Can>
        <Link
          className="d-flex justify-content-around mb-4 mt-auto align-items-center"
          style={{
            border: 0,
            background: 'transparent',
            outline: 'none',
          }}
          to={`/${currentTeam._humanReadableId}/settings/apikeys/${params.apiId}/${params.versionId}`}
        >
          <i className="fas fa-chevron-left" />
          Back to apikeys
        </Link>
      </>
    );
  };

  const ApiKeysBar = () => {
    const params = useParams();
    return (
      <>
        <Can I={read} a={apikey} team={currentTeam}>
          <NavItem
            to={`/${currentTeam._humanReadableId}/settings/apikeys/${params.apiId}/${params.versionId}`}
            icon="key"
            name={translateMethod('Api keys')}
          />
        </Can>
        <Link
          className="d-flex justify-content-around mb-4 mt-auto align-items-center"
          style={{
            border: 0,
            background: 'transparent',
            outline: 'none',
          }}
          to={`/${currentTeam._humanReadableId}/settings/apikeys`}
        >
          <i className="fas fa-chevron-left" />
          Back to apis
        </Link>
      </>
    );
  };

  const NewApiBar = () => (
    <div className="px-3 mb-4 mt-auto d-flex flex-column">
      <Link
        className="d-flex justify-content-around mt-3 align-items-center"
        style={{
          border: 0,
          background: 'transparent',
          outline: 'none',
        }}
        to={`/${currentTeam._humanReadableId}/settings/apis`}
      >
        <i className="fas fa-chevron-left" />
        Back to {currentTeam._humanReadableId}
      </Link>
    </div>
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
      <nav className="col-md-3 d-md-block sidebar collapse" id="sidebar">
        <div className="sidebar-sticky d-flex flex-column p-0">
          <span className="mt-4 px-3 text-muted" style={{ textTransform: 'uppercase' }}>
            {currentTeam.name}
          </span>
          <ul className="nav flex-column pt-2" style={{ flex: 1 }}>
            <Routes>
              <Route path="/apis/:apiId/:versionId/:tab*" element={<ApiSidebar />} />
              <Route path={`/apis/:apiId/:tab`} element={<NewApiBar />} />
              <Route path={`/apikeys/:apiId/:versionId`} element={<ApiKeysBar />} />
              <Route
                path={`/apikeys/:apiId/:versionId/subscription/:sub/consumptions`}
                element={<ConsumptionsBar />}
              />
              <Route path="*" element={<TeamSidebar />} />
            </Routes>
          </ul>
        </div>
      </nav>
      <main role="main" className="col-md-9 offset-md-3 ml-sm-auto px-4 mt-3">
        <div
          className={classNames('back-office-overlay', {
            active: isLoading && !error.status,
          })}
        />
        <BackOfficeContent error={error}>
          <Routes>
            <Route path={`/edition`} element={<TeamEdit />} />
            <Route path={`/consumption`} element={<TeamConsumption />} />
            <Route path={`/billing`} element={<TeamBilling />} />
            <Route path={`/income`} element={<TeamIncome />} />
            <Route
              path={`/subscriptions/apis/:apiId/:versionId`}
              element={<TeamApiSubscriptions />}
            />
            <Route
              path={`/apikeys/:apiId/:versionId/subscription/:subscription/consumptions`}
              element={<TeamApiKeyConsumption />}
            />
            <Route path={`/apikeys/:apiId/:versionId`} element={<TeamApiKeysForApi />} />
            <Route path={`/apikeys`} element={<TeamApiKeys />} />
            <Route path={`/consumptions/apis/:apiId/:versionId`} element={<TeamApiConsumption />} />
            <Route
              path={`/consumptions/apis/:apiId/:versionId/plan/:planId`}
              element={<TeamPlanConsumption />}
            />
            <Route path={`/members`} element={<TeamMembers />} />
            <Route path={`/assets`} element={<AssetsList tenantMode={false} />} />
            <Route path={`/apis/:apiId/:versionId/:tab*`} element={<TeamApi />} />
            <Route path={`/apis/:apiId/:versionId`} element={<TeamApi />} />
            <Route path={`/apis`} element={<TeamApis />} />
            <Route path="/" element={<TeamBackOfficeHome />} />
          </Routes>
        </BackOfficeContent>
      </main>
    </div>
  );
};

const UserBackOfficeComponent = ({
  tab,
  title,
  notificationSubMenu,
  tenant,
  isLoading,
  error,
  children,
}) => {
  useEffect(() => {
    if (title) {
      document.title = title;
    }
  }, [title]);

  const { translateMethod, Translation } = useContext(I18nContext);

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
      <nav className="col-md-3 d-md-block sidebar collapse" id="sidebar">
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
                  to={'/settings/admins'}>
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
      <main role="main" className="col-md-9 offset-md-3 px-4">
        <div className={classNames('back-office-overlay', { active: isLoading })} />
        <BackOfficeContent error={error}>{children}</BackOfficeContent>
      </main>
    </div>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
  error: state.error,
});

export const TeamBackOffice = connect(mapStateToProps)(TeamBackOfficeComponent);
export const UserBackOffice = connect(mapStateToProps)(UserBackOfficeComponent);

const TeamBackOfficeHome = connect(mapStateToProps)(TeamBackOfficeHomeComponent);
