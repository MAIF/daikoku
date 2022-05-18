import React, { useState, useEffect, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import classNames from 'classnames';
import { Search, Plus, MessageSquare, Bell, ArrowLeft } from 'react-feather';

import * as Services from '../../../services';
import { updateNotifications } from '../../../core/context/actions';
import { I18nContext } from '../../../locales/i18n-context';
import { MessagesContext } from '../../backoffice';
import { NavContext } from '../../../contexts';

import { AddPanel, GuestPanel, SearchPanel, SettingsPanel } from './panels';
import { Companion } from './companions';

export const state = {
  opened: 'OPENED',
  closed: 'CLOSED',
};

export const SideBar = () => {
  const [teams, setTeams] = useState([]);
  const [panelState, setPanelState] = useState(state.closed);
  const [panelContent, setPanelContent] = useState();

  const { tenant, connectedUser, impersonator, unreadNotificationsCount, isTenantAdmin } =
    useSelector((state) => state.context);
  const dispatch = useDispatch();
  const location = useLocation();

  const { totalUnread } = useContext(MessagesContext);
  const { translateMethod } = useContext(I18nContext);
  const { setMode, navMode, setBackOfficeMode, setFrontOfficeMode, ...navContext } =
    useContext(NavContext);

  useEffect(() => {
    setPanelState(state.closed);
  }, [location]);

  useEffect(() => {
    Promise.all([Services.myUnreadNotificationsCount(), Services.teams()]).then(
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
            <img src={tenant.logo} />
          </Link>

          {!connectedUser.isGuest && (
            <>
              <div className="nav_item mb-3 cursor-pointer">
                <Search
                  className="notification-link"
                  onClick={() => {
                    setPanelState(state.opened);
                    setPanelContent(<SearchPanel teams={teams} />);
                  }}
                />
              </div>
              <div className="nav_item mb-3 cursor-pointer">
                <Plus
                  className="notification-link"
                  onClick={() => {
                    setPanelState(state.opened);
                    setPanelContent(<AddPanel teams={teams} />);
                  }}
                />
              </div>
            </>
          )}
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
          {!connectedUser.isGuest && (
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
                  ? `${connectedUser.name} (${connectedUser.email}) ${translateMethod(
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
