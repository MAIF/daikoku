import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { MessageCircle, X, Send } from 'react-feather';
import _ from 'lodash';
import ClassNames from 'classnames';

import * as Services from '../../services';

const DiscussionComponent = props => {
  const [opened, setOpened] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [adminTeam, setAdminTeam] = useState(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      Services.myMessages(),
      Services.team('admin')
    ])
      .then(([messages, adminTeam]) => {
        setMessages(messages);
        setAdminTeam(adminTeam);
        setLoading(false);
      });
  }, []);

  const sendNewMessage = () => {
    setLoading(true);
    Services.sendMessage(newMessage, adminTeam._id)
      .then(() => {
        setLoading(false);
        setNewMessage('');
      });
  };

  const fromMessagesToDialog = () => _.orderBy(messages, ['date']).reduce((dialog, message) => {
    if (!dialog.length) {
      return [[message]];
    } else {
      const last = _.last(dialog);
      if (last.some(m => m.sender === message.sender) || last.some(m => m.recipient === message.recipient)) {
        return [...dialog.slice(0, dialog.length - 1), [...last, message]];
      } else {
        return [...dialog, [message]];
      }
    }
  }, []);

  const handleKeyDown = (event) => {
    if (!newMessage.trim()) return;

    switch (event.key) {
      case 'Enter':
        sendNewMessage();
        event.preventDefault();
    }
  };

  if (opened) {
    const dialog = fromMessagesToDialog();
    return (
      <div className="dicussion-component">

        <div className="discussion">
          <div className="discussion-header">
            Discuss with an admin
        </div>
          <div className="discussion-stream">
            {
              dialog.map((group, idx) => {
                return (
                  <div
                    key={`discussion-messages-${idx}`}
                    className={ClassNames('discussion-messages', {
                      'discussion-messages--received': group.every(m => m.recipient.id === props.connectedUser._id),
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
  return (
    <div className="dicussion-component">
      <button
        className="btn discussion-btn"
        onClick={() => setOpened(true)}
      >
        <MessageCircle />
      </button>
    </div>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const Discussion = connect(mapStateToProps)(DiscussionComponent);