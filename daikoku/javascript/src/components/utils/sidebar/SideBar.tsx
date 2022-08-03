import React, { useState, useEffect, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import classNames from 'classnames';
import { Search, Plus, MessageSquare, Bell, ArrowLeft } from 'react-feather';

import * as Services from '../../../services';
import { updateNotifications } from '../../../core/context/actions';
// @ts-expect-error TS(6142): Module '../../../locales/i18n-context' was resolve... Remove this comment to see the full error message
import { I18nContext } from '../../../locales/i18n-context';
import { MessagesContext } from '../../backoffice';

import { AddPanel, GuestPanel, SearchPanel, SettingsPanel, MessagePanel } from './panels';
import { Companion } from './companions';

export const state = {
  opened: 'OPENED',
  closed: 'CLOSED',
};

export const SideBar = () => {
  const [teams, setTeams] = useState([]);
  const [panelState, setPanelState] = useState(state.closed);
  const [panelContent, setPanelContent] = useState();

  const { tenant, connectedUser, impersonator, unreadNotificationsCount, isTenantAdmin } = useSelector((state) => (state as any).context);
  const dispatch = useDispatch();
  const location = useLocation();

  // @ts-expect-error TS(2339): Property 'totalUnread' does not exist on type 'unk... Remove this comment to see the full error message
  const { totalUnread } = useContext(MessagesContext);
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="navbar-container d-flex flex-row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="navbar d-flex flex-column p-2 align-items-center justify-content-between">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="navbar_top d-flex flex-column align-items-center">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Link
            to="/apis"
            title="Daikoku home"
            className="mb-3"
            style={{
              width: '40px',
            }}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <img
              style={{
                width: '40px',
              }}
              src={tenant.logo}
            />
          </Link>

          {!connectedUser.isGuest && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="nav_item mb-3 cursor-pointer">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Search
                  className="notification-link"
                  onClick={() => {
                    setPanelState(state.opened);
                    // @ts-expect-error TS(2345): Argument of type 'Element' is not assignable to pa... Remove this comment to see the full error message
                    setPanelContent(<SearchPanel teams={teams} />);
                  }}
                />
              </div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="nav_item mb-3 cursor-pointer">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Plus
                  className="notification-link"
                  onClick={() => {
                    setPanelState(state.opened);
                    // @ts-expect-error TS(2345): Argument of type 'Element' is not assignable to pa... Remove this comment to see the full error message
                    setPanelContent(<AddPanel teams={teams} />);
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="navbar_bottom">
          {isAdmin && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <Link
              to="/settings/messages"
              className={classNames(
                'nav-item mb-3 notification-link messages-link cursor-pointer',
                {
                  'unread-notifications': totalUnread > 0,
                }
              )}
              title={translateMethod('Access to the messages')}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <MessageSquare />
            </Link>
          )}
          {!connectedUser.isGuest && !isAdmin && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div
              className={classNames(
                'nav-item mb-3 notification-link messages-link cursor-pointer',
                {
                  'unread-notifications': totalUnread > 0,
                }
              )}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <MessageSquare
                onClick={() => {
                  setPanelState(state.opened);
                  // @ts-expect-error TS(2345): Argument of type 'Element' is not assignable to pa... Remove this comment to see the full error message
                  setPanelContent(<MessagePanel />);
                }}
              />
            </div>
          )}
          {!connectedUser.isGuest && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="nav_item mb-3">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Link
                  className={classNames({
                    'notification-link': true,
                    'unread-notifications': !!unreadNotificationsCount,
                  })}
                  to="/notifications"
                  title={translateMethod('Access to the notifications')}
                >
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Bell />
                </Link>
              </div>
            </>
          )}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="nav_item mb-3" style={{ color: '#fff' }}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <img
              style={{ width: '35px', ...impersonatorStyle }}
              src={connectedUser.picture}
              className="logo-anonymous user-logo"
              onClick={() => {
                if (!connectedUser.isGuest) {
                  setPanelState(state.opened);
                  // @ts-expect-error TS(2345): Argument of type 'Element' is not assignable to pa... Remove this comment to see the full error message
                  setPanelContent(<SettingsPanel />);
                } else {
                  setPanelState(state.opened);
                  // @ts-expect-error TS(2345): Argument of type 'Element' is not assignable to pa... Remove this comment to see the full error message
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
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Companion />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div
        className={classNames('navbar-panel d-flex flex-row', {
          opened: panelState === state.opened,
          closed: panelState === state.closed,
        })}
      >
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="mt-2 ms-2 ">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="cursor-pointer navbar-panel__back d-flex align-items-center justify-content-center">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ArrowLeft className="" onClick={() => setPanelState(state.closed)} />
          </div>
        </div>
        {panelContent}
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
