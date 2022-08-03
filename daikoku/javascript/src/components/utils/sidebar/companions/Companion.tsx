import React, { useState, useEffect, useContext } from 'react';
import classNames from 'classnames';
import { ChevronLeft, ChevronRight } from 'react-feather';
import { Link } from 'react-router-dom';

import { state } from '..';
import { NavContext, navMode } from '../../../../contexts';

export const Companion = () => {
  const [companionState, setCompanionState] = useState(state.closed);
  // @ts-expect-error TS(2339): Property 'mode' does not exist on type 'unknown'.
  const { mode, menu } = useContext(NavContext);

  useEffect(() => {
    if (mode !== navMode.initial) {
      setCompanionState(state.opened);
    }
  }, [mode]);

  if (mode === navMode.initial) {
    return null;
  }

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div className={classNames('navbar-companion me-3', {
        opened: companionState === state.opened,
        closed: companionState === state.closed,
    })}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <span className="companion-button" onClick={() => setCompanionState(companionState === state.closed ? state.opened : state.closed)}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {companionState === state.closed && <ChevronRight />}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {companionState === state.opened && <ChevronLeft />}
      </span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="companion-content">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="companion-title">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h3>{menu?.title}</h3>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="blocks d-flex flex-column justify-content-between">
          {Object.values(menu?.blocks || {})
        .sort((a, b) => (a as any).order - (b as any).order)
        .map((block, idx) => {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return (<div key={`${performance.now()}${idx}`} className="block">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="d-flex flex-column block__entries">
                    {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                    {block.links &&
                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                Object.values(block.links)
                    // @ts-expect-error TS(2571): Object is of type 'unknown'.
                    .sort((a, b) => a.order - b.order)
                    // @ts-expect-error TS(2571): Object is of type 'unknown'.
                    .filter((x) => x.visible || x.visible === undefined)
                    .map((entry, linkidx) => {
                    let link = null;
                    // @ts-expect-error TS(2571): Object is of type 'unknown'.
                    if (entry.action) {
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        link = (<span key={`${performance.now()}-link-${idx}-${linkidx}`} className={classNames(entry.className, 'block__entry__link')} onClick={() => entry.action()}>
                                {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                                {entry.label}
                              </span>);
                    }
                    // @ts-expect-error TS(2571): Object is of type 'unknown'.
                    else if (entry.link) {
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        link = (<Link key={`${performance.now()}-link-${idx}-${linkidx}`} className={classNames(entry.className, 'block__entry__link')} to={entry.link}>
                                {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                                {entry.label}
                              </Link>);
                    }
                    // @ts-expect-error TS(2571): Object is of type 'unknown'.
                    else if (entry.component) {
                        // @ts-expect-error TS(2571): Object is of type 'unknown'.
                        link = React.cloneElement(entry.component, {
                            key: `${performance.now()}-link-${idx}-${linkidx}`,
                        });
                    }
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    return (<>
                              {link}
                              {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                              {entry.childs && (<div className="entry__submenu d-flex flex-column" key={`${performance.now()}-submenu-${idx}`}>
                                  {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                                  {Object.values(entry.childs)
                                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                                .filter((x) => x.visible || x.visible === undefined)
                                .map((entry, idx) => {
                                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                                if (entry.action) {
                                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                                    return (<span key={`${performance.now()}-child-${idx}`} className={classNames('submenu__entry__link', entry.className)} onClick={() => entry.action()}>
                                            {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                                            {entry.label}
                                          </span>);
                                }
                                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                                else if (entry.link) {
                                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                                    return (<Link key={`${performance.now()}-child-${idx}`} className={classNames('submenu__entry__link', entry.className)} to={entry.link}>
                                            {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                                            {entry.label}
                                          </Link>);
                                }
                                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                                else if (entry.component) {
                                    // @ts-expect-error TS(2571): Object is of type 'unknown'.
                                    return React.cloneElement(entry.component, {
                                        key: `${performance.now()}-child-${idx}`,
                                    });
                                }
                            })}
                                </div>)}
                            </>);
                })}
                  </div>
                </div>);
    })}
        </div>
      </div>
    </div>);
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              return (<div key={`${performance.now()}${idx}`} className="block">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="d-flex flex-column block__entries">
                    {/* @ts-expect-error TS(2304): Cannot find name 'block'. */}
                    {(block as any).links &&
        // @ts-expect-error TS(2304): Cannot find name 'block'.
        Object.values((block as any).links)
            .sort((a, b) => (a as any).order - (b as any).order)
            .filter((x) => (x as any).visible || (x as any).visible === undefined)
            .map((entry, linkidx) => {
            let link = null;
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            if (entry.action) {
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                link = (<span key={`${performance.now()}-link-${idx}-${linkidx}`} className={classNames(entry.className, 'block__entry__link')} onClick={() => entry.action()}>
                                {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                                {entry.label}
                              </span>);
            }
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            else if (entry.link) {
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                link = (<Link key={`${performance.now()}-link-${idx}-${linkidx}`} className={classNames(entry.className, 'block__entry__link')} to={entry.link}>
                                {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                                {entry.label}
                              </Link>);
            }
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            else if (entry.component) {
                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                link = React.cloneElement(entry.component, {
                    // @ts-expect-error TS(2304): Cannot find name 'idx'.
                    key: `${performance.now()}-link-${idx}-${linkidx}`,
                });
            }
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            return (<>
                              {link}
                              {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                              {entry.childs && (<div className="entry__submenu d-flex flex-column" key={`${performance.now()}-submenu-${idx}`}>
                                  {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                                  {Object.values(entry.childs)
                        // @ts-expect-error TS(2571): Object is of type 'unknown'.
                        .filter((x) => x.visible || x.visible === undefined)
                        .map((entry, idx) => {
                        // @ts-expect-error TS(2571): Object is of type 'unknown'.
                        if (entry.action) {
                            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                            return (<span key={`${performance.now()}-child-${idx}`} className={classNames('submenu__entry__link', entry.className)} onClick={() => entry.action()}>
                                            {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                                            {entry.label}
                                          </span>);
                        }
                        // @ts-expect-error TS(2571): Object is of type 'unknown'.
                        else if (entry.link) {
                            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                            return (<Link key={`${performance.now()}-child-${idx}`} className={classNames('submenu__entry__link', entry.className)} to={entry.link}>
                                            {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                                            {entry.label}
                                          </Link>);
                        }
                        // @ts-expect-error TS(2571): Object is of type 'unknown'.
                        else if (entry.component) {
                            // @ts-expect-error TS(2571): Object is of type 'unknown'.
                            return React.cloneElement(entry.component, {
                                key: `${performance.now()}-child-${idx}`,
                            });
                        }
                    })}
                                </div>)}
                            </>);
        })}
                  </div>
                {/* @ts-expect-error TS(2304): Cannot find name 'entry'. */}
                </div>);(entry as any).action) {
                            // @ts-expect-error TS(2304): Cannot find name 'link'.
                            link = (<span key={`${performance.now()}-link-${idx}-${linkidx}`} className={classNames((entry as any).className, 'block__entry__link')} onClick={() => (entry as any).action()}>
                                {/* @ts-expect-error TS(2304): Cannot find name 'entry'. */}
                                {(entry as any).label}
                              </span>);
                          // @ts-expect-error TS(2304): Cannot find name 'entry'.
                          } else if ((entry as any).link) {
                            // @ts-expect-error TS(2304): Cannot find name 'link'.
                            link = (<Link key={`${performance.now()}-link-${idx}-${linkidx}`} className={classNames((entry as any).className, 'block__entry__link')} to={(entry as any).link}>
                                {/* @ts-expect-error TS(2304): Cannot find name 'entry'. */}
                                {(entry as any).label}
                              </Link>);
                          // @ts-expect-error TS(2304): Cannot find name 'entry'.
                          } else if ((entry as any).component) {
                            // @ts-expect-error TS(2304): Cannot find name 'link'.
                            link = React.cloneElement((entry as any).component, {
    // @ts-expect-error TS(2304): Cannot find name 'idx'.
    key: `${performance.now()}-link-${idx}-${linkidx}`,
});
                          }

                          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                          return (<>
                              {/* @ts-expect-error TS(2552): Cannot find name 'link'. Did you mean 'Link'? */}
                              {link}
                              {/* @ts-expect-error TS(2304): Cannot find name 'entry'. */}
                              {(entry as any).childs && (<div className="entry__submenu d-flex flex-column" key={`${performance.now()}-submenu-${idx}`}>
                                  {/* @ts-expect-error TS(2304): Cannot find name 'entry'. */}
                                  {Object.values((entry as any).childs)
            .filter((x) => (x as any).visible || (x as any).visible === undefined)
            .map((entry, idx) => {
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            if (entry.action) {
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<span key={`${performance.now()}-child-${idx}`} className={classNames('submenu__entry__link', entry.className)} onClick={() => entry.action()}>
                                            {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                                            {entry.label}
                                          </span>);
            }
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            else if (entry.link) {
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<Link key={`${performance.now()}-child-${idx}`} className={classNames('submenu__entry__link', entry.className)} to={entry.link}>
                                            {/* @ts-expect-error TS(2571): Object is of type 'unknown'. */}
                                            {entry.label}
                                          </Link>);
            }
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            else if (entry.component) {
                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                return React.cloneElement(entry.component, {
                    key: `${performance.now()}-child-${idx}`,
                });
            }
        })}
                                </div>)}
                            {/* @ts-expect-error TS(2304): Cannot find name 'entry'. */}
                            </>);(entry as any).action) {
                                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                                        return (<span key={`${performance.now()}-child-${idx}`} className={classNames('submenu__entry__link', (entry as any).className)} onClick={() => (entry as any).action()}>
                                            {/* @ts-expect-error TS(2304): Cannot find name 'entry'. */}
                                            {(entry as any).label}
                                          </span>);
                                      // @ts-expect-error TS(2304): Cannot find name 'entry'.
                                      } else if ((entry as any).link) {
                                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                                        return (<Link key={`${performance.now()}-child-${idx}`} className={classNames('submenu__entry__link', (entry as any).className)} to={(entry as any).link}>
                                            {/* @ts-expect-error TS(2304): Cannot find name 'entry'. */}
                                            {(entry as any).label}
                                          </Link>);
                                      // @ts-expect-error TS(2304): Cannot find name 'entry'.
                                      } else if ((entry as any).component) {
                                        // @ts-expect-error TS(2304): Cannot find name 'entry'.
                                        return React.cloneElement((entry as any).component, {
    // @ts-expect-error TS(2304): Cannot find name 'idx'.
    key: `${performance.now()}-child-${idx}`,
});
                                      }
                                    })}
                                // @ts-expect-error TS(2304): Cannot find name 'div'.
                                </div>
                              )}
                            </>
                          );
                        })}
                  // @ts-expect-error TS(2304): Cannot find name 'div'.
                  </div>
                // @ts-expect-error TS(2304): Cannot find name 'div'.
                </div>
              );
            })}
        // @ts-expect-error TS(2304): Cannot find name 'div'.
        </div>
      // @ts-expect-error TS(2304): Cannot find name 'div'.
      </div>
    // @ts-expect-error TS(2304): Cannot find name 'div'.
    </div>
  );
};
