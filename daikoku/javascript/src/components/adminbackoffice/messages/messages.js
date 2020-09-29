import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';
import ClassNames from 'classnames';
import { Send } from 'react-feather';
import _ from 'lodash';
import moment from 'moment';

import { MessagesContext } from '../../backoffice';
import * as MessagesEvents from '../../../services/messages';
import * as Services from '../../../services';
import { Option, partition } from '../../utils';
import { UserBackOffice } from '../../backoffice';
import {t, Translation} from '../../../locales';

const AdminMessagesComponent = props => {
  const { messages, sendNewMessage, readMessages } = useContext(MessagesContext);

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
      const unreadCount = groupedMessages
        .find(g => g.chat === selectedChat)
        .messages
        .filter(m => !m.readBy.includes(props.connectedUser._id)).length;
      if (unreadCount) {
        readMessages(selectedChat);
      }
    }
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


  //todo: GET a loader waiting users & messages !!!!!!!
  const orderedMessages = _.sortBy(groupedMessages, 'chat');
  if (!orderedMessages.length || !users.length) {
    return null; //todo: not cool....just a white page ????
  }
  const dialog = Option(groupedMessages.find(({chat}) => chat === selectedChat))
    .map(g => MessagesEvents.fromMessagesToDialog(g.messages))
    .getOrElse([]);

  moment.locale(props.currentLanguage);
  return (
    <UserBackOffice tab="Messages" loading>
      <h1>
        <Translation i18nkey="Message" language={props.currentLanguage}>
          Messages
        </Translation>
      </h1>
      <div className="d-flex flex-row messages-container">
        <div className="d-flex flex-column messages-sender">
          {orderedMessages.map(({chat, user, messages}, idx) => {
            const unreadCount = messages.filter(m => !m.readBy.includes(props.connectedUser._id)).length;
            return (
              <div 
                key={idx} 
                className="p-3 cursor-pointer messages-sender__active"
                onClick={() => setSelectedChat(chat)}>
                <h4>{user.name}</h4>
                <em>{user.email}</em>

                <div>{moment(_.last(messages).date).format('L LT')}</div>
                {unreadCount ? unreadCount : null}
              </div>
            );
          })}
        </div>
        <div className="d-flex flex-column ml-2 messages-content">
          {dialog.map((group, idx) => {
              return (
                <div
                  key={`discussion-messages-${idx}`}
                  className={ClassNames('discussion-messages', {
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
          <div className="discussion-form discussion-form__message">
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
          </div>
        </div>
      </div>
    </UserBackOffice>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const AdminMessages = connect(mapStateToProps)(AdminMessagesComponent);
