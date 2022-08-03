import React, { useContext, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import groupBy from 'lodash/groupBy';

import * as Services from '../../../services';
import { Spinner } from '../../utils';
// @ts-expect-error TS(6142): Module './SimpleNotification' was resolved to '/Us... Remove this comment to see the full error message
import { SimpleNotification } from './SimpleNotification';
import { updateNotifications, openSubMetadataModal, I18nContext } from '../../../core';
import { getApolloContext, gql } from '@apollo/client';
import { useUserBackOffice } from '../../../contexts';

export const NotificationList = () => {
  useUserBackOffice();
  const dispatch = useDispatch();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);
  const { client } = useContext(getApolloContext());

  const [state, setState] = useState({
    notifications: [],
    teams: [],
    tab: 'unread',
    page: 0,
    pageSize: 10,
    count: 0,
    untreatedCount: 0,
  });

  const isUntreatedNotification = (n: any) => n.status.status === 'Pending';

  useEffect(() => {
    Promise.all([
      Services.myNotifications(state.page, state.pageSize),
      Services.teams(),
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      client.query({
        query: gql`
          query NotificationList {
            visibleApis {
              api {
                _id
                name
                possibleUsagePlans {
                  _id
                  type
                  customName
                }
              }
            }
          }
        `,
      }),
    ]).then(
      ([
        notifications,
        teams,
        {
          data: { visibleApis },
        },
      ]) => {
        setState({
          ...state,
          // @ts-expect-error TS(2345): Argument of type '{ untreatedNotifications: any; n... Remove this comment to see the full error message
          untreatedNotifications: notifications.notifications.filter((n: any) => isUntreatedNotification(n)
          ),
          notifications: notifications.notifications,
          count: notifications.count,
          untreatedCount: notifications.count,
          // page: state.page + 1,
          teams,
          apis: visibleApis.map(({
            api
          }: any) => api),
        });
      }
    );
  }, []);

  useEffect(() => {
    // @ts-expect-error TS(2339): Property 'untreatedNotifications' does not exist o... Remove this comment to see the full error message
    if (state.untreatedNotifications)
        // @ts-expect-error TS(2339): Property 'untreatedNotifications' does not exist o... Remove this comment to see the full error message
        updateNotifications(state.untreatedNotifications.length)(dispatch);
}, [(state as any).untreatedNotifications]);(state as any).untreatedNotifications)
      updateNotifications((state as any).untreatedNotifications.length)(dispatch);
  // @ts-expect-error TS(7031): Binding element 'state' implicitly has an 'any' ty... Remove this comment to see the full error message
  }, [state.untreatedNotifications]);

  const acceptNotification = (notificationId: any, values: any) => {
    // @ts-expect-error TS(2552): Cannot find name 'setState'. Did you mean 'useStat... Remove this comment to see the full error message
    setState({
      ...state,
      // @ts-expect-error TS(7006): Parameter 'n' implicitly has an 'any' type.
      notifications: state.notifications.map((n) => {
        (n as any).fade = (n as any)._id === notificationId;
        return n;
      }),
    });
    Services.acceptNotificationOfTeam(notificationId, values)
      .then((res) => {
        if (res.error)
          // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
          window.alert(res.error, translateMethod('notification.accept.on_error.title'));
        else return Promise.resolve();
      })
      .then(() => Services.myNotifications(0, state.notifications.length))
      .then(({ notifications, count }) =>
        // @ts-expect-error TS(2552): Cannot find name 'setState'. Did you mean 'useStat... Remove this comment to see the full error message
        setState({
          ...state,
          notifications,
          count,
          untreatedCount: count,
          // @ts-expect-error TS(2304): Cannot find name 'isUntreatedNotification'.
          untreatedNotifications: notifications.filter((n: any) => isUntreatedNotification(n)),
        })
      );
  };

  const rejectNotification = (notificationId: any) => {
    // @ts-expect-error TS(2552): Cannot find name 'setState'. Did you mean 'useStat... Remove this comment to see the full error message
    setState({
      ...state,
      // @ts-expect-error TS(7006): Parameter 'n' implicitly has an 'any' type.
      notifications: state.notifications.map((n) => {
        (n as any).fade = (n as any)._id === notificationId;
        return n;
      }),
    });
    Services.rejectNotificationOfTeam(notificationId)
      .then(() => Services.myNotifications(0, state.notifications.length))
      .then(({ notifications, count }) => {
        // @ts-expect-error TS(2304): Cannot find name 'setState'.
        setState({
          ...state,
          notifications,
          count,
          untreatedCount: count,
          // @ts-expect-error TS(2304): Cannot find name 'isUntreatedNotification'.
          untreatedNotifications: notifications.filter((n: any) => isUntreatedNotification(n)),
        });
      });
  };

  useEffect(() => {
    if (state.loading)
        if (state.tab === 'all') {
            // @ts-expect-error TS(2304): Cannot find name 'setState'.
            Services.myAllNotifications(state.page, state.pageSize).then(({ notifications, count }) => setState({ ...state, notifications, count, loading: false }));
        }
        else {
            // @ts-expect-error TS(2304): Cannot find name 'setState'.
            Services.myNotifications(state.page, state.pageSize).then(({ notifications, count }) => setState({
                ...state,
                notifications,
                count,
                untreatedCount: count,
                loading: false,
            }));
        }
}, [state.tab, state.page, (state as any).loading]);(state as any).loading)
      if (state.tab === 'all') {
        Services.myAllNotifications(state.page, state.pageSize).then(({ notifications, count }) =>
          // @ts-expect-error TS(2552): Cannot find name 'setState'. Did you mean 'useStat... Remove this comment to see the full error message
          setState({ ...state, notifications, count, loading: false })
        );
      } else {
        Services.myNotifications(state.page, state.pageSize).then(({ notifications, count }) =>
          // @ts-expect-error TS(2552): Cannot find name 'setState'. Did you mean 'useStat... Remove this comment to see the full error message
          setState({
            ...state,
            notifications,
            count,
            untreatedCount: count,
            loading: false,
          })
        );
      }
  }, [state.tab, state.page, state.loading]);

  const onSelectTab = (tab: any) => {
    // @ts-expect-error TS(2304): Cannot find name 'setState'.
    setState({ ...state, tab, loading: true, page: 0 });
  };

  const moreBtnIsDisplay = () => !!state.count && state.count > state.notifications.length;

  const getMoreNotifications = () => {
    if (state.tab === 'unread') {
      // @ts-expect-error TS(2304): Cannot find name 'setState'.
      setState({ ...state, nextIsPending: true });
      Services.myNotifications(state.page, state.pageSize).then(({ notifications, count }) =>
        // @ts-expect-error TS(2304): Cannot find name 'setState'.
        setState({
          ...state,
          notifications: [...state.notifications, ...notifications],
          count,
          untreatedCount: count,
          page: state.page + 1,
          nextIsPending: false,
        })
      );
    } else if (state.tab === 'all') {
      // @ts-expect-error TS(2304): Cannot find name 'setState'.
      setState({ ...state, nextIsPending: true });
      Services.myAllNotifications(state.page, state.pageSize).then(({ notifications, count }) =>
        // @ts-expect-error TS(2304): Cannot find name 'setState'.
        setState({
          ...state,
          notifications: [...state.notifications, ...notifications],
          count,
          page: state.page + 1,
          nextIsPending: false,
        })
      );
    }
  };

  if (!state.teams.length) {
    return null;
  }

  const notifByTeams = groupBy(state.notifications, 'team');
  // @ts-expect-error TS(2304): Cannot find name 'dispatch'.
  const openModal = (p: any) => openSubMetadataModal(p)(dispatch);
  return <>
    <div className="row">
      <h1>
        <Translation i18nkey="Notifications" isPlural={true}>
          Notifications
        </Translation>{' '}
        ({state.count})
      </h1>
    </div>
    {(state as any).loading ? (<Spinner />) : (<div className="row">
        {state.notifications.length === 0 && (<div>
            <h4>
              <Translation i18nkey="no notification">You have 0 notification</Translation>
            </h4>
          </div>)}
        <div className="col-10 offset-1">
          <div className="home-tiles">
            {Object.keys(notifByTeams).map((key) => {
            const notifs = notifByTeams[key];
            const team = state.teams.find((t) => t._id === key);
            return (<div key={key}>
                  <h2>{team ? team.name : translateMethod('Personal')}</h2>
                  {notifs
                    .sort((a, b) => {
                    return b.date - a.date;
                })
                    .map((notification) => (<SimpleNotification key={notification._id} notification={notification} fade={notification.fade} accept={(values: any) => acceptNotification(notification._id, values)} reject={() => rejectNotification(notification._id)} getTeam={(id: any) => state.teams.find((team) => team._id === id)} getApi={(id: any) => state.apis.find((a: any) => a._id === id)} openSubMetadataModal={openModal}/>))}
                </div>);
        })}
          </div>
          {(state as any).nextIsPending && <Spinner />}
          {!(state as any).nextIsPending && moreBtnIsDisplay() && (<button className="btn btn-access-negative my-2 ms-2" onClick={() => getMoreNotifications()}>
              <Translation i18nkey="more">more</Translation>
            </button>)}
        </div>
      </div>)}
  </>;
              // @ts-expect-error TS(7006): Parameter 't' implicitly has an 'any' type.
              const team = state.teams.find((t) => (t as any)._id === key);

              return (<div key={key}>
                  <h2>{team ? (team as any).name : translateMethod('Personal')}</h2>
                  {notifs
        .sort((a, b) => {
        return b.date - a.date;
    })
        .map((notification) => (<SimpleNotification key={(notification as any)._id} notification={notification} fade={(notification as any).fade} accept={(values: any) => acceptNotification((notification as any)._id, values)} reject={() => rejectNotification((notification as any)._id)} getTeam={(id: any) => state.teams.find((team) => (team as any)._id === id)} getApi={(id: any) => (state as any).apis.find((a: any) => a._id === id)} openSubMetadataModal={openModal}/>))}
                </div>);
                      return (b as any).date - (a as any).date;
                    })
                    // @ts-expect-error TS(2552): Cannot find name 'map'. Did you mean 'Map'?
                    .map((notification) => (
                      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                      <SimpleNotification
                        key={notification._id}
                        notification={notification}
                        fade={notification.fade}
                        accept={(values: any) => acceptNotification(notification._id, values)}
                        reject={() => rejectNotification(notification._id)}
                        // @ts-expect-error TS(7006): Parameter 'team' implicitly has an 'any' type.
                        getTeam={(id: any) => state.teams.find((team) => team._id === id)}
                        getApi={(id: any) => state.apis.find((a: any) => a._id === id)}
                        openSubMetadataModal={openModal}
                      />
                    ))}
                // @ts-expect-error TS(2304): Cannot find name 'div'.
                </div>
              );
            })}
          // @ts-expect-error TS(2304): Cannot find name 'div'.
          </div>
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          {state.nextIsPending && <Spinner />}
          {!state.nextIsPending && moreBtnIsDisplay() && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <button
              className="btn btn-access-negative my-2 ms-2"
              onClick={() => getMoreNotifications()}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="more">more</Translation>
            </button>
          )}
        // @ts-expect-error TS(2304): Cannot find name 'div'.
        </div>
      // @ts-expect-error TS(2304): Cannot find name 'div'.
      </div>
    )}
  </>;
};
