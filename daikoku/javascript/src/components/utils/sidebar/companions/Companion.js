
import React, { useState, useEffect, useContext } from 'react';
import classNames from 'classnames';
import { ChevronLeft, ChevronRight } from 'react-feather';

import { state } from '..'
import { NavContext, navMode } from '../../../../contexts';

export const Companion = () => {
  const [companionState, setCompanionState] = useState(state.closed);
  const { mode, menu } = useContext(NavContext);

  useEffect(() => {
    if (mode !== navMode.initial) {
      setCompanionState(state.opened);
    }
  }, [mode]);


  if (mode === navMode.initial) {
    return null;
  }

  return (
    <div className={classNames("navbar-companion", {
      opened: companionState === state.opened,
      closed: companionState === state.closed,
    })}>
      <span className='companion-button' onClick={() => setCompanionState(companionState === state.closed ? state.opened : state.closed)}>
        {companionState === state.closed && <ChevronRight />}
        {companionState === state.opened && <ChevronLeft />}
      </span>
      <div className='companion-content'>
        <div className="companion-title">
          <h3>{menu?.title}</h3>
        </div>
        <div className="blocks d-flex flex-column justify-content-between">
          {Object.values(menu?.blocks || {})
            .sort((a, b) => a.order - b.order)
            .map((block, idx) => {
              return (
                <div key={`${performance.now}${idx}`} className="block">
                  <div className='d-flex flex-column block__entries'>
                    {block.links && Object.values(block.links).map((entry, idx) => {
                      let link = null
                      if (entry.action) {
                        link =  <span key={`${performance.now}-link-${idx}`} className={classNames('block__entry__link', entry.className)} onClick={() => entry.action()}>{entry.label}</span>
                      } else if (entry.link) {
                          link = <Link key={`${performance.now}-link-${idx}`} className={classNames('block__entry__link', entry.className)} to={entry.link}>{entry.label}</Link>
                      } else if (entry.component) {
                        link = React.cloneElement(entry.component, { key: `${performance.now}-link-${idx}` })
                      }
                      return (
                        <>
                          {link}
                          {entry.childs && (
                            <div className="entry__submenu d-flex flex-column" key={`${performance.now}-submenu-${idx}`}>
                              {Object.values(entry.childs).map((entry, idx) => {
                                if (entry.action) {
                                  return <span key={`${performance.now}-child-${idx}`} className={classNames('submenu__entry__link', entry.className)} onClick={() => entry.action()}>{entry.label}</span>
                                } else if (entry.link) {
                                  return <Link key={`${performance.now}-child-${idx}`} className={classNames('submenu__entry__link', entry.className)} to={entry.link}>{entry.label}</Link>
                                } else if (entry.component) {
                                  return React.cloneElement(entry.component, { key: `${performance.now}-child-${idx}` })
                                }
                              })}
                            </div>
                          )}
                        </>
                      )
                    })}
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}