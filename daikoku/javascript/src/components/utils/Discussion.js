import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';
import { MessageCircle, X, Send } from 'react-feather';
import _ from 'lodash';
import classNames from 'classnames';
import faker from 'faker';

import {MessagesContext} from '../backoffice';
import * as Services from '../../services';
import * as MessageEvents from '../../services/messages';
import {Option} from '../utils';

const DiscussionComponent = props => {
  const messagesContext = useContext(MessagesContext);


  const [opened, setOpened] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [adminTeam, setAdminTeam] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);

  const [receivedMessage, setReceivedMessage] = useState(undefined);

  const sseId = faker.random.alphaNumeric(64);

  useEffect(() => {
    Promise.all([
      Services.myAdminMessages(),
      Services.team('admin')
    ])
      .then(([messages, adminTeam]) => {
        setMessages(messages.reverse());
        setAdminTeam(adminTeam);
        setTotalUnread(messages.filter(m => !m.readBy.includes(props.connectedUser._id)).length);
        setLoading(false);
      });

    MessageEvents.addCallback((m) => handleEvent(m), sseId);

    return () => {
      MessageEvents.removeCallback(sseId);
    };
  }, []);

  useEffect(() => {
    if (receivedMessage) {
      setMessages([receivedMessage, ...messages]);
      setReceivedMessage(undefined);

      if (!receivedMessage.readBy.includes(props.connectedUser._id)) {
        setTotalUnread(totalUnread + 1);
      } else {
        setTotalUnread(0);
      }
    }
  }, [receivedMessage, totalUnread]);

  useEffect(() => {
    if (opened && totalUnread > 0) {
      Services.setMessagesRead(props.connectedUser._id)
        .then(() => setTotalUnread(0));
    }
  }, [opened, totalUnread]);

  const handleEvent = (m) => {
    setReceivedMessage(m);
  };

  const sendNewMessage = () => {
    setLoading(true);
    const chat = Option(_.head(messages)).map(m => m.chat).getOrNull();
    Services.sendMessage(newMessage, [...adminTeam.users.map(u => u.userId), props.connectedUser._id], chat)
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

  if (opened) {
    const dialog = MessageEvents.fromMessagesToDialog(messages);
    return (
      <div className="dicussion-component">

        <div className="discussion">
          <div className="discussion-header">
            Discuss with an admin
        </div>
          <div className="discussion-stream">
            {
              dialog.reverse().map((group, idx) => {
                return (
                  <div
                    key={`discussion-messages-${idx}`}
                    className={classNames('discussion-messages', {
                      'discussion-messages--received': group.every(m => m.sender !== props.connectedUser._id),
                      'discussion-messages--send': group.every(m => m.sender === props.connectedUser._id),
                    })}>
                    {group.map((mess, idx) => {
                      return (
                        <div key={`discussion-message-${idx}`} className="discussion-message">
                          {mess.message}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            }
          </div>
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

        <button
          className="btn discussion-btn"
          onClick={() => setOpened(false)}>
          <X />
        </button>
      </div>
    );
  }

  if (props.connectedUser.isDaikokuAdmin) {
    return null;
  }

  return (
    <div className="dicussion-component">
      <button
        className="btn discussion-btn"
        onClick={() => setOpened(true)}
      >
        <MessageCircle />
        {totalUnread > 0 && (
          <span className="notification">{totalUnread}</span>
        )}
      </button>
    </div>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const Discussion = connect(mapStateToProps)(DiscussionComponent);