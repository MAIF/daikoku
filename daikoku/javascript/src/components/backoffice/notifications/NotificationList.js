import React, { useContext, useEffect, useState } from 'react';
import classNames from 'classnames';
import { connect } from 'react-redux';
import * as _ from 'lodash';

import * as Services from '../../../services';
import { UserBackOffice } from '../';
import { Spinner } from '../../utils';
import { SimpleNotification } from './SimpleNotification';
import { updateNotications, openSubMetadataModal, I18nContext } from '../../../core';
import { getApolloContext, gql } from '@apollo/client';
import { useParams } from 'react-router-dom';

function NotificationListComponent(props) {
  const { translateMethod, Translation } = useContext(I18nContext);
  const params = useParams();

  const [state, setState] = useState({
    notifications: [],
    teams: [],
    tab: 'unread',
    page: 0,
    pageSize: 10,
    count: 0,
    untreatedCount: 0,
  });

  const isUntreatedNotification = (n) => n.status.status === 'Pending';

  const { client } = useContext(getApolloContext());

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
          untreatedNotifications: notifications.notifications.filter((n) =>
            isUntreatedNotification(n)
          ),
          notifications: notifications.notifications,
          count: notifications.count,
          untreatedCount: notifications.count,
          // page: state.page + 1,
          teams,
          apis: visibleApis.map(({ api }) => api),
        });
      }
    );
  }, []);

  useEffect(() => {
    if (state.untreatedNotifications)
      props.updateNotifications(state.untreatedNotifications.length);
  }, [state.untreatedNotifications]);

  const acceptNotification = (notificationId, values) => {
    setState({
      ...state,
      notifications: state.notifications.map((n) => {
        n.fade = n._id === notificationId;
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
          untreatedNotifications: notifications.filter((n) => isUntreatedNotification(n)),
        })
      );
  };

  const rejectNotification = (notificationId) => {
    setState({
      ...state,
      notifications: state.notifications.map((n) => {
        n.fade = n._id === notificationId;
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
          untreatedNotifications: notifications.filter((n) => isUntreatedNotification(n)),
        });
      });
  };

  useEffect(() => {
    if (state.loading)
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

  const onSelectTab = (tab) => {
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

  const notifByTeams = _.groupBy(state.notifications, 'team');
  return (
    <UserBackOffice
      tab="Notifications"
      apiId={params.apiId}
      notificationSubMenu={
        <ul className="nav flex-column sub-nav">
          <li
            className={classNames({
              'nav-item': true,
              active: state.tab === 'unread',
            })}
          >
            <a href="#unread" onClick={() => onSelectTab('unread')}>
              <Translation i18nkey="Untreated" count={state.untreatedCount}>
                Untreated
              </Translation>
              &nbsp;({state.untreatedCount})
            </a>
          </li>
          <li
            className={classNames({
              'nav-item': true,
              active: state.tab === 'all',
            })}
          >
            <a href="#all" onClick={() => onSelectTab('all')}>
              <Translation i18nkey="All notifications">All notifications</Translation>
            </a>
          </li>
        </ul>
      }
    >
      <div className="row">
        <h1>
          <Translation i18nkey="Notifications" isPlural={true}>
            Notifications
          </Translation>{' '}
          ({state.count})
        </h1>
      </div>
      {state.loading ? (
        <Spinner />
      ) : (
        <div className="row">
          {state.notifications.length === 0 && (
            <div>
              <h4>
                <Translation i18nkey="no notification">You have 0 notification</Translation>
              </h4>
            </div>
          )}
          <div className="col-10 offset-1">
            <div className="home-tiles">
              {Object.keys(notifByTeams).map((key) => {
                const notifs = notifByTeams[key];
                const team = state.teams.find((t) => t._id === key);

                return (
                  <div key={key}>
                    <h2>{team ? team.name : translateMethod('Personal')}</h2>
                    {notifs
                      .sort((a, b) => {
                        return b.date - a.date;
                      })
                      .map((notification) => (
                        <SimpleNotification
                          key={notification._id}
                          notification={notification}
                          fade={notification.fade}
                          accept={(values) => acceptNotification(notification._id, values)}
                          reject={() => rejectNotification(notification._id)}
                          getTeam={(id) => state.teams.find((team) => team._id === id)}
                          getApi={(id) => state.apis.find((a) => a._id === id)}
                          openSubMetadataModal={props.openSubMetadataModal}
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
    </UserBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateNotifications: (count) => updateNotications(count),
  openSubMetadataModal: (modalProps) => openSubMetadataModal(modalProps),
};

export const NotificationList = connect(
  mapStateToProps,
  mapDispatchToProps
)(NotificationListComponent);
