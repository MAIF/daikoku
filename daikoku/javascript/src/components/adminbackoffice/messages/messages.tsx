import React, { useState, useEffect, useContext } from 'react';
import { useSelector } from 'react-redux';
import classNames from 'classnames';
import { Send, ChevronLeft } from 'react-feather';
import head from 'lodash/head';
import sortBy from 'lodash/sortBy';
import values from 'lodash/values';
import orderBy from 'lodash/orderBy';
import maxBy from 'lodash/maxBy';
import moment from 'moment';
import Select from 'react-select';

import { MessagesContext } from '../../backoffice';
import * as MessagesEvents from '../../../services/messages';
import * as Services from '../../../services';
import { Option, partition, formatMessageDate, BeautifulTitle } from '../../utils';
import { I18nContext } from '../../../contexts/i18n-context';
import { useTenantBackOffice } from '../../../contexts';
import { isError, IState, IUserSimple } from '../../../types';

export const AdminMessages = () => {
  useTenantBackOffice();

  const {
    messages,
    sendNewMessage,
    readMessages,
    closeChat,
    getPreviousMessages,
    lastClosedDates,
    loading,
    createNewChat,
    adminTeam,
  } = useContext(MessagesContext);

  const [groupedMessages, setGroupedMessages] = useState<Array<any>>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [users, setUsers] = useState<Array<IUserSimple>>([]);
  const [selectedChat, setSelectedChat] = useState<any>(undefined);

  const [possibleNewUsers, setPossibleNewUsers] = useState<Array<IUserSimple>>([]);

  const connectedUser = useSelector<IState, IUserSimple>((s) => s.context.connectedUser);

  useEffect(() => {
    Services.fetchAllUsers()
      .then((users) => {
        if (!isError(users)) {
          setUsers(users)
        }
      });
  }, []);

  useEffect(() => {
    setPossibleNewUsers(users.filter((u) => !u.isDaikokuAdmin && !groupedMessages.some(({ chat }) => chat === (u as any)._id)));
  }, [groupedMessages, users]);

  useEffect(() => {
    if (users.length) {
      const groupedMessages = messages.reduce((groups: any, m: any) => {
        const { chat } = m;
        const [actualGroup, others] = partition(groups, (g: any) => g.chat === chat);
        const user = users.find((u) => (u as any)._id === chat);
        const updatedGroup = Option(head(actualGroup))
          .map((g: any) => ({
            ...g,
            messages: [...g.messages, m]
          }))
          .getOrElse({ chat, user, messages: [m] });

        return [...others, updatedGroup];
      }, []);
      setGroupedMessages(groupedMessages);
      maybeReadMessage();
    }
  }, [messages, users]);

  useEffect(() => {
    maybeReadMessage();
  }, [selectedChat]);

  const { translate, language, Translation } = useContext(I18nContext);

  const maybeReadMessage = () => {
    if (selectedChat) {
      const unreadCount = Option(groupedMessages.find((g) => (g as any).chat === selectedChat))
        .map((group: any) => group.messages)
        .getOrElse([])
        .filter((m: any) => !m.readBy.includes(connectedUser._id)).length;
      if (unreadCount) {
        readMessages(selectedChat);
      }
    }
  };

  const closeSelectedChat = (chat: any) => {
    if (selectedChat === chat) {
      setSelectedChat(undefined);
    }
    closeChat(chat);
  };

  const sendMessage = () => {
    if (!loading && newMessage.trim()) {
      const participants = Option(groupedMessages.find((g) => (g as any).chat === selectedChat))
        .map((g: any) => head(g.messages))
        .map((m: any) => m.participants)
        .getOrElse([selectedChat, ...adminTeam.users.map((u: any) => u.userId)]);

      sendNewMessage(newMessage, participants, selectedChat).then(() => {
        setNewMessage('');
      });
    }
  };

  const handleKeyDown = (event: any) => {
    if (!newMessage.trim()) return;

    switch (event.key) {
      case 'Enter':
        sendMessage();
        event.preventDefault();
    }
  };

  const createDialog = (user: any) => {
    createNewChat(user._id).then(() => {
      setGroupedMessages([...groupedMessages, { chat: user._id, user, messages: [] }]);
      setSelectedChat(user._id);
    });
  };

  const orderedMessages = sortBy(groupedMessages, 'chat');
  const dialog = Option(groupedMessages.find(({ chat }) => chat === selectedChat))
    .map((g: any) => MessagesEvents.fromMessagesToDialog(g.messages))
    .getOrElse([]);

  moment.locale(language);
  moment.updateLocale('fr', {
    relativeTime: {
      s: translate({ key: 'moment.duration.seconds', defaultResponse: 'few sec' }),
      m: translate({ key: 'moment.duration.minutes', defaultResponse: '1 min', replacements: ['1'] }),
      mm: translate({ key: 'moment.duration.minutes', defaultResponse: '%d min', replacements: ['%d'] }),
      h: translate({ key: 'moment.duration.hours', defaultResponse: '1 h', replacements: ['1'] }),
      hh: translate({ key: 'moment.duration.jours', defaultResponse: '%d h', replacements: ['%d'] }),
      d: translate({ key: 'moment.duration.days', defaultResponse: '1 d', replacements: ['1'] }),
      dd: translate({ key: 'moment.duration.days', defaultResponse: '%d d', replacements: ['%d'] }),
    },
  });

  return (<div className="d-flex flex-row messages-container">
    <div className="d-flex flex-column col-12 col-md-3 messages-sender">
      <Select
        placeholder={translate('Start new conversation')}
        className="mx-2 mb-2 reactSelect"
        options={possibleNewUsers.map((u) => ({
          label: (<div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            {u.name} ({u.email}){' '}
            <img style={{
              borderRadius: '50%',
              backgroundColor: 'white',
              width: 34,
              height: 34,
            }} src={(u as any).picture} alt="avatar" />
          </div>),
          value: u,
        }))}
        value={null} //@ts-ignore //FIXME
        onChange={({ value }) => createDialog(value)}
        filterOption={(data, search) => values(data.value)
          .filter((e) => typeof e === 'string')
          .some((v) => v.includes(search))} classNamePrefix="reactSelect" />
      {orderBy(orderedMessages.map(({ chat, user, messages }) => {
        const maxMessage = maxBy(messages, 'date');
        moment.locale(language);
        const maxDate = Option(maxMessage)
          .map((m: any) => moment(m.date))
          .getOrElse(moment());
        const unreadCount = messages.filter((m: any) => !m.readBy.includes(connectedUser._id)).length;
        return { chat, user, messages, unreadCount, maxDate };
      }), ['unreadCount', 'maxDate', 'user.name'], ['desc', 'desc', 'asc']) //todo: maybe order
        .map(({ chat, user, messages, unreadCount, maxDate }, idx) => {
          const lastMessageDateDisplayed = moment().diff(maxDate, 'days') > 1 ? maxDate.format('D MMM.') : maxDate.fromNow(true);
          return (<div key={idx} className={classNames('p-3 cursor-pointer d-flex flex-row', {
            'messages-sender__active': selectedChat === chat,
          })} onClick={() => setSelectedChat(chat)}>
            <div className="col-4">
              <img className="user-avatar" src={user.picture} alt="user-avatar" style={{ width: '100%' }} />
              {unreadCount > 0 && <span className="notification">{unreadCount}</span>}
            </div>
            <div className="col-8">
              <div className="d-flex justify-content-between">
                <BeautifulTitle title={user.name} className="message__user--name">
                  <h4 className="message__user--name">{user.name}</h4>
                </BeautifulTitle>
                <a className="delete-link cursor-pointer" onClick={(e) => {
                  e.stopPropagation();
                  closeSelectedChat(chat);
                }}>
                  <i className="fas fa-trash" />
                </a>
              </div>
              <div className="d-flex justify-content-end">
                <div>{lastMessageDateDisplayed}</div>
              </div>
            </div>
          </div>);
        })}
    </div>
    <div className="col-12 col-sm-9">
      <div className="d-flex d-sm-none justify-content-end">
        <button className="btn btn-sm btn-access-negative ">
          <ChevronLeft />
        </button>
      </div>
      <div className="d-flex flex-column-reverse ms-2 messages-content">
        {dialog.reverse().map((group: any, idx: any) => {
          return (<div key={`discussion-messages-${idx}`} className={classNames('discussion-messages', {
            'discussion-messages--received': group.every((m: any) => m.sender === selectedChat),
            'discussion-messages--send': group.every((m: any) => m.sender !== selectedChat),
          })}>
            {group.map((m: any, idx: any) => {
              const sender = Option(users.find((u) => u._id === m.sender))
                .map((u: any) => u.name)
                .getOrElse(translate('Unknown user'));
              return (<div key={`discussion-message-${idx}`} className="discussion-message d-flex flex-column">
                <span className="sender">{sender}</span>
                <span className="message">{m.message}</span>
                <span className="info">
                  <span className="date">{formatMessageDate(m.date, language)}</span>
                </span>
              </div>);
            })}
          </div>);
        })}
        {selectedChat && lastClosedDates.find((x) => x.chat === selectedChat).date ? (<div className="d-flex flex-row justify-content-center my-1">
          <button className="btn btn-sm btn-outline-primary" disabled={loading} onClick={() => getPreviousMessages(selectedChat)}>
            <Translation i18nkey="Load previous messages">Load previous messages</Translation>
          </button>
        </div>) : <></>}
        {selectedChat && (<div className="discussion-form discussion-form__message">
          <input disabled={loading} type="text" value={loading ? '...' : newMessage} onKeyDown={handleKeyDown} onChange={(e) => setNewMessage(e.target.value)} placeholder={translate('Your message')} />
          <button disabled={loading} className="send-button" onClick={sendMessage}>
            <Send />
          </button>
        </div>)}
      </div>
    </div>
  </div>);
}
