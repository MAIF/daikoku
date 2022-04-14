import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';

import * as Services from '../../../../services';
import { updateTenant } from '../../../../core/context/actions';
import { I18nContext } from '../../../../locales/i18n-context';

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

export const SettingsPanel = ({ }) => {
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
    <div className='ms-3 mt-2 col-8 d-flex flex-column panel'>
      <div className='mb-3 panel__title' style={{ height: '40px' }}>
        {translateMethod('Settings')}
      </div>
      <div className="blocks">
        <div className="mb-3 block">
          <div className="mb-1 block__category">{connectedUser.email}</div>
          <div className='ms-2 block__entries d-flex flex-column'>
            <Link to='/me' className='block__entry__link'>{translateMethod('My profile')}</Link>
            <a href='/logout' className='block__entry__link'>{translateMethod('Logout')}</a>
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
          </div>
          <div className="dropdown-divider" />
        </div>
        <div className="mb-3 block">
          <div className="mb-1 block__category">{translateMethod('version')}</div>
          <div className='ms-2 block__entries d-flex flex-column'>
            <span className='block__entry__link'>{translateMethod('Version used')} : {version || '?.??.??'}</span>
          </div>
          <div className="dropdown-divider" />
        </div>
      </div>
    </div>
  )
}