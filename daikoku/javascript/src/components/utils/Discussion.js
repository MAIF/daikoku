import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';
import { MessageCircle, X, Send } from 'react-feather';
import classNames from 'classnames';

import { Option } from '../utils';
import { MessagesContext } from '../backoffice';
import * as MessageEvents from '../../services/messages';
import { t, Translation } from '../../locales';

const DiscussionComponent = (props) => {
  const {
    messages,
    totalUnread,
    sendNewMessage,
    readMessages,
    adminTeam,
    lastClosedDates,
    getPreviousMessages,
    loading,
  } = useContext(MessagesContext);

  const [opened, setOpened] = useState(false);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    if (opened && totalUnread > 0) {
      readMessages(messages[0].chat);
    }
  }, [opened, totalUnread]);

  const handleKeyDown = (event) => {
    if (!newMessage.trim()) return;

    switch (event.key) {
      case 'Enter':
        sendMessage();
        event.preventDefault();
    }
  };

  const sendMessage = () => {
    if (newMessage.trim()) {
      const chat = Option(messages[0])
        .map((m) => m.chat)
        .getOrElse(props.connectedUser._id);
      const participants = [...adminTeam.users.map((u) => u.userId), props.connectedUser._id];

      sendNewMessage(newMessage, participants, chat).then(() => {
        setNewMessage('');
      });
    }
  };

  if (opened) {
    const dialog = MessageEvents.fromMessagesToDialog(messages);
    return (
      <div className="dicussion-component">
        <div className="discussion">
          <div className="discussion-header">Discuss with an admin</div>
          <div className="discussion-stream">
            {dialog.reverse().map((group, idx) => {
              return (
                <div
                  key={`discussion-messages-${idx}`}
                  className={classNames('discussion-messages', {
                    'discussion-messages--received': group.every(
                      (m) => m.sender !== props.connectedUser._id
                    ),
                    'discussion-messages--send': group.every(
                      (m) => m.sender === props.connectedUser._id
                    ),
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
            })}
            {lastClosedDates.find((x) => x.chat === props.connectedUser._id).date && (
              <div className="d-flex flex-row justify-content-center my-1">
                <button
                  disabled={loading ? 'disabled' : null}
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => getPreviousMessages(props.connectedUser._id)}>
                  <Translation i18nkey="Load previous messages" language={props.currentLanguage}>
                    Load previous messages
                  </Translation>
                </button>
              </div>
            )}
          </div>
          <div className="discussion-form">
            <input
              disabled={loading ? 'disabled' : null}
              type="text"
              placeholder={t('Your message', props.currentLanguage)}
              value={loading ? '...' : newMessage}
              onKeyDown={handleKeyDown}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <button
              disabled={loading ? 'disabled' : null}
              className="send-button"
              onClick={sendMessage}>
              <Send />
            </button>
          </div>
        </div>

        <button className="btn discussion-btn" onClick={() => setOpened(false)}>
          <X />
        </button>
      </div>
    );
  }

  if (props.connectedUser.isDaikokuAdmin || props.connectedUser.isGuest) {
    return null;
  }

  return (
    <div className="dicussion-component">
      <button className="btn discussion-btn" onClick={() => setOpened(true)}>
        <MessageCircle />
        {totalUnread > 0 && <span className="notification">{totalUnread}</span>}
      </button>
    </div>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const Discussion = connect(mapStateToProps)(DiscussionComponent);
