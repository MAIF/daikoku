import React, { useState, useEffect } from 'react';
import faker from 'faker';
import _ from 'lodash';

import { t } from '../../../locales';
import * as MessageEvents from '../../../services/messages';
import * as Services from '../../../services';
import { Option, partition } from '../../utils';
import { UserBackOffice } from '../../backoffice';

export const AdminMessages = props => {
  const [messages, setMessages] = useState([]);

  const sseId = faker.random.alphaNumeric(64);

  useEffect(() => {
    Services.myMessages()
      .then(messages => {
        const groupedMessages = messages.reduce((groups, m) => {
          const { chat, message } = m;


          const [actualGroup, others] = partition(groups, g => g.chat === chat)

          const updatedGroup = Option(_.head(actualGroup))
            .map(g => ({ chat, messages: [...g.messages, message] }))
            .getOrElse(({ chat, messages: [message] }));

          return [...others, updatedGroup];

        }, []);
        setMessages(groupedMessages);
      });
  }, []);

  useEffect(() => {
    MessageEvents.addCallback((m) => handleEvent(m), sseId);

    return () => {
      MessageEvents.removeCallback(sseId);
    };
  }, [messages]);

  const handleEvent = (m) => {
    if (m) {
      const { chat, message } = m;
      const [actualGroup, others] = partition(messages, g => g.chat === message.chat);

      const updatedGroup = Option(_.head(actualGroup))
        .map(g => ({ chat, messages: [...g.messages, message] }))
        .getOrElse(({ chat, messages: [message] }));

      setMessages([...others, updatedGroup]);
    }
  };

  const orderedMessages = _.sortBy(messages.map(({chat, messages}) => ({chat, messages: messages.reverse()})), 'chat');
  return (
    <UserBackOffice tab="Messages">
      <ul>
        {
          orderedMessages.map((g, idx) => {
            return (
              <li key={idx}>
                <h4>{g.chat}</h4>
                <ol>
                  {g.messages.map((m, idx) => {
                    return (
                      <li key={idx}>
                        {JSON.stringify(m)}
                      </li>
                    );
                  })}
                </ol>
              </li>
            );
          })
        }
      </ul>
    </UserBackOffice>
  );
};