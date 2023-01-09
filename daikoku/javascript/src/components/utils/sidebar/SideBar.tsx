import React, { useState, useEffect, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import classNames from 'classnames';
import { Search, Plus, MessageSquare, Bell, ArrowLeft } from 'react-feather';

import * as Services from '../../../services';
import { updateNotifications } from '../../../core/context/actions';
import { I18nContext } from '../../../contexts/i18n-context';
import { MessagesContext } from '../../backoffice';

import { AddPanel, GuestPanel, SearchPanel, SettingsPanel, MessagePanel } from './panels';
import { Companion } from './companions';
import { isError, IState, IStateContext, ITeamSimple } from '../../../types';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '../Spinner';

export const state = {
  opened: 'OPENED',
  closed: 'CLOSED',
};

export const SideBar = () => {
  const [panelState, setPanelState] = useState(state.closed);
  const [panelContent, setPanelContent] = useState<JSX.Element>();

  const { tenant, connectedUser, impersonator, unreadNotificationsCount, isTenantAdmin } = useSelector<IState, IStateContext>((state) => state.context);
  const dispatch = useDispatch();
  const location = useLocation();

  const { totalUnread } = useContext(MessagesContext);
  const { translate } = useContext(I18nContext);

  useEffect(() => {
    setPanelState(state.closed);
  }, [location]);

  useEffect(() => {
    Services.myUnreadNotificationsCount()
      .then( (notifCount) => {
          dispatch(updateNotifications(notifCount.count));
        }
      );
  }, []);

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

  
    return (
      <div className="navbar-container d-flex flex-row">
        <div className="navbar d-flex flex-column p-2 align-items-center justify-content-between">
          <div className="navbar_top d-flex flex-column align-items-center">
            <Link
              to="/apis"
              title="Daikoku home"
              className="mb-3"
              style={{
                width: '40px',
              }}
            >
              <img
                style={{
                  width: '40px',
                }}
                src={tenant.logo}
              />
            </Link>
  
            {!connectedUser.isGuest && (
              <>
                <div className="nav_item mb-3 cursor-pointer">
                  <Search
                    className="notification-link"
                    onClick={() => {
                      setPanelState(state.opened);
                      setPanelContent(<SearchPanel />);
                    }}
                  />
                </div>
                <div className="nav_item mb-3 cursor-pointer">
                  <Plus
                    className="notification-link"
                    onClick={() => {
                      setPanelState(state.opened);
                      setPanelContent(<AddPanel />);
                    }}
                  />
                </div>
              </>
            )}
          </div>
  
          <div className="navbar_bottom">
            {isAdmin && (
              <Link
                to="/settings/messages"
                className={classNames(
                  'nav-item mb-3 notification-link messages-link cursor-pointer',
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
              <div
                className={classNames(
                  'nav-item mb-3 notification-link messages-link cursor-pointer',
                  {
                    'unread-notifications': totalUnread > 0,
                  }
                )}
              >
                <MessageSquare
                  onClick={() => {
                    setPanelState(state.opened);
                    setPanelContent(<MessagePanel />);
                  }}
                />
              </div>
            )}
            {!connectedUser.isGuest && (
              <>
                <div className="nav_item mb-3">
                  <Link
                    className={classNames({
                      'notification-link': true,
                      'unread-notifications': !!unreadNotificationsCount,
                    })}
                    to="/notifications"
                    title={translate('Access to the notifications')}
                  >
                    <Bell />
                  </Link>
                </div>
              </>
            )}
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
            <div className="cursor-pointer navbar-panel__back d-flex align-items-center justify-content-center">
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
