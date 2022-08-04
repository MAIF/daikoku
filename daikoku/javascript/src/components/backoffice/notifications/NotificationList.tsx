import React, { useContext, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import groupBy from 'lodash/groupBy';

import * as Services from '../../../services';
import { Spinner } from '../../utils';
import { SimpleNotification } from './SimpleNotification';
import { updateNotifications, openSubMetadataModal, I18nContext } from '../../../core';
import { getApolloContext, gql } from '@apollo/client';
import { useUserBackOffice } from '../../../contexts';

export const NotificationList = () => {
  useUserBackOffice();
  const dispatch = useDispatch();

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
        if (state.untreatedNotifications)
                updateNotifications(state.untreatedNotifications.length)(dispatch);
}, [(state as any).untreatedNotifications]);(state as any).untreatedNotifications)
      updateNotifications((state as any).untreatedNotifications.length)(dispatch);
  }, [state.untreatedNotifications]);

  const acceptNotification = (notificationId: any, values: any) => {
        setState({
      ...state,
            notifications: state.notifications.map((n) => {
        (n as any).fade = (n as any)._id === notificationId;
        return n;
      }),
    });
    Services.acceptNotificationOfTeam(notificationId, values)
      .then((res) => {
        if (res.error)
                    window.alert(res.error, translateMethod('notification.accept.on_error.title'));
        else return Promise.resolve();
      })
      .then(() => Services.myNotifications(0, state.notifications.length))
      .then(({ notifications, count }) =>
                setState({
          ...state,
          notifications,
          count,
          untreatedCount: count,
                    untreatedNotifications: notifications.filter((n: any) => isUntreatedNotification(n)),
        })
      );
  };

  const rejectNotification = (notificationId: any) => {
        setState({
      ...state,
            notifications: state.notifications.map((n) => {
        (n as any).fade = (n as any)._id === notificationId;
        return n;
      }),
    });
    Services.rejectNotificationOfTeam(notificationId)
      .then(() => Services.myNotifications(0, state.notifications.length))
      .then(({ notifications, count }) => {
                setState({
          ...state,
          notifications,
          count,
          untreatedCount: count,
                    untreatedNotifications: notifications.filter((n: any) => isUntreatedNotification(n)),
        });
      });
  };

  useEffect(() => {
    if (state.loading)
        if (state.tab === 'all') {
                        Services.myAllNotifications(state.page, state.pageSize).then(({ notifications, count }) => setState({ ...state, notifications, count, loading: false }));
        }
        else {
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
                    setState({ ...state, notifications, count, loading: false })
        );
      } else {
        Services.myNotifications(state.page, state.pageSize).then(({ notifications, count }) =>
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
        setState({ ...state, tab, loading: true, page: 0 });
  };

  const moreBtnIsDisplay = () => !!state.count && state.count > state.notifications.length;

  const getMoreNotifications = () => {
    if (state.tab === 'unread') {
            setState({ ...state, nextIsPending: true });
      Services.myNotifications(state.page, state.pageSize).then(({ notifications, count }) =>
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
            setState({ ...state, nextIsPending: true });
      Services.myAllNotifications(state.page, state.pageSize).then(({ notifications, count }) =>
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
                                        .map((notification) => (
                                            <SimpleNotification
                        key={notification._id}
                        notification={notification}
                        fade={notification.fade}
                        accept={(values: any) => acceptNotification(notification._id, values)}
                        reject={() => rejectNotification(notification._id)}
                                                getTeam={(id: any) => state.teams.find((team) => team._id === id)}
                        getApi={(id: any) => state.apis.find((a: any) => a._id === id)}
                        openSubMetadataModal={openModal}
                      />
                    ))}
                                </div>
              );
            })}
                    </div>
                    {state.nextIsPending && <Spinner />}
          {!state.nextIsPending && moreBtnIsDisplay() && (
                        <button
              className="btn btn-access-negative my-2 ms-2"
              onClick={() => getMoreNotifications()}
            >
                            <Translation i18nkey="more">more</Translation>
            </button>
          )}
                </div>
            </div>
    )}
  </>;
};
