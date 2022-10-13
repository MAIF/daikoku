import React, { useContext, useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Send } from 'react-feather';
import classNames from 'classnames';

import { converter } from '../../../../services/showdown';
import { Option } from '../../../utils';
import { I18nContext } from '../../../../locales/i18n-context';
import { MessagesContext } from '../../../backoffice';
import * as MessageEvents from '../../../../services/messages';

export const MessagePanel = () => {
  const { connectedUser, tenant } = useSelector((s) => (s as any).context);

  const [newMessage, setNewMessage] = useState('');

  const { translate, Translation } = useContext(I18nContext);
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

  useEffect(() => {
    if (totalUnread > 0) {
      readMessages(messages[0].chat);
    }
  }, []);

  const handleKeyDown = (event: any) => {
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
        .map((m: any) => m.chat)
        .getOrElse(connectedUser._id);
      const participants = [...adminTeam.users.map((u: any) => u.userId), connectedUser._id];

      sendNewMessage(newMessage, participants, chat).then(() => {
        setNewMessage('');
      });
    }
  };

  const dialog = MessageEvents.fromMessagesToDialog(messages);

  return (
    <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
      <div className="mb-3 panel__title">
        <h3>{translate('Discuss with an admin')}</h3>
      </div>
      <div className="d-flex mb-3">
        <input
          className="form-control"
          disabled={loading ? true : undefined}
          type="text"
          placeholder={translate('Your message')}
          value={loading ? '...' : newMessage}
          onKeyDown={handleKeyDown}
          onChange={(e) => setNewMessage(e.target.value)}
        />
        <button
          disabled={loading ? true : undefined}
          className="ms-2 btn btn-outline-primary"
          onClick={sendMessage}
        >
          <Send />
        </button>
      </div>
      <div className="blocks" style={{ overflow: 'auto', height: '100vh' }}>
        <div className="mb-3 block">
          <div className="ms-2 block__entries d-flex flex-column">
            <div className="stream flex-grow-1">
              {dialog.reverse().map((group: any, idx: any) => {
                return (
                  <div
                    key={`discussion-messages-${idx}`}
                    className={classNames('discussion-messages', {
                      'discussion-messages--received': group.every(
                        (m: any) => m.sender !== connectedUser._id
                      ),
                      'discussion-messages--send': group.every(
                        (m: any) => m.sender === connectedUser._id
                      ),
                    })}
                  >
                    {group.map((mess: any, idx: any) => {
                      return (
                        <div key={`discussion-message-${idx}`} className="discussion-message">
                          {mess.message}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {tenant.defaultMessage && (
                <div
                  key="discussion-messages-default"
                  className="discussion-messages discussion-messages--received"
                >
                  <div
                    key="discussion-message-default"
                    className="discussion-message"
                    dangerouslySetInnerHTML={{
                      __html: converter.makeHtml(tenant.defaultMessage),
                    }}
                  />
                </div>
              )}
              {Option(lastClosedDates.find((x: any) => x.chat === connectedUser._id)).exists(
                (l: any) => l.date
              ) && (
                  <div className="d-flex flex-row justify-content-center my-1">
                    <button
                      disabled={loading ? true : undefined}
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => getPreviousMessages(connectedUser._id)}
                    >
                      <Translation i18nkey="Load previous messages">
                        Load previous messages
                      </Translation>
                    </button>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
