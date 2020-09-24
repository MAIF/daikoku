import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import faker from 'faker';
import _ from 'lodash';

import * as Services from '../../../services';
import * as MessageEvents from '../../../services/messages';


export const MessagesContext = React.createContext();

const MessagesProviderComponent = ({ children, connectedUser }) => {
  const [messages, setMessages] = useState([]);
  const [receivedMessage, setReceivedMessage] = useState(undefined);
  const [totalUnread, setTotalUnread] = useState(0);
  const [newMessage, setNewMessage] = useState(undefined);

  const sseId = faker.random.alphaNumeric(64);

  useEffect(() => {
    Promise.all([
      Services.myAdminMessages(),
      Services.team('admin')
    ]) //todo: if admin get all my messages
      .then(([messages, adminTeam]) => {
        setMessages(messages.reverse());
        setTotalUnread(messages.filter(m => !m.readBy.includes(connectedUser._id)).length);
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

      if (!receivedMessage.readBy.includes(connectedUser._id)) {
        setTotalUnread(totalUnread + 1);
      } else {
        setTotalUnread(0);
      }
    }
  }, [receivedMessage, totalUnread]);

  const handleEvent = (m) => {
    setReceivedMessage(m);
  };

  const sendNewMessage = () => {
    const chat = Option(_.head(messages))
      .map(m => m.chat)
      .getOrElse(connectedUser._id);

    Services.sendMessage(newMessage, [...adminTeam.users.map(u => u.userId), connectedUser._id], chat)
      .then(() => {
        setNewMessage('');
      });
  };

  return (
    <MessagesContext.Provider value={{messages, totalUnread}}>
      {children}
    </MessagesContext.Provider>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const MessagesProvider = connect(mapStateToProps)(MessagesProviderComponent);