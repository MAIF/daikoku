import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';
import ClassNames from 'classnames';
import { Send } from 'react-feather';
import _ from 'lodash';

import { MessagesContext } from '../../backoffice';
import * as MessagesEvents from '../../../services/messages';
import * as Services from '../../../services';
import { Option, partition } from '../../utils';
import { UserBackOffice } from '../../backoffice';

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
    }
  }, [messages, users]);

  useEffect(() => {
    if (selectedChat) {
      const unreadCount = groupedMessages
        .find(g => g.chat === selectedChat)
        .messages
        .filter(m => !m.readBy.includes(props.connectedUser._id)).length;
      if (unreadCount) {
        readMessages(selectedChat);
      }
    }
  }, [selectedChat]);

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

  return (
    <UserBackOffice tab="Messages" loading>
      <div className="d-flex flex-row">
        <div className="d-flex flex-column p-3 mr-2" style={{width: '25%',backgroundColor:'#9bb0c5'}}>
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
        <div className="d-flex flex-column ml-2" style={{ width: '75%', maxHeight: '70vh', overflow: 'scroll', paddingLeft:'10px',borderLeft: '1px solid gray' }}>
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
