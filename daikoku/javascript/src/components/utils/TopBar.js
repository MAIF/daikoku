import React, { useState, useEffect, useContext } from 'react';
import _, { set } from 'lodash';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { connect, useSelector, useDispatch } from 'react-redux';
import classNames from 'classnames';
import faker from 'faker';
import { Sun, Moon, Search, Plus, MessageSquare, Bell, ArrowLeft } from 'react-feather';

import * as Services from '../../services';
import { logout, updateNotications, updateTenant } from '../../core/context/actions';
import { openCreationTeamModal, openTeamSelectorModal } from '../../core/modal'
import { Can, manage, daikoku, tenant, CanIDoAction, api as API } from '../utils';
import { MessagesTopBarTools } from '../backoffice/messages';
import { I18nContext } from '../../locales/i18n-context';
import { toastr } from 'react-redux-toastr';
import { MessagesContext } from '../backoffice';
import { NavContext } from '../../contexts';

const state = {
  opened: 'OPENED',
  closed: 'CLOSED'
}

const GuestUserMenu = ({ loginProvider }) => {
  const { translateMethod } = useContext(I18nContext);

  return (
    <>
      <a
        href={`/auth/${loginProvider}/login`}
        className="btn btn-outline-success mx-1 login-button"
      >
        {translateMethod('Login')}
      </a>
      <a
        href={`${loginProvider === 'Local' ? '/signup' : `/auth/${loginProvider}/login`}`}
        className="btn btn-success register-button"
      >
        {translateMethod('Register')}
      </a>
    </>
  );
};

const DarkModeActivator = ({ initialDark }) => {

  const { translateMethod } = useContext(I18nContext);

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
      className="block__entry__link"
      onClick={() => setTheme(theme === DARK ? LIGHT : DARK)}
    >
      {theme === DARK ? translateMethod('Light mode') : translateMethod('Dark mode')}
    </div>
  );
};

const SearchPanel = ({ teams }) => {
  const [results, setResults] = useState([]);

  const { translateMethod } = useContext(I18nContext);

  const { tenant, connectedUser } = useSelector((state) => state.context)

  useEffect(() => {
    debouncedSearch("")
  }, []);


  const search = (inputValue) => {
    const options = [
      {
        value: 'me',
        label: translateMethod('My profile'),
        type: 'link',
        url: '/settings/me',
      },
    ];
    if (connectedUser?.isDaikokuAdmin)
      options.push({
        value: 'daikoku',
        label: translateMethod('Daikoku settings'),
        type: 'link',
        url: `/settings/tenants/${tenant._humanReadableId}`,
      });

    const utils = {
      label: 'Daikoku',
      options: options.filter((i) => i.label.toLowerCase().includes(inputValue.toLowerCase())),
    };

    return Services.search(inputValue)
      .then((result) => setResults([
        utils,
        ...result.map((item) => ({ ...item, label: translateMethod(item.label) })),
      ]));
  };

  const debouncedSearch = _.debounce(search, 100, { leading: true })

  return (
    <div className='ms-3 mt-2 col-10 d-flex flex-column panel'>
      <input
        placeholder='Search for API, team and more... '
        className='mb-3 form-control'
        onChange={e => debouncedSearch(e.target.value)} />
      <div className="blocks">
        {results.map((r, idx) => {
          if (!r.options.length) {
            return null;
          }
          return (
            <div key={idx} className="mb-3 block">
              <div className="mb-1 block__category">{r.label}</div>
              <div className='ms-2 block__entries d-flex flex-column'>
                {r.options.map((option) => {
                  const team = teams.find((t) => t._id === option.team);
                  switch (option.type) {
                    case 'link':
                      return (
                        <Link
                          to={option.url}
                          className='block__entry__link'
                          key={option.value}
                        >{option.label}</Link>
                      )
                    case 'tenant':
                      return (
                        <Link
                          to={`/settings/tenants/${option.value}`}
                          className='block__entry__link'
                          key={option.value}
                        >{option.label}</Link>
                      )
                    case 'team':
                      return (
                        <Link
                          to={`/${option.value}`}
                          className='block__entry__link'
                          key={option.value}
                        >{option.label}</Link>
                      )
                    case 'api':
                      return (
                        <Link
                          to={`/${team ? team._humanReadableId : option.team}/${option.value}/${option.version}`}
                          className='block__entry__link'
                          key={option.value}
                        >{option.label}</Link>
                      )
                  }

                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const AddPanel = ({ teams }) => {
  const { translateMethod } = useContext(I18nContext);
  const { tenant, connectedUser, apiCreationPermitted } = useSelector((state) => state.context)
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const myTeams = teams.filter(t => connectedUser.isDaikokuAdmin || t.users.some(u => u.userId === connectedUser._id))

  const createTeam = () => {
    Services.fetchNewTeam()
      .then((team) => openCreationTeamModal({ team })(dispatch));
  };

  const createApi = (teamId) => {
    if (apiCreationPermitted) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translateMethod('api.creation.title.modal'),
          description: translateMethod('api.creation.description.modal'),
          teams: myTeams
            .filter((t) => t.type !== 'Admin')
            .filter((t) => !tenant.creationSecurity || t.apisCreationPermission)
            .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: teams => createApi(teams[0]),
        })(dispatch)
      } else {
        const team = myTeams.find((t) => teamId === t._id);

        return Services.fetchNewApi()
          .then((e) => {
            const verb = faker.hacker.verb();
            const name =
              verb.charAt(0).toUpperCase() +
              verb.slice(1) +
              ' ' +
              faker.hacker.adjective() +
              ' ' +
              faker.hacker.noun() +
              ' api';

            const _humanReadableId = name.replace(/\s/gi, '-').toLowerCase().trim();
            return { ...e, name, _humanReadableId, team: team._id };
          })
          .then((newApi) => navigate(`/${team._humanReadableId}/settings/apis/${newApi._id}/infos`,
            { state: { newApi } })
          );
      }
    }
  };

  return (
    <div className='ms-3 mt-2 col-10 d-flex flex-column panel'>
      {/* todo: add a title if API page or tenant or Team */}
      <div className='mb-3' style={{ height: '40px' }}></div>
      <div className="blocks">
        <div className="mb-3 block">
          <div className="mb-1 block__category">create</div>
          <div className='ms-2 block__entries d-flex flex-column'>
            {connectedUser.isDaikokuAdmin && <strong className='block__entry__link'>tenant</strong>}
            <strong className='block__entry__link' onClick={createTeam}>team</strong>
            <strong className='block__entry__link' onClick={() => createApi()}>API</strong>
          </div>
        </div>
        {/* todo: add a block in function of context to create plan...otoroshi or whatever */}
      </div>
    </div>
  )
}

const SettingsPanel = ({ }) => {
  const [version, setVersion] = useState();

  const { translateMethod, isTranslationMode } = useContext(I18nContext);
  const { tenant, connectedUser, apiCreationPermitted } = useSelector((state) => state.context)

  const dispatch = useDispatch();

  useEffect(() => {
    Services.getDaikokuVersion()
      .then((res) => setVersion(res.version));
  }, []);

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


  const isMaintenanceMode = tenant?.tenantMode !== 'Default' && !isTranslationMode;
  const toggleMaintenanceMode = () => {
    const toggleApi = isMaintenanceMode
      ? Services.disableMaintenanceMode
      : Services.enableMaintenanceMode;

    toggleApi()
      .then((maybeTenant) => {
        if (maybeTenant._id) {
          updateTenant(maybeTenant)(dispatch);
        }
      });
  };


  return (
    <div className='ms-3 mt-2 col-10 d-flex flex-column panel'>
      <div className='mb-3 panel__title' style={{ height: '40px' }}>
        {translateMethod('Settings')}
      </div>
      <div className="blocks">
        <div className="mb-3 block">
          <div className="mb-1 block__category">{connectedUser.email}</div>
          <div className='ms-2 block__entries d-flex flex-column'>
            <Link to='/settings/me' className='block__entry__link'>{translateMethod('My profile')}</Link>
          </div>
          <div className="dropdown-divider" />
        </div>
        <div className="mb-3 block">
          <div className="mb-1 block__category">{translateMethod('settings')}</div>
          <div className='ms-2 block__entries d-flex flex-column'>
            <Link to='/settings/teams' className='block__entry__link'>{tenant.name}{' '}{translateMethod('settings')}</Link>
            <Link to='/settings/tenants' className='block__entry__link'>{translateMethod('Daikoku settings')}</Link>
          </div>
          <div className="dropdown-divider" />
        </div>
        <div className="mb-3 block">
          <div className="mb-1 block__category">{translateMethod('actions')}</div>
          <div className='ms-2 block__entries d-flex flex-column'>
            <DarkModeActivator />
            <span className='block__entry__link' onClick={reset}>{translateMethod('Reset')}</span>
            <span className='block__entry__link' onClick={toggleMaintenanceMode}>
              {translateMethod(isMaintenanceMode ? 'Disable maintenance' : 'Maintenance mode')}
            </span>
            <Link to='/logout' className='block__entry__link'>{translateMethod('Logout')}</Link>
          </div>
          <div className="dropdown-divider" />
        </div>
        <div className="mb-3 block">
          <div className="mb-1 block__category">{translateMethod('version')}</div>
          <div className='ms-2 block__entries d-flex flex-column'>
            <span className='block__entry__link'>{ translateMethod('Version used') } : {version || '?.??.??'}</span>
          </div>
          <div className="dropdown-divider" />
        </div>
      </div>
    </div>
  )
}

const TopBarComponent = (props) => {
  const [teams, setTeams] = useState([]);
  const [daikokuVersion, setVersion] = useState(null);

  const [panelState, setPanelState] = useState(state.closed)
  const [panelContent, setPanelContent] = useState()



  const location = useLocation();
  const { totalUnread } = useContext(MessagesContext);
  const { translateMethod, setLanguage, language, isTranslationMode, languages } = useContext(I18nContext);
  const { setMode, navMode, setBackOfficeMode, setFrontOfficeMode, api, team, tenant } = useContext(NavContext)


  useEffect(() => {
    setPanelState(state.closed);
  }, [location]);

  const isMaintenanceMode =
    props.tenant.tenantMode && props.tenant.tenantMode !== 'Default' && !isTranslationMode;

  useEffect(() => {
    Promise.all([
      Services.myUnreadNotificationsCount(),
      Services.teams()
    ]).then(
      ([unreadNotifications, teams]) => {
        props.updateNotificationsCount(unreadNotifications.count);
        setTeams(teams);
      }
    );
  }, []);

  const getDaikokuVersion = () => {
    Services.getDaikokuVersion()
      .then((res) => setVersion(res.version));
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



  return (
    <div
      className="navbar-next d-flex flex-column p-2 align-items-center justify-content-between"
    >
      <div className="navbar_top d-flex flex-column align-items-center">
        <Link
          to="/apis"
          title="Daikoku home"
          className='mb-3'
          style={{
            width: '40px',
          }}>
          <img
            src={props.tenant.logo}
          />
        </Link>

        <div className="nav_item mb-3 cursor-pointer">
          <Search className='notification-link' onClick={() => {
            setPanelState(state.opened)
            setPanelContent(<SearchPanel teams={teams} />)
          }} />
        </div>
        <div className="nav_item mb-3 cursor-pointer">
          <Plus className='notification-link' onClick={() => {
            setPanelState(state.opened)
            setPanelContent(<AddPanel teams={teams} />)
          }} />
        </div>
      </div>

      <div className="navbar_bottom">
        <div className="nav_item mb-3">
          {(props.connectedUser.isDaikokuAdmin || props.isTenantAdmin) && (
            <Link
              to="/settings/messages"
              className={classNames('messages-link cursor-pointer', {
                'unread-messages': totalUnread > 0,
              })}
              title={translateMethod('Access to the messages')}
            >
              <MessageSquare />
            </Link>
          )}
        </div>
        <div className="nav_item mb-3">
          <Link
            className={classNames({
              'notification-link': true,
              'unread-notifications': !!unreadNotificationsCount,
            })}
            to="/notifications"
            title={translateMethod('Access to the notifications')}
          >
            <Bell />
          </Link>
        </div>
        <div className="nav_item mb-3" style={{ color: '#fff' }}>
          <img
            style={{ width: '35px', ...impersonatorStyle }}
            src={props.connectedUser.picture}
            className="logo-anonymous user-logo"
            onClick={() => {
              setPanelState(state.opened)
              setPanelContent(<SettingsPanel />)
            }}
            title={
              impersonator
                ? `${props.connectedUser.name} (${props.connectedUser.email
                }) ${translateMethod('Impersonated by')} ${impersonator.name} (${impersonator.email
                })`
                : props.connectedUser.name
            }
            alt="user menu"
          />
        </div>

      </div>

      <div className={classNames("navbar-panel d-flex flex-row", {
        opened: panelState === state.opened,
        closed: panelState === state.closed,
      })}>
        <div className="mt-2 ms-2 ">
          <div className='cursor-pointer navbar-panel__back d-flex align-items-center justify-content-center'>
            <ArrowLeft className='' onClick={() => setPanelState(state.closed)} />
          </div>
        </div>
        {panelContent}
      </div>
      <div className={classNames("navbar-panel-background", {
        opened: panelState === state.opened,
        closed: panelState === state.closed,
      })} onClick={() => setPanelState(state.closed)}></div>
    </div>
  )
  // return (
  //   <header className={impersonator ? 'impersonator-topbar-mb' : ''}>
  //     <div className="shadow-sm">
  //       <div className="container-fluid d-flex justify-content-center justify-content-lg-between align-items-end px-0">
  //         <div className="d-flex flex-column flex-md-row">
  //           <div className="ps-1 pe-2">
  //             <Link
  //               to="/apis"
  //               className="navbar-brand d-flex align-items-center me-4"
  //               title="Daikoku home"
  //               style={{
  //                 maxHeight: '38px',
  //               }}
  //             >
  //               {props.tenant.logo && !isDefaultLogo && (
  //                 <img
  //                   src={props.tenant.logo}
  //                   style={{
  //                     height: 'auto',
  //                     maxWidth: '59px',
  //                   }}
  //                 />
  //               )}
  //               {(!props.tenant.logo || !!isDefaultLogo) && props.tenant.name}
  //             </Link>
  //           </div>
  //           {!props.connectedUser.isGuest && (
  //             <div className="input-group">
  //               <div className="input-group-prepend d-none d-lg-flex">
  //                 <div className="input-group-text">
  //                   <i className="fas fa-search" />
  //                 </div>
  //               </div>
  //               <AsyncSelect
  //                 placeholder={translateMethod('Search')}
  //                 className="general-search px-1 px-lg-0"
  //                 cacheOptions
  //                 defaultOptions
  //                 components={(props) => <components.Group {...props} />}
  //                 loadOptions={_.debounce(promiseOptions, 100, { leading: true })}
  //                 onChange={selectSearchedItem}
  //                 classNamePrefix="reactSelect"
  //               />
  //             </div>
  //           )}
  //         </div>
  //         <div className="d-flex flex-column flex-md-row mt-1 mt-xl-0">
  //           {props.impersonator && (
  //             <a href="/api/me/_deimpersonate" className="btn btn-danger">
  //               <i className="fas fa-user-ninja" /> {translateMethod('Quit impersonation')}
  //               <b className="ms-1">{impersonator.email}</b>
  //             </a>
  //           )}
  //           {!props.connectedUser._humanReadableId && (
  //             <Select
  //               className="language-selector"
  //               value={languages.find((l) => l.value === language)}
  //               placeholder="Select a language"
  //               options={languages}
  //               onChange={(e) => setLanguage(e.value)}
  //               classNamePrefix="reactSelect"
  //             />
  //           )}
  //           {props.connectedUser.isGuest && <GuestUserMenu loginProvider={props.loginProvider} />}
  //           {!props.connectedUser.isGuest && (
  //             <div className="d-flex justify-content-end align-items-center mt-1 mt-lg-0">
  //               <Can
  //                 I={manage}
  //                 a={tenant}
  //                 isTenantAdmin={
  //                   props.connectedUser.isDaikokuAdmin ||
  //                   (props.tenant.admins || []).indexOf(props.connectedUser._id) > -1
  //                 }
  //               >
  //                 {isMaintenanceMode && (
  //                   <span className="badge bg-danger me-3">
  //                     {translateMethod('Global maintenance mode enabled')}
  //                   </span>
  //                 )}
  //                 {isTranslationMode && (
  //                   <span className="badge bg-warning me-3">
  //                     {translateMethod('Translation mode enabled')}
  //                   </span>
  //                 )}
  //               </Can>
  //               <DarkModeActivator />
  //               <Link
  //                 className={classNames({
  //                   'notification-link': true,
  //                   'unread-notifications': !!unreadNotificationsCount,
  //                 })}
  //                 to="/notifications"
  //                 title={translateMethod('Access to the notifications')}
  //               >
  //                 <i className="fas fa-bell" />
  //               </Link>
  //               {(props.connectedUser.isDaikokuAdmin || props.isTenantAdmin) && (
  //                 <MessagesTopBarTools connectedUser={props.connectedUser} />
  //               )}
  //               <div className="dropdown" onClick={getDaikokuVersion}>
  //                 <img
  //                   style={{ width: 38, marginLeft: '5px', ...impersonatorStyle }}
  //                   src={props.connectedUser.picture}
  //                   className="dropdown-toggle logo-anonymous user-logo"
  //                   data-bs-toggle="dropdown"
  //                   aria-expanded="false"
  //                   id="dropdownMenuButton1"
  //                   title={
  //                     impersonator
  //                       ? `${props.connectedUser.name} (${
  //                           props.connectedUser.email
  //                         }) ${translateMethod('Impersonated by')} ${impersonator.name} (${
  //                           impersonator.email
  //                         })`
  //                       : props.connectedUser.name
  //                   }
  //                   alt="user menu"
  //                 />
  //                 <div
  //                   className="dropdown-menu dropdown-menu-end"
  //                   aria-labelledby="dropdownMenuButton1"
  //                 >
  //                   <p className="dropdown-item">
  //                     {translateMethod('Logged in as')} <b>{props.connectedUser.email}</b>
  //                   </p>
  //                   {props.impersonator && (
  //                     <p className="dropdown-item">
  //                       {translateMethod('Impersonated by')} <b>{props.impersonator.email}</b>
  //                     </p>
  //                   )}
  //                   <div className="dropdown-divider" />
  //                   <Link className="dropdown-item" to={'/settings/me'}>
  //                     <i className="fas fa-user" /> {translateMethod('My profile')}
  //                   </Link>
  //                   {!props.tenant.hideTeamsPage && (
  //                     <>
  //                       <div className="dropdown-divider" />
  //                       <Link className="dropdown-item" to={'/teams'}>
  //                         <i className="fas fa-users" /> {translateMethod('All teams')}
  //                       </Link>
  //                     </>
  //                   )}
  //                   <div className="dropdown-divider" />
  //                   <Can I={manage} a={tenant}>
  //                     <Link className="dropdown-item" to={'/settings/teams'}>
  //                       <i className="fas fa-cogs" /> {props.tenant.name}{' '}
  //                       {translateMethod('settings')}
  //                     </Link>
  //                   </Can>
  //                   <Can I={manage} a={daikoku}>
  //                     <Link className="dropdown-item" to={'/settings/tenants'}>
  //                       <i className="fas fa-cogs" /> {translateMethod('Daikoku settings')}
  //                     </Link>
  //                   </Can>
  //                   <Can I={manage} a={tenant}>
  //                     <div className="dropdown-divider" />
  //                   </Can>
  //                   {props.connectedUser.isDaikokuAdmin && (
  //                     <a className="dropdown-item" href="#" onClick={toggleMaintenanceMode}>
  //                       <i className="fas fa-lock" />{' '}
  //                       {translateMethod(
  //                         isMaintenanceMode ? 'Disable maintenance' : 'Maintenance mode'
  //                       )}
  //                     </a>
  //                   )}
  //                   {props.tenant.mode === 'Dev' && (
  //                     <a className="dropdown-item" href="#" onClick={reset}>
  //                       <i className="fas fa-skull-crossbones" /> {translateMethod('Reset')}
  //                     </a>
  //                   )}
  //                   {props.tenant.mode === 'Dev' && (
  //                     <a
  //                       className="dropdown-item"
  //                       href="#"
  //                       onClick={() => {
  //                         fetch('/api/jobs/otoroshi/_sync?key=secret', {
  //                           method: 'POST',
  //                           headers: {
  //                             'Content-Type': 'application/json',
  //                           },
  //                           body: '',
  //                         }).then(() => {
  //                           toastr.success('sync ok ;)');
  //                         });
  //                       }}
  //                     >
  //                       <i className="fas fa-skull-crossbones" /> run sync
  //                     </a>
  //                   )}
  //                   <a className="dropdown-item" href="/logout">
  //                     <i className="fas fa-sign-out-alt" /> {translateMethod('Logout')}
  //                   </a>

  //                   {daikokuVersion && (
  //                     <>
  //                       <div className="dropdown-divider" />
  //                       <div className="dropdown-item">
  //                         <span>
  //                           {translateMethod('Version used')} : {daikokuVersion}
  //                         </span>
  //                       </div>
  //                     </>
  //                   )}
  //                 </div>
  //               </div>
  //             </div>
  //           )}
  //         </div>
  //       </div>
  //     </div>
  //   </header>
  // );
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
