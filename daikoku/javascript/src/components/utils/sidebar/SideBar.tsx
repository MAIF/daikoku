import classNames from 'classnames';
import { JSX, PropsWithChildren, ReactNode, useContext, useEffect, useState } from 'react';
import ArrowLeft from 'react-feather/dist/icons/arrow-left';
import Bell from 'react-feather/dist/icons/bell';
import RectangleList from 'react-feather/dist/icons/list';
import MessageSquare from 'react-feather/dist/icons/message-square';
import More from 'react-feather/dist/icons/more-vertical';
import Plus from 'react-feather/dist/icons/plus';
import Search from 'react-feather/dist/icons/search';
import { Link, useLocation } from 'react-router-dom';

import { GlobalContext } from '../../../contexts/globalContext';
import { I18nContext } from '../../../contexts/i18n-context';
import { MessagesContext } from '../../backoffice';
import { Companion } from './companions';
import { AddPanel, DarkModeActivator, GuestPanel, MessagePanel, SearchPanel, SettingsPanel } from './panels';
import { MorePanel } from './panels/MorePanel';
import { getInitials, userHasAvatar } from '../..';
import { absolutePath } from 'swagger-ui-dist';
import { ModalContext } from '../../../contexts';


export const state = {
  opened: 'OPENED',
  closed: 'CLOSED',
};

export const SideBar = () => {
  const [panelState, setPanelState] = useState(state.closed);
  const [panelContent, setPanelContent] = useState<JSX.Element>();

  const location = useLocation();

  const { tenant, connectedUser, impersonator, isTenantAdmin, unreadNotificationsCount } = useContext(GlobalContext);
  const { totalUnread } = useContext(MessagesContext);
  const { translate } = useContext(I18nContext);

  useEffect(() => {
    setPanelState(state.closed);
  }, [location]);

  const closeOnEsc = (e: any) => {
    if (e.key == 'Escape' || e.key == 'Esc') {
      e.preventDefault();
      setPanelState(state.closed);
      return false;
    }
  };
  useEffect(() => {
    window.addEventListener('keydown', closeOnEsc, true);

    return () => {
      window.removeEventListener('keydown', closeOnEsc, true);
    };
  }, []);

  const impersonatorStyle = impersonator
    ? { border: '3px solid red', boxShadow: '0px 0px 5px 2px red' }
    : {};

  const isAdmin = connectedUser.isDaikokuAdmin || isTenantAdmin;

  if (location.pathname === '/') {
    return null;
  }

  return (
    <div className="navbar-container d-flex flex-row">
      <Companion />
      <div
        className={classNames('navbar-panel d-flex flex-row', {
          opened: panelState === state.opened,
          closed: panelState === state.closed,
        })}
      >
        <div className="mt-2 ms-2 ">
          <div className="cursor-pointer navbar-panel__back d-flex align-items-center justify-content-center companion-link">
            <ArrowLeft className="" onClick={() => setPanelState(state.closed)} />
          </div>
        </div>
        {panelContent}
      </div>
      <div
        className={classNames('navbar-panel-background', {
          opened: panelState === state.opened,
          closed: panelState === state.closed,
        })}
        onClick={() => setPanelState(state.closed)}
      />
    </div>
  );
};

export const TopBar = () => {
  const [panelState, setPanelState] = useState(state.closed);
  const [panelContent, setPanelContent] = useState<JSX.Element>();

  const location = useLocation();

  const { tenant, connectedUser, impersonator, isTenantAdmin, unreadNotificationsCount } = useContext(GlobalContext);
  const { totalUnread } = useContext(MessagesContext);
  const { translate } = useContext(I18nContext);

  useEffect(() => {
    setPanelState(state.closed);
  }, [location]);

  const closeOnEsc = (e: any) => {
    if (e.key == 'Escape' || e.key == 'Esc') {
      e.preventDefault();
      setPanelState(state.closed);
      return false;
    }
  };
  useEffect(() => {
    window.addEventListener('keydown', closeOnEsc, true);

    return () => {
      window.removeEventListener('keydown', closeOnEsc, true);
    };
  }, []);

  const impersonatorStyle = impersonator
    ? { border: '3px solid red', boxShadow: '0px 0px 5px 2px red' }
    : {};

  const isAdmin = connectedUser.isDaikokuAdmin || isTenantAdmin;

  if (location.pathname === '/') {
    return null;
  }

  return (
    <div className="navbar-top d-flex flex-row align-items-center px-4">
      <div className="navbar_left d-flex flex-row align-items-center gap-3">
        <Link
          to={tenant.homePageVisible ? '/' : '/apis'}
          title={translate("Daikoku.home")}
          aria-label={translate("Daikoku.home")}
          className="brand"
        >
          {tenant.name}
        </Link>

        <div className="nav_item cursor-pointer">
          <Link
            to="/apis"
            title={translate("API.list")}
            aria-label={translate("API.list")}
            className="notification-link notification-link-color"
          >
            {translate('Tableau de bord')} {/* FIXME: trabnslation */}
          </Link>
        </div>

      </div>
      <div className="navbar_middle d-flex justify-content-center flex-grow-1">
        <SearchPanel />
      </div>
      <div className="navbar_right d-flex align-items-center gap-2">
        {isAdmin && (
          <Link
            to="/settings/messages"
            className={classNames(
              'nav-item notification-link  notification-link-color messages-link cursor-pointer',
              {
                'unread-notifications': totalUnread > 0,
              }
            )}
            title={translate('Access to the messages')}
          >
            <MessageSquare />
          </Link>
        )}
        {!connectedUser.isGuest && !isAdmin && (
          <button
            className={classNames(
              'nav_item notification-link notification-link-color messages-link cursor-pointer',
              {
                'unread-notifications': totalUnread > 0,
              }
            )}
            aria-label={translate("sidebar.messages.button.aria.label")}
          >
            <MessageSquare
              onClick={() => {
                setPanelState(state.opened);
                setPanelContent(<MessagePanel />);
              }}
            />
          </button>
        )}
        {!connectedUser.isGuest && (
          <button
            className="nav_item"
            aria-label={translate("sidebar.notifications.button.aria.label")}>
            <Link
              className={classNames({
                'notification-link notification-link-color': true,
                'unread-notifications': !!unreadNotificationsCount,
              })}
              to="/notifications"
              title={translate('Access to the notifications')}
              aria-label={translate('Access to the notifications')}
            >
              <Bell />
            </Link>
          </button>
        )}
        <button className="nav_item"
          aria-label={translate("sidebar.dark.mode.button.aria.label")}>
          <DarkModeActivator className="notification-link notification-link-color" />
        </button>

        <div className="nav_item dropdown" style={{ color: '#fff' }}>
          <button className="btn" type="button" data-bs-toggle="dropdown" aria-expanded="false">
            {!userHasAvatar(connectedUser) && <div
              role="img" aria-label="user menu"
              style={{ width: '35px', height: '35px', ...impersonatorStyle }}
              className="logo-anonymous user-logo avatar-without-img"
              onClick={() => {
                if (!connectedUser.isGuest) {
                  setPanelState(state.opened);
                  setPanelContent(<SettingsPanel />);
                } else {
                  setPanelState(state.opened);
                  setPanelContent(<GuestPanel />);
                }
              }}
              title={
                impersonator
                  ? `${connectedUser.name} (${connectedUser.email}) ${translate(
                    'Impersonated by'
                  )} ${impersonator.name} (${impersonator.email})`
                  : connectedUser.name
              }
            >{getInitials(connectedUser.name)}</div>}
            {userHasAvatar(connectedUser) && <img
              style={{ width: '35px', height: '35px', ...impersonatorStyle }}
              src={connectedUser.picture}
              className="logo-anonymous user-logo"
              title={
                impersonator
                  ? `${connectedUser.name} (${connectedUser.email}) ${translate(
                    'Impersonated by'
                  )} ${impersonator.name} (${impersonator.email})`
                  : connectedUser.name
              }
              alt="user menu"
            />}

          </button>
          <div className="dropdown-menu" style={{ width: '400px' }}>
            {!connectedUser.isGuest && <SettingsPanel />}
            {connectedUser.isGuest && <GuestPanel />}
          </div>

        </div>
      </div>
    </div>
  )
}
