import React, { useContext, useEffect } from 'react';
import classNames from 'classnames';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { NavContext } from '../../../../contexts';
import {Can, manage, api as API} from '../../'

export const ApiFrontOffice = () => {
  const { api, team, tab, setTab } = useContext(NavContext);
  const navigate = useNavigate()
  const location = useLocation()

  const navigateTo = (tab) => {
    setTab(tab)
    navigate(`/${team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/${tab}`)
  }

  useEffect(() => {
    if (!tab) {
      const pathTab = location.pathname.split('/').pop()
      setTab(pathTab)
    }
  }, [])
  

  return (
    <div className='companion-content'>
      <div className="companion-title">{api.name}</div>
      <div className="blocks d-flex flex-column justify-content-between">
        <div className="block">
          <div className='d-flex flex-column block__entries'>
            <span className={classNames('block__entry__link', { active: tab === 'description' })} onClick={() => navigateTo('description')}>Description</span>
            <span className={classNames('block__entry__link', { active: tab === 'pricing' })} onClick={() => navigateTo('pricing')}>Plans</span>
            <span className={classNames('block__entry__link', { active: tab === 'documentation' })} onClick={() => navigateTo('documentation')}>Documentation</span>
            <span className={classNames('block__entry__link', { active: tab === 'redoc' })} onClick={() => navigateTo('redoc')}>API Ref</span>
            <span className={classNames('block__entry__link', { active: tab === 'swagger' })} onClick={() => navigateTo('swagger')}>Try it!</span>
            <span className={classNames('block__entry__link', { active: tab === 'issues' })} onClick={() => navigateTo('issues')}>Issues</span>
          </div>
        </div>
        <div className="block">
          <div className='d-flex flex-column block__entries'>
            <Can I={manage} a={api} team={team}>
              <Link to={`/${team._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/${tab}`} className='block__entry__link'>Edit API</Link>
            </Can>
          </div>
        </div>
      </div>
    </div>
  )

}