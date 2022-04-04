import React, { useState, useEffect, useContext } from 'react';
import _, { set } from 'lodash';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { connect, useSelector, useDispatch } from 'react-redux';
import classNames from 'classnames';
import faker from 'faker';
import { Sun, Moon, Search, Plus, MessageSquare, Bell, ArrowLeft, ChevronLeft, ChevronRight } from 'react-feather';

import * as Services from '../../../services';
import { logout, updateNotifications, updateTenant } from '../../../core/context/actions';
import { openCreationTeamModal, openTeamSelectorModal } from '../../../core/modal'
import { Can, manage, daikoku, tenant, CanIDoAction, api as API } from '..';
import { MessagesTopBarTools } from '../../backoffice/messages';
import { I18nContext } from '../../../locales/i18n-context';
import { toastr } from 'react-redux-toastr';
import { MessagesContext } from '../../backoffice';
import { NavContext } from '../../../contexts';

import {AddPanel, GuestPanel, SearchPanel, SettingsPanel} from './panels';
import { Companion } from './companions';

export const state = {
  opened: 'OPENED',
  closed: 'CLOSED'
}

export const SideBar = () => {
  const [teams, setTeams] = useState([]);
  const [panelState, setPanelState] = useState(state.closed)
  const [panelContent, setPanelContent] = useState()


  const { tenant, connectedUser, impersonator, unreadNotificationsCount, isTenantAdmin } = useSelector((state) => state.context)
  const dispatch = useDispatch();
  const location = useLocation();

  const { totalUnread } = useContext(MessagesContext);
  const { translateMethod } = useContext(I18nContext);
  const { setMode, navMode, setBackOfficeMode, setFrontOfficeMode, ...navContext } = useContext(NavContext)


  useEffect(() => {
    setPanelState(state.closed);
  }, [location]);

  useEffect(() => {
    Promise.all([
      Services.myUnreadNotificationsCount(),
      Services.teams()
    ]).then(
      ([notifCount, teams]) => {
        updateNotifications(notifCount.count)(dispatch);
        setTeams(teams);
      }
    );
  }, []);



  const impersonatorStyle = impersonator
    ? { border: '3px solid red', boxShadow: '0px 0px 5px 2px red' }
    : {};

  return (
    <div className='navbar-container d-flex flex-row'>
      <div className="navbar d-flex flex-column p-2 align-items-center justify-content-between">
        <div className="navbar_top d-flex flex-column align-items-center">
          <Link
            to="/apis"
            title="Daikoku home"
            className='mb-3'
            style={{
              width: '40px',
            }}>
            <img
              src={tenant.logo}
            />
          </Link>

          {!connectedUser.isGuest && <>
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
          </>}
        </div>

        <div className="navbar_bottom">
          <div className="nav_item mb-3">
            {(connectedUser.isDaikokuAdmin || isTenantAdmin) && (
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
          {!connectedUser.isGuest && <div className="nav_item mb-3">
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
          </div>}
          <div className="nav_item mb-3" style={{ color: '#fff' }}>
            <img
              style={{ width: '35px', ...impersonatorStyle }}
              src={connectedUser.picture}
              className="logo-anonymous user-logo"
              onClick={() => {
                if (!connectedUser.isGuest) {
                  setPanelState(state.opened)
                  setPanelContent(<SettingsPanel />)
                } else {
                  setPanelState(state.opened)
                  setPanelContent(<GuestPanel />)
                }
              }}
              title={
                impersonator
                  ? `${connectedUser.name} (${connectedUser.email
                  }) ${translateMethod('Impersonated by')} ${impersonator.name} (${impersonator.email
                  })`
                  : connectedUser.name
              }
              alt="user menu"
            />
          </div>

        </div>
      </div>
      <Companion />
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
      })} onClick={() => setPanelState(state.closed)} /> 
      

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
