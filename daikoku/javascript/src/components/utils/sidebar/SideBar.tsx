import classNames from 'classnames';
import { useContext, useEffect, useState } from 'react';
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


export const state = {
  opened: 'OPENED',
  closed: 'CLOSED',
};

export const SideBar = () => {
  const [panelState, setPanelState] = useState(state.closed);
  const [panelContent, setPanelContent] = useState<JSX.Element>();

  const { tenant, connectedUser, impersonator, isTenantAdmin, unreadNotificationsCount } = useContext(GlobalContext);
  const location = useLocation();

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
      <div className="navbar d-flex flex-column p-2 align-items-center justify-content-between">
        <div className="navbar_top d-flex flex-column align-items-center">
          <a
            href='/'
            title={translate("Daikoku.home")}
            aria-label={translate("Daikoku.home")}
            className="mb-3 brand"
          >
            <img src={tenant.logo} alt={translate("tenant.logo")} />
          </a>
          <div className="nav_item mb-3 cursor-pointer">
            <Link
              to="/apis"
              title={translate("API.list")}
              aria-label={translate("API.list")}
              className="notification-link notification-link-color"
            >
              <RectangleList />
            </Link>
          </div>

          {!connectedUser.isGuest && (
            <>
              <button className="nav_item mb-3 cursor-pointer">
                <Search
                  className="notification-link notification-link-color"
                  aria-label={translate('sidebar.search.button.aria.label')}
                  onClick={() => {
                    setPanelState(state.opened);
                    setPanelContent(<SearchPanel />);
                  }}
                />
              </button>
              <button className="nav_item mb-3 cursor-pointer">
                <Plus
                  className="notification-link notification-link-color"
                  aria-label={translate("sidebar.create.button.aria.label")}
                  onClick={() => {
                    setPanelState(state.opened);
                    setPanelContent(<AddPanel />);
                  }}
                />
              </button>
            </>
          )}
          {!connectedUser.isGuest && (
            <button className="nav_item mb-3 cursor-pointer">
              <More
                className="notification-link notification-link-color"
                aria-label={translate("sidebar.more.button.aria.label")}
                onClick={() => {
                  setPanelState(state.opened);
                  setPanelContent(<MorePanel />);
                }} />
            </button>
          )}
        </div>

        <div className="navbar_bottom">
          {isAdmin && (
            <Link
              to="/settings/messages"
              className={classNames(
                'nav-item mb-3 notification-link  notification-link-color messages-link cursor-pointer',
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
                'nav_item mb-3 notification-link notification-link-color messages-link cursor-pointer',
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
              className="nav_item mb-3"
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
          <button className="nav_item mb-3"
            aria-label={translate("sidebar.dark.mode.button.aria.label")}>
            <DarkModeActivator className="notification-link notification-link-color"/>
          </button>

          <div className="nav_item mb-3" style={{ color: '#fff' }}>
            <img
              style={{ width: '35px', ...impersonatorStyle }}
              src={connectedUser.picture}
              className="logo-anonymous user-logo"
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
              alt="user menu"
            />
          </div>
        </div>
      </div>
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
