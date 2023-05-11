import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import Sun from 'react-feather/dist/icons/sun'
import Moon from 'react-feather/dist/icons/moon'

import * as Services from '../../../../services';
import { updateTenant } from '../../../../core/context/actions';
import { I18nContext } from '../../../../contexts/i18n-context';

export const DarkModeActivator = () => {
  const DARK = 'DARK';
  const LIGHT = 'LIGHT';

  const [theme, setTheme] = useState(localStorage.getItem('theme') || LIGHT);

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
    <div className="block__entry__link" onClick={() => setTheme(theme === DARK ? LIGHT : DARK)}>
      {theme === DARK ? <Sun/> : <Moon />}
    </div>
  );
};

export const SettingsPanel = ({ }) => {
  const [version, setVersion] = useState();

  const { translate, isTranslationMode } = useContext(I18nContext);
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
        dispatch(updateTenant(maybeTenant));
      }
    });
  };

  return (
    <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
      <div className="mb-3 panel__title">
        <h3>{translate('Settings')}</h3>
      </div>
      <div className="blocks">
        <div className="mb-3 block">
          <div className="mb-1 block__category">{connectedUser.email}</div>
          <div className="ms-2 block__entries block__border d-flex flex-column">
            <Link to="/me" className="block__entry__link">
              {translate('My profile')}
            </Link>
            <a href="/logout" className="block__entry__link">
              {translate('Logout')}
            </a>
            {impersonator && (
              <a href="/api/me/_deimpersonate" className="block__entry__link">
                {translate('Quit impersonation')}
              </a>
            )}
          </div>
          <div className="dropdown-divider" />
        </div>
        {(isTenantAdmin || connectedUser.isDaikokuAdmin) && (
          <div className="mb-3 block">
            <div className="mb-1 block__category">{translate('settings')}</div>
            <div className="ms-2 block__entries block__border d-flex flex-column">
              <Link to="/settings/settings/general" className="block__entry__link">
                {tenant.name} {translate('settings')}
              </Link>
              {connectedUser.isDaikokuAdmin && (
                <Link to="/settings/tenants" className="block__entry__link">
                  {translate('Daikoku settings')}
                </Link>
              )}
            </div>
            <div className="dropdown-divider" />
          </div>
        )}
        <div className="mb-3 block">
          <div className="mb-1 block__category">{translate('actions')}</div>
          <div className="ms-2 block__entries block__border d-flex flex-column">
            {connectedUser.isDaikokuAdmin && (
              <span className="block__entry__link" onClick={reset}>
                {translate('Reset')}
              </span>
            )}
            {isTenantAdmin && (
              <span className="block__entry__link" onClick={toggleMaintenanceMode}>
                {translate(isMaintenanceMode ? 'Disable maintenance' : 'Maintenance mode')}
              </span>
            )}
          </div>
          <div className="dropdown-divider" />
        </div>
        <div className="mb-3 block">
          <div className="mb-1 block__category">{translate('version')}</div>
          <div className="ms-2 block__entries block__border d-flex flex-column">
            <span className="pe-none block__entry__link">
              {translate('Version used')} : {version || '?.??.??'}
            </span>
          </div>
          <div className="dropdown-divider" />
        </div>
      </div>
    </div>
  );
};
