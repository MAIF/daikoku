import React, { useState, useEffect, useContext } from 'react';
import classNames from 'classnames';
import ChevronLeft from 'react-feather/dist/icons/chevron-left'
import ChevronRight from 'react-feather/dist/icons/chevron-right'
import { Link } from 'react-router-dom';

import { state } from '..';
import { NavContext, navMode } from '../../../../contexts';
import { nanoid } from 'nanoid';

export const Companion = () => {
  const [companionState, setCompanionState] = useState(state.closed);
  const { mode, menu } = useContext<any>(NavContext);

  useEffect(() => {
    if (mode !== navMode.initial) {
      setCompanionState(state.opened);
    }
  }, [mode]);

  if (mode === navMode.initial) {
    return null;
  }

  return (<div className={classNames('navbar-companion', {
    opened: companionState === state.opened,
    closed: companionState === state.closed,
  })}>
    <span className="companion-button" onClick={() => setCompanionState(companionState === state.closed ? state.opened : state.closed)}>
      {companionState === state.closed && <ChevronRight />}
      {companionState === state.opened && <ChevronLeft />}
    </span>
    <div className="companion-content">
      <div className="companion-title">
        <h3>{menu?.title}</h3>
      </div>
      <div className="blocks d-flex flex-column justify-content-between">
        {Object.values(menu?.blocks || {})
          .sort((a: any, b: any) => a.order - b.order)
          .map((block: any, idx) => {
            return (<div key={`${performance.now()}${idx}`} className="block">
              <div className="d-flex flex-column block__entries">
                {block.links &&
                  Object.values(block.links)
                    .sort((a: any, b: any) => a.order - b.order)
                    .filter((x: any) => x.visible || x.visible === undefined)
                    .map((entry: any, linkidx) => {
                      let link: React.ReactNode = <></>;
                      if (entry.action) {
                        link = (<span key={`${entry.label}-link-${idx}-${linkidx}`} className={classNames(entry.className, 'block__entry__link')} onClick={() => entry.action()}>
                          {entry.label}
                        </span>);
                      }
                      else if (entry.link) {
                        link = (<Link key={`${entry.label}-link-${idx}-${linkidx}`} className={classNames(entry.className, 'block__entry__link')} to={entry.link}>
                          {entry.label}
                        </Link>);
                      }
                      else if (entry.component) {
                        link = React.cloneElement(entry.component, {
                          key: `${nanoid()}-link-${idx}-${linkidx}`,
                        });
                      }
                      return (<React.Fragment key={linkidx}>
                        {link}
                        {entry.childs && (<div className="entry__submenu d-flex flex-column" key={`${nanoid()}-submenu-${idx}`}>
                          {Object.values(entry.childs)
                            .filter((x: any) => x.visible || x.visible === undefined)
                            .map((entry: any, idx) => {
                              if (entry.action) {
                                return (<span key={`${entry.label}-child-${idx}`} className={classNames('submenu__entry__link', entry.className)} onClick={() => entry.action()}>
                                  {entry.label}
                                </span>);
                              } else if (entry.link) {
                                return (<Link key={`${entry.label}-child-${idx}`} className={classNames('submenu__entry__link', entry.className)} to={entry.link}>
                                  {entry.label}
                                </Link>);
                              } else if (entry.component) {
                                return React.cloneElement(entry.component, {
                                  key: `${nanoid()}-child-${idx}`,
                                });
                              }
                            })}
                        </div>)}
                      </React.Fragment>);
                    })}
              </div>
            </div>);
          })}
      </div>
    </div>
  </div>)
}
