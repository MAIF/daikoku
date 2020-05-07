import React, { Component } from 'react';
import classNames from 'classnames';
import { connect } from 'react-redux';
import * as _ from 'lodash';

import * as Services from '../../../services';
import { UserBackOffice } from '../';
import { Spinner } from '../../utils';
import { SimpleNotification } from './SimpleNotification';
import { updateNotications } from '../../../core';
import { Translation } from '../../../locales';

class NotificationListComponent extends Component {
  state = {
    notifications: [],
    teams: [],
    tab: 'unread',
    page: 0,
    pageSize: 10,
    count: 0,
    untreatedCount: 0,
  };

  isUntreatedNotification = (n) => {
    return n.status.status === 'Pending';
  };

  componentDidMount() {
    Promise.all([
      Services.myNotifications(this.state.page, this.state.pageSize),
      Services.teams(),
      Services.myVisibleApis(),
    ]).then(([notifications, teams, apis]) =>
      this.setState({
        untreatedNotifications: notifications.notifications.filter((n) =>
          this.isUntreatedNotification(n)
        ),
        notifications: notifications.notifications,
        count: notifications.count,
        untreatedCount: notifications.count,
        page: this.state.page + 1,
        teams,
        apis,
      })
    );
  }

  acceptNotification(notificationId) {
    this.setState({
      notifications: this.state.notifications.map((n) => {
        n.fade = n._id === notificationId;
        return n;
      }),
    });
    Services.acceptNotificationOfTeam(notificationId)
      .then(() => Services.myNotifications(0, this.state.notifications.length))
      .then(({ notifications, count }) =>
        this.setState(
          {
            notifications,
            count,
            untreatedCount: count,
            untreatedNotifications: notifications.filter((n) => this.isUntreatedNotification(n)),
          },
          () => this.props.updateNotifications(this.state.untreatedNotifications.length)
        )
      );
  }

  rejectNotification(notificationId) {
    this.setState({
      notifications: this.state.notifications.map((n) => {
        n.fade = n._id === notificationId;
        return n;
      }),
    });
    Services.rejectNotificationOfTeam(notificationId)
      .then(() => Services.myNotifications(0, this.state.notifications.length))
      .then(({ notifications, count }) =>
        this.setState(
          {
            notifications,
            count,
            untreatedCount: count,
            untreatedNotifications: notifications.filter((n) => this.isUntreatedNotification(n)),
          },
          () => this.props.updateNotifications(this.state.untreatedNotifications.length)
        )
      );
  }

  onSelectTab = (tab) => {
    this.setState({ tab, loading: true, page: 0 }, () => {
      if (tab === 'all') {
        Services.myAllNotifications(
          this.state.page,
          this.state.pageSize
        ).then(({ notifications, count }) =>
          this.setState({ notifications, count, page: this.state.page + 1, loading: false })
        );
      } else {
        Services.myNotifications(this.state.page, this.state.pageSize).then(
          ({ notifications, count }) =>
            this.setState({
              notifications,
              count,
              untreatedCount: count,
              page: this.state.page + 1,
              loading: false,
            })
        );
      }
    });
  };

  moreBtnIsDisplay = () => !!this.state.count && this.state.count > this.state.notifications.length;

  getMoreNotifications = () => {
    if (this.state.tab === 'unread') {
      this.setState({ nextIsPending: true }, () => {
        Services.myNotifications(this.state.page, this.state.pageSize).then(
          ({ notifications, count }) =>
            this.setState({
              notifications: [...this.state.notifications, ...notifications],
              count,
              untreatedCount: count,
              page: this.state.page + 1,
              nextIsPending: false,
            })
        );
      });
    } else if (this.state.tab === 'all') {
      this.setState({ nextIsPending: true }, () => {
        Services.myAllNotifications(this.state.page, this.state.pageSize).then(
          ({ notifications, count }) =>
            this.setState({
              notifications: [...this.state.notifications, ...notifications],
              count,
              page: this.state.page + 1,
              nextIsPending: false,
            })
        );
      });
    }
  };

  render() {
    if (!this.state.teams.length) {
      return null;
    }

    const notifByTeams = _.groupBy(this.state.notifications, 'team');
    return (
      <UserBackOffice
        tab="Notifications"
        apiId={this.props.match.params.apiId}
        notificationSubMenu={
          <ul className="nav flex-column sub-nav">
            <li
              className={classNames({
                'nav-item': true,
                active: this.state.tab === 'unread',
              })}>
              <a href="#" onClick={() => this.onSelectTab('unread')}>
                <Translation
                  i18nkey="Untreated"
                  language={this.props.currentLanguage}
                  count={this.state.untreatedCount}>
                  Untreated
                </Translation>
                &nbsp;({this.state.untreatedCount})
              </a>
            </li>
            <li
              className={classNames({
                'nav-item': true,
                active: this.state.tab === 'all',
              })}>
              <a href="#" onClick={() => this.onSelectTab('all')}>
                <Translation i18nkey="All notifications" language={this.props.currentLanguage}>
                  All notifications
                </Translation>
              </a>
            </li>
          </ul>
        }>
        <div className="row">
          <h1>
            <Translation
              i18nkey="Notifications"
              language={this.props.currentLanguage}
              isPlural={true}>
              Notifications
            </Translation>{' '}
            ({this.state.count})
          </h1>
        </div>
        {this.state.loading ? (
          <Spinner />
        ) : (
          <div className="row">
            {this.state.notifications.length === 0 && (
              <div>
                <h4>
                  <Translation i18nkey="no notification" language={this.props.currentLanguage}>
                    You have 0 notification
                  </Translation>
                </h4>
              </div>
            )}
            <div className="col-10 offset-1">
              <div className="home-tiles">
                {Object.keys(notifByTeams).map((key) => {
                  const notifs = notifByTeams[key];
                  const team = this.state.teams.find((t) => t._id === key);

                  return (
                    <div key={key}>
                      <h2>{team ? team.name : 'For you'}</h2>
                      {notifs
                        .sort((a, b) => {
                          return b.date - a.date;
                        })
                        .map((notification) => (
                          <SimpleNotification
                            key={notification._id}
                            notification={notification}
                            fade={notification.fade}
                            accept={() => this.acceptNotification(notification._id)}
                            reject={() => this.rejectNotification(notification._id)}
                            getTeam={(id) => this.state.teams.find((team) => team._id === id)}
                            getApi={(id) => this.state.apis.find((a) => a._id === id)}
                            currentLanguage={this.props.currentLanguage}
                          />
                        ))}
                    </div>
                  );
                })}
              </div>
              {this.state.nextIsPending && <Spinner />}
              {!this.state.nextIsPending && this.moreBtnIsDisplay() && (
                <button
                  className="btn btn-access-negative my-2 ml-2"
                  onClick={() => this.getMoreNotifications()}>
                  <Translation i18nkey="more" language={this.props.currentLanguage}>
                    more
                  </Translation>
                </button>
              )}
            </div>
          </div>
        )}
      </UserBackOffice>
    );
  }
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateNotifications: (count) => updateNotications(count),
};

export const NotificationList = connect(
  mapStateToProps,
  mapDispatchToProps
)(NotificationListComponent);
