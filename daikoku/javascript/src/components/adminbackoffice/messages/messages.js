import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import ClassNames from 'classnames';
import { Send } from 'react-feather';
import _ from 'lodash';

import * as MessagesEvents from '../../../services/messages';
import * as Services from '../../../services';
import { Option, partition } from '../../utils';
import { UserBackOffice } from '../../backoffice';

const AdminMessagesComponent = props => {
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedChat, setSelectedChat] = useState(undefined);
  const [loading, setLoading] = useState(undefined);
  const [newMessage, setNewMessage] = useState('');

  let sseId;

  useEffect(() => {

    Promise.all([
      Services.myMessages(),
      Services.fetchAllUsers()
    ])
      .then(([messages, users]) => {
        const groupedMessages = messages.reduce((groups, m) => {
          const { chat } = m;
          const [actualGroup, others] = partition(groups, g => g.chat === chat);
          const user = users.find(u => u._id === chat);
          const updatedGroup = Option(_.head(actualGroup))
            .map(g => ({ ...g, messages: [...g.messages, m] }))
            .getOrElse(({ chat, user, messages: [m] }));

          return [...others, updatedGroup];

        }, []);

        setUsers(users);
        setMessages(groupedMessages);
      });
  }, []);

  useEffect(() => {
    MessagesEvents.addCallback((m) => handleEvent(m), sseId);

    return () => {
      MessagesEvents.removeCallback(sseId);
    };
  }, [messages]);

  useEffect(() => {
    if (selectedChat) {
      const unreadCount = messages
        .find(g => g.chat === selectedChat)
        .messages
        .filter(m => !m.readBy.includes(props.connectedUser._id)).length;
      if (unreadCount) {
        Services.setMessagesRead(selectedChat);
      }
    }
  }, [selectedChat]);

  const handleEvent = (m) => {
    if (m) {
      const { chat } = m;
      const [actualGroup, others] = partition(messages, g => g.chat === chat);
      const user = users.find(u => u._id === chat);

      const updatedGroup = Option(_.head(actualGroup))
        .map(g => ({ ...g, messages: [...g.messages, m] }))
        .getOrElse(({ chat, user, messages: [m] }));

      setMessages([...others, updatedGroup]);
    }
  };

  const sendNewMessage = () => {
    setLoading(true);
    const participants = Option(messages.find(g => g.chat === selectedChat))
      .map(g => _.head(g.messages))
      .map(m => m.participants)
      .getOrElse([]);
    
    Services.sendMessage(newMessage, participants, selectedChat)
      .then(() => {
        setLoading(false);
        setNewMessage('');
      });
  };

  const handleKeyDown = (event) => {
    if (!newMessage.trim()) return;

    switch (event.key) {
      case 'Enter':
        sendNewMessage();
        event.preventDefault();
    }
  };

  const orderedMessages = _.sortBy(messages, 'chat');
  if (!orderedMessages.length) {
    return null;
  }
  const dialog = Option(messages.find(({chat}) => chat === selectedChat))
    .map(g => MessagesEvents.fromMessagesToDialog(g.messages))
    .getOrElse([]);

  return (
    <UserBackOffice tab="Messages">
      <div className="d-flex flex-row">
        <div className="d-flex flex-column" style={{width: '25%'}}>
          {orderedMessages.map(({chat, user, messages}, idx) => {
            const unreadCount = messages.filter(m => !m.readBy.includes(props.connectedUser._id)).length;
            return (
              <div 
                key={idx} 
                className="cursor-pointer" 
                onClick={() => setSelectedChat(chat)}>
                <h4>{user.name}</h4>
                <em>{user.email}</em>

                <div>{_.last(messages).date}</div>
                {unreadCount}
              </div>
            );
          })}
        </div>
        <div className="d-flex flex-column" style={{ width: '75%', maxHeight: '70vh', overflow: 'scroll', borderLeft: '1px solid gray' }}>
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
          <div className="discussion-form">
            <input
              disabled={loading ? 'disabled' : null}
              type="text"
              value={loading ? '...' : newMessage}
              onKeyDown={handleKeyDown}
              onChange={e => setNewMessage(e.target.value)} />
            <button className="send-button" onClick={sendNewMessage}>
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