import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';

import * as Services from '../../../../services';
import { updateTenant } from '../../../../core/context/actions';
// @ts-expect-error TS(6142): Module '../../../../locales/i18n-context' was reso... Remove this comment to see the full error message
import { I18nContext } from '../../../../locales/i18n-context';
import { CanIDoAction, manage, team } from '../../..';

const DarkModeActivator = ({
  initialDark
}: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="block__entry__link" onClick={() => setTheme(theme === DARK ? LIGHT : DARK)}>
      {theme === DARK ? translateMethod('Light mode') : translateMethod('Dark mode')}
    </div>
  );
};

export const SettingsPanel = ({}) => {
  const [version, setVersion] = useState();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, isTranslationMode } = useContext(I18nContext);
  const { tenant, connectedUser, impersonator, isTenantAdmin } = useSelector((state) => (state as any).context);

  const dispatch = useDispatch();

  useEffect(() => {
    Services.getDaikokuVersion().then((res) => setVersion(res.version));
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

    toggleApi().then((maybeTenant) => {
      if (maybeTenant._id) {
        updateTenant(maybeTenant)(dispatch);
      }
    });
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="mb-3 panel__title">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h3>{translateMethod('Settings')}</h3>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="blocks">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="mb-3 block">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="mb-1 block__category">{connectedUser.email}</div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="ms-2 block__entries block__border d-flex flex-column">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Link to="/me" className="block__entry__link">
              {translateMethod('My profile')}
            </Link>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <a href="/logout" className="block__entry__link">
              {translateMethod('Logout')}
            </a>
            {impersonator && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <a href="/api/me/_deimpersonate" className="block__entry__link">
                {translateMethod('Quit impersonation')}
              </a>
            )}
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="dropdown-divider" />
        </div>
        {(isTenantAdmin || connectedUser.isDaikokuAdmin) && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="mb-3 block">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="mb-1 block__category">{translateMethod('settings')}</div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="ms-2 block__entries block__border d-flex flex-column">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Link to="/settings/settings" className="block__entry__link">
                {tenant.name} {translateMethod('settings')}
              </Link>
              {connectedUser.isDaikokuAdmin && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Link to="/settings/tenants" className="block__entry__link">
                  {translateMethod('Daikoku settings')}
                </Link>
              )}
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="dropdown-divider" />
          </div>
        )}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="mb-3 block">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="mb-1 block__category">{translateMethod('actions')}</div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="ms-2 block__entries block__border d-flex flex-column">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <DarkModeActivator />
            {connectedUser.isDaikokuAdmin && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <span className="block__entry__link" onClick={reset}>
                {translateMethod('Reset')}
              </span>
            )}
            {isTenantAdmin && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <span className="block__entry__link" onClick={toggleMaintenanceMode}>
                {translateMethod(isMaintenanceMode ? 'Disable maintenance' : 'Maintenance mode')}
              </span>
            )}
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="dropdown-divider" />
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="mb-3 block">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="mb-1 block__category">{translateMethod('version')}</div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="ms-2 block__entries block__border d-flex flex-column">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span className="pe-none block__entry__link">
              {translateMethod('Version used')} : {version || '?.??.??'}
            </span>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="dropdown-divider" />
        </div>
      </div>
    </div>
  );
};
