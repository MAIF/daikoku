import React, { useContext, useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Send } from 'react-feather';
import classNames from 'classnames';

import { converter } from '../../../../services/showdown';
import { Option } from '../../../utils';
// @ts-expect-error TS(6142): Module '../../../../locales/i18n-context' was reso... Remove this comment to see the full error message
import { I18nContext } from '../../../../locales/i18n-context';
import { MessagesContext } from '../../../backoffice';
import * as MessageEvents from '../../../../services/messages';

export const MessagePanel = () => {
  const { connectedUser, tenant } = useSelector((s) => (s as any).context);

  const [newMessage, setNewMessage] = useState('');

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);
  const {
    // @ts-expect-error TS(2339): Property 'messages' does not exist on type 'unknow... Remove this comment to see the full error message
    messages,
    // @ts-expect-error TS(2339): Property 'totalUnread' does not exist on type 'unk... Remove this comment to see the full error message
    totalUnread,
    // @ts-expect-error TS(2339): Property 'sendNewMessage' does not exist on type '... Remove this comment to see the full error message
    sendNewMessage,
    // @ts-expect-error TS(2339): Property 'readMessages' does not exist on type 'un... Remove this comment to see the full error message
    readMessages,
    // @ts-expect-error TS(2339): Property 'adminTeam' does not exist on type 'unkno... Remove this comment to see the full error message
    adminTeam,
    // @ts-expect-error TS(2339): Property 'lastClosedDates' does not exist on type ... Remove this comment to see the full error message
    lastClosedDates,
    // @ts-expect-error TS(2339): Property 'getPreviousMessages' does not exist on t... Remove this comment to see the full error message
    getPreviousMessages,
    // @ts-expect-error TS(2339): Property 'loading' does not exist on type 'unknown... Remove this comment to see the full error message
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="mb-3 panel__title">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h3>{translateMethod('Discuss with an admin')}</h3>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex mb-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <input
          className="form-control"
          // @ts-expect-error TS(2322): Type 'string | null' is not assignable to type 'bo... Remove this comment to see the full error message
          disabled={loading ? 'disabled' : null}
          type="text"
          placeholder={translateMethod('Your message')}
          value={loading ? '...' : newMessage}
          onKeyDown={handleKeyDown}
          onChange={(e) => setNewMessage(e.target.value)}
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button
          // @ts-expect-error TS(2322): Type 'string | null' is not assignable to type 'bo... Remove this comment to see the full error message
          disabled={loading ? 'disabled' : null}
          className="ms-2 btn btn-outline-primary"
          onClick={sendMessage}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Send />
        </button>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="blocks" style={{ overflow: 'auto', height: '100vh' }}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="mb-3 block">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="ms-2 block__entries d-flex flex-column">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="stream flex-grow-1">
              {dialog.reverse().map((group: any, idx: any) => {
                return (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <div key={`discussion-message-${idx}`} className="discussion-message">
                          {mess.message}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {tenant.defaultMessage && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <div
                  key="discussion-messages-default"
                  className="discussion-messages discussion-messages--received"
                >
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <div className="d-flex flex-row justify-content-center my-1">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button
                    // @ts-expect-error TS(2322): Type 'string | null' is not assignable to type 'bo... Remove this comment to see the full error message
                    disabled={loading ? 'disabled' : null}
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => getPreviousMessages(connectedUser._id)}
                  >
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
