import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';
import { Send } from 'react-feather';
import _ from 'lodash';
import moment from 'moment';

import { MessagesContext } from '../../backoffice';
import * as MessagesEvents from '../../../services/messages';
import * as Services from '../../../services';
import { Option, partition } from '../../utils';
import { UserBackOffice } from '../../backoffice';
import { t, Translation } from '../../../locales';

const AdminMessagesComponent = props => {
  const { messages, sendNewMessage, readMessages, closeChat, getPreviousMessages, lastClosedDates } = useContext(MessagesContext);

  const [groupedMessages, setGroupedMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedChat, setSelectedChat] = useState(undefined);
  const [loading, setLoading] = useState(undefined);

  useEffect(() => {
    Services.fetchAllUsers()
      .then((users) => setUsers(users));
  }, []);

  useEffect(() => {
    if (users.length) {
      const groupedMessages = messages.reduce((groups, m) => {
        const { chat } = m;
        const [actualGroup, others] = partition(groups, g => g.chat === chat);
        const user = users.find(u => u._id === chat);
        const updatedGroup = Option(_.head(actualGroup))
          .map(g => ({ ...g, messages: [...g.messages, m] }))
          .getOrElse(({ chat, user, messages: [m] }));

        return [...others, updatedGroup];
      }, []);
      setGroupedMessages(groupedMessages);
      maybeReadMessage();
    }
  }, [messages, users]);

  useEffect(() => {
    maybeReadMessage();
  }, [selectedChat]);

  const maybeReadMessage = () => {
    if (selectedChat) {
      const unreadCount = Option(groupedMessages.find(g => g.chat === selectedChat))
        .map((group) => group.messages)
        .getOrElse([])
        .filter(m => !m.readBy.includes(props.connectedUser._id)).length;
      if (unreadCount) {
        readMessages(selectedChat);
      }
    }
  };

  const closeSelectedChat = (chat) => {
    closeChat(chat)
      .then(() => {
        if (selectedChat === chat) {
          setSelectedChat(undefined);
        }
      });
  };

  const sendMessage = () => {
    setLoading(true);
    const participants = Option(groupedMessages.find(g => g.chat === selectedChat))
      .map(g => _.head(g.messages))
      .map(m => m.participants)
      .getOrElse([]);

    sendNewMessage(newMessage, participants, selectedChat)
      .then(() => {
        setLoading(false);
        setNewMessage('');
      });
  };

  const handleKeyDown = (event) => {
    if (!newMessage.trim()) return;

    switch (event.key) {
      case 'Enter':
        sendMessage();
        event.preventDefault();
    }
  };


  const orderedMessages = _.sortBy(groupedMessages, 'chat');
  const dialog = Option(groupedMessages.find(({ chat }) => chat === selectedChat))
    .map(g => MessagesEvents.fromMessagesToDialog(g.messages))
    .getOrElse([]);

  moment.locale(props.currentLanguage);
  return (
    <UserBackOffice tab="Messages">
      <h1>
        <Translation i18nkey="Message" language={props.currentLanguage}>
          Messages
        </Translation>
      </h1>
      <div className="d-flex flex-row messages-container">
        <div className="d-flex flex-column messages-sender">
          {orderedMessages.map(({ chat, user, messages }, idx) => {
            const unreadCount = messages.filter(m => !m.readBy.includes(props.connectedUser._id)).length;

            const lastMessageDate = moment(_.last(messages).date);
            const lastMessageDateDisplayed = (moment().diff(lastMessageDate, 'days') > 1) ?
              lastMessageDate.format('D MMM.') : lastMessageDate.fromNow(true);

            return (
              <div
                key={idx}
                className={classNames('p-3 cursor-pointer d-flex flex-row', {
                  'messages-sender__active': selectedChat === chat
                })}
                onClick={() => setSelectedChat(chat)}>
                <div className="col-4">
                  <img className="user-avatar" src={user.picture} alt="user-avatar" style={{ width: '100%' }} />
                  {unreadCount > 0 && <span className="notification">{unreadCount}</span>}
                </div>
                <div className="col-8">
                  <div className="d-flex justify-content-between">
                    <h4>{user.name}</h4>
                    <a className="notification-link cursor-pointer" onClick={(e) => {
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
              </div>
            );
          })}
        </div>
        <div className="d-flex flex-column ml-2 messages-content">
          {selectedChat && <div>
            <button onClick={() => getPreviousMessages(selectedChat)}>
              previous message
            </button>
          </div>}
          {dialog.map((group, idx) => {
            return (
              <div
                key={`discussion-messages-${idx}`}
                className={classNames('discussion-messages', {
                  'discussion-messages--received': group.every(m => m.sender === selectedChat),
                  'discussion-messages--send': group.every(m => m.sender !== selectedChat),
                })}>
                {group.map((m, idx) => {
                  return (
                    <div key={`discussion-message-${idx}`} className="discussion-message">
                      {m.message}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {selectedChat && <div className="discussion-form discussion-form__message">
            <input
              disabled={loading ? 'disabled' : null}
              type="text"
              value={loading ? '...' : newMessage}
              onKeyDown={handleKeyDown}
              onChange={e => setNewMessage(e.target.value)}
              placeholder={t('Your message', props.currentLanguage)}
            />
            <button className="send-button" onClick={sendMessage}>
              <Send />
            </button>
          </div>}
        </div>
      </div>
    </UserBackOffice>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const AdminMessages = connect(mapStateToProps)(AdminMessagesComponent);
