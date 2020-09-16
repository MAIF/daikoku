import React, { useState, useEffect } from 'react';
import { t } from '../../../locales';
import faker from 'faker';

import * as MessageEvents from '../../../services/messages';
import * as Services from '../../../services';
import {Option} from '../../utils';

export const MessagesTopBarTools = (props) => {
  //todo: si je ne fais pas partie de l'équipe admin...return null;

  const [opened, setOpened] = useState(false);
  const [messages, setMessages] = useState([]);
  const [adminTeam, setAdminTeam] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);

  const [receivedMessage, setReceivedMessage] = useState(undefined);

  const sseId = faker.random.alphaNumeric(64);

  useEffect(() => {
    Promise.all([
      Services.myMessages(),
      Services.team('admin')
    ])
      .then(([messages, adminTeam]) => {
        const groupedMessages = messages.reduce((acc, message) => {
          const {chat, sender} = message;
          const discussion = acc.find(x => x.chat === chat);
          if (discussion) {
            const otherDisc = acc.filter(x => x.chat !== chat);
            return [...otherDisc, {...discussion, messages: [...discussion.messages, message]}];
          } else {
            return [...acc, {chat, sender, messages: [message]}];
          }
        }, []);


        setMessages(groupedMessages);
        setAdminTeam(adminTeam);
        setLoading(false);
      });

    MessageEvents.addCallback((m) => handleEvent(m), sseId);

    return () => {
      MessageEvents.removeCallback(sseId);
    };
  }, []);

  useEffect(() => {
    const totalCount = messages.reduce((total, conv) => {
      return total + conv.unreadCount || 0;
    }, 0);
    setTotalUnread(totalCount);
  }, [messages]);

  useEffect(() => {
    if (receivedMessage) {
      const { chat, sender } = receivedMessage;
      const discussion = messages.find(x => x.chat === chat);
      const addedCount = receivedMessage.recipient.id === adminTeam._id ? 1 : 0;
      if (discussion) {
        const otherDisc = messages.filter(x => x.chat !== chat);
        setMessages([...otherDisc, { ...discussion, messages: [...discussion.messages, receivedMessage], unreadCount: discussion.unreadCount || 0 + addedCount }]);
      } else {
        setMessages([...messages, { chat, sender, messages: [receivedMessage], unreadCount: addedCount }]);
      }

      // if (receivedMessage.recipient.id === adminTeam._id) {
      //   const maybeCount = unreadMessages.find(x => x.chat === receivedMessage.chat);
      //   const others = unreadMessages.filter(x => x.chat !== receivedMessage.chat);
      //   const count = Option(maybeCount).map(({chat, count}) => ({chat, count: count + 1})).getOrElse({chat: receivedMessage.chat, count: 1})
      //   setUnreadMessages([...others, count]);
      // }
    }
  }, [receivedMessage]);

  const handleEvent = (m) => {
    setReceivedMessage(m);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        className="notification-link cursor-pointer"
        onClick={() => setOpened(!opened)}
        title={t('Access to the messages', props.currentLanguage)}>
        <i className="fas fa-comment-alt" />
        {totalUnread}
      </div>
      {opened && (
        <div style={{
          position: 'absolute', width: '300px', backgroundColor: '#fff', right: '0', top: '60px'
        }}>
          {
            messages.map((conv, idx) => {
              return (
                <div key={idx}>
                  <div>{conv.chat} ({conv.unreadCount || 0})</div>
                </div>
              );
            })
          }
        </div>
      )}
    </div>
  );
};