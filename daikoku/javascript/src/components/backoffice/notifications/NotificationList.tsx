import React, { useContext, useEffect, useState } from 'react';
import groupBy from 'lodash/groupBy';

import * as Services from '../../../services';
import { Spinner } from '../../utils';
import { SimpleNotification } from './SimpleNotification';
import { I18nContext } from '../../../contexts';
import { getApolloContext, gql } from '@apollo/client';
import { ModalContext, useUserBackOffice } from '../../../contexts';
import { ITesting, isError } from '../../../types';

type NotificationsGQL = {
  notifications: Array<NotificationGQL>
  total: number
}
type LimitedTeam = {
  _id: string
  name?: string
  type: string
}

type NotificationGQL = {
  _id: string
  action: {
    message?: string
    motivation?: string
    api?: {
      _id: string
      name: string
      testing: ITesting
    }
    apiName?: string
    subscriptionName?: string
    planName?: string
    linkTo?: string
    clientId?: string
    __typename: string
    team?: LimitedTeam
    plan?: {
      _id: string
      customName?: string
      typeName: string
    }
    user?: {
      id: string
      name: string
    }
    parentSubscriptionId?: {
      _id: string
      apiKey: {
        clientName: string;
        clientId: string;
        clientSecret: string;
      }
    }
  }
  date: number
  notificationType: {
    value: string
  }
  sender: {
    id: string
    name: string
  }
  status: {
    date?: number
    status: string
  }
  team: {
    _id: string
    name: string
  }
  tenant: {
    id: string
  }

}
export const NotificationList = () => {
  useUserBackOffice();
  const { translate, Translation } = useContext(I18nContext);
  const { alert } = useContext(ModalContext);
  const { client } = useContext(getApolloContext());

  const [state, setState] = useState<{
    notifications: Array<NotificationGQL>
    untreatedNotifications: Array<NotificationGQL>
    teams: Array<any>
    apis: Array<any>
    tab: string
    page: number
    pageSize: number
    count: number
    untreatedCount: number
    loading: boolean
    nextIsPending: boolean
  }>({
    notifications: [],
    untreatedNotifications: [],
    teams: [],
    tab: 'unread',
    page: 0,
    pageSize: 10,
    count: 0,
    untreatedCount: 0,
    loading: true,
    nextIsPending: false,
    apis: []
  });

  const isUntreatedNotification = (n: NotificationGQL) => n.status.status === 'Pending';

  useEffect(() => {
    //FIXME: handle case if client is not defined
    if (!client) {
      return;
    }
    Promise.all([
      client!.query<{ myNotifications: NotificationsGQL }>({
        query: Services.graphql.getMyNotifications,
        fetchPolicy: "no-cache",
        variables: {
          pageNumber: state.page,
          pageSize: state.pageSize
        }
      }).then(({ data: { myNotifications } }) => {
        return myNotifications
      })
    ]).then(
      ([
        notifications,

      ]) => {
        setState({
          ...state,
          untreatedNotifications: notifications.notifications.filter((n) => isUntreatedNotification(n)
          ),
          notifications: notifications.notifications,
          count: notifications.total,
          untreatedCount: notifications.total,
          page: state.page + 1,
          loading: false
        });
      }
    );
  }, []);

  //FIXME
  // useEffect(() => {
  //   if (state.untreatedNotifications)
  //     dispatch(updateNotifications(state.untreatedNotifications.length));
  // }, [state.untreatedNotifications]);

  const acceptNotification = (notificationId: string, values?: object): void => {
    setState({
      ...state,
      notifications: state.notifications.map((n: any) => {
        n.fade = n._id === notificationId;
        return n;
      }),
    });
    Services.acceptNotificationOfTeam(notificationId, values)
      .then((res) => {
        if (isError(res)) {
          //@ts-ignore
          alert({ message: res.error, title: translate('notification.accept.on_error.title') });
        } else {
          return Promise.resolve();
        }
      })
      .then(() => client!.query<{ myNotifications: NotificationsGQL }>({
        query: Services.graphql.getMyNotifications,
        fetchPolicy: "no-cache",
        variables: {
          pageNumber: 0,
          pageSize: state.notifications.length
        }
      }).then(({ data: { myNotifications } }) => {
        return myNotifications
      }))
      .then(({ notifications, total }) =>
        setState({
          ...state,
          notifications,
          count: total,
          untreatedCount: total,
          untreatedNotifications: notifications.filter((n: NotificationGQL) => isUntreatedNotification(n)),
        })
      );
  };

  useEffect(() => {
    client!.query<{ myNotifications: NotificationsGQL }>({
      query: Services.graphql.getMyNotifications,
      fetchPolicy: "no-cache",
      variables: {
        pageNumber: 0,
        pageSize: 10
      }
    }).then(({ data: { myNotifications } }) => {
      return myNotifications
    })
  }, [])

  const rejectNotification = (notificationId: string, message?: string) => {
    setState({
      ...state,
      notifications: state.notifications.map((n: any) => {
        (n as any).fade = (n as any)._id === notificationId;
        return n;
      }),
    });
    Services.rejectNotificationOfTeam(notificationId, message)
      .then(() => client!.query<{ myNotifications: NotificationsGQL }>({
        query: Services.graphql.getMyNotifications,
        fetchPolicy: "no-cache",
        variables: {
          pageNumber: 0,
          pageSize: state.notifications.length
        }
      }).then(({ data: { myNotifications } }) => {
        return myNotifications
      }))
      .then(({ notifications, total }) => {
        setState({
          ...state,
          notifications,
          count: total,
          untreatedCount: total,
          untreatedNotifications: notifications.filter((n: NotificationGQL) => isUntreatedNotification(n)),
        });
      });
  };

  useEffect(() => {
    if (state.loading)
      if (state.tab === 'all') {
        Services.myAllNotifications(state.page, state.pageSize)
          .then(({ notifications, count }) => setState({ ...state, notifications, count, loading: false }));
      }
      else {
        client!.query<{ myNotifications: NotificationsGQL }>({
          query: Services.graphql.getMyNotifications,
          fetchPolicy: "no-cache",
          variables: {
            pageNumber: state.page,
            pageSize: state.pageSize
          }
        }).then(({ data: { myNotifications } }) => {
          return myNotifications
        })
          .then(({ notifications, total }) => setState({
            ...state,
            notifications,
            count: total,
            untreatedCount: total,
            loading: false,
          }));
      }
  }, [state.tab, state.page, state.loading])

  const onSelectTab = (tab: any) => {
    setState({ ...state, tab, loading: true, page: 0 });
  };

  const moreBtnIsDisplay = () => !!state.count && state.count > state.notifications.length;

  const getMoreNotifications = () => {
    if (state.tab === 'unread') {
      setState({ ...state, nextIsPending: true });
      client!.query<{ myNotifications: NotificationsGQL }>({
        query: Services.graphql.getMyNotifications,
        fetchPolicy: "no-cache",
        variables: {
          pageNumber: state.page,
          pageSize: state.pageSize
        }
      }).then(({ data: { myNotifications } }) => {
        return myNotifications
      }).then(({ notifications, total }) =>
        setState({
          ...state,
          notifications: [...state.notifications, ...notifications],
          count: total,
          untreatedCount: total,
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

  const notifByTeams = groupBy(state.notifications, 'team._id');
  return <>
    <div className="row">
      <h1>
        <Translation i18nkey="Notifications" isPlural={true}>
          Notifications
        </Translation>{' '}
        ({state.count})
      </h1>
    </div>
    {state.loading && <Spinner />}
    {!state.loading && (
      <div className="row">
        {state.notifications.length === 0 && (<div>
          <h4>
            <Translation i18nkey="no notification">You have 0 notification</Translation>
          </h4>
        </div>)}
        <div className="col-10 offset-1">
          <div className="home-tiles">
            {Object.keys(notifByTeams).map((key) => {
              const notifs = notifByTeams[key];
              const team = notifs[0].team
              return (<div key={key}>
                <h2>{team ? team.name : translate('Personal')}</h2>
                {notifs
                  .sort((a, b) => {
                    return b.date - a.date;
                  })
                  .map((notification) => (
                    <SimpleNotification
                      key={notification._id}
                      notification={notification}
                      accept={(values?: object) => acceptNotification(notification._id, values)}
                      reject={(message?: string) => rejectNotification(notification._id, message)}
                    />))}
              </div>);
            })}
          </div>
          {(state as any).nextIsPending && <Spinner />}
          {!(state as any).nextIsPending && moreBtnIsDisplay() && (<button className="btn btn-access-negative my-2 ms-2" onClick={() => getMoreNotifications()}>
            <Translation i18nkey="more">more</Translation>
          </button>)}
        </div>
      </div>
    )}
  </>;

};
