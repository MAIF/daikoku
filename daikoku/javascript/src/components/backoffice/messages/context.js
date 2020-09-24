import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import faker from 'faker';
import _ from 'lodash';

import * as Services from '../../../services';
import * as MessageEvents from '../../../services/messages';
import { Option } from '../../utils';


export const MessagesContext = React.createContext();

const MessagesProviderComponent = ({ children, connectedUser }) => {
  const [messages, setMessages] = useState([]);
  const [adminTeam, setAdminTeam] = useState(undefined);
  const [receivedMessage, setReceivedMessage] = useState(undefined);
  const [totalUnread, setTotalUnread] = useState(0);

  const sseId = faker.random.alphaNumeric(64);

  useEffect(() => {
    Services.team('admin')
      .then((team) => {
        setAdminTeam(team);
        if (team.users.some(u => u.userId === connectedUser._id)) {
          return Services.myMessages();
        } 
          return Services.myAdminMessages();
      })
      .then((m) => setMessages(m));

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

  const sendNewMessage = (newMessage, participants, chat) => {
    return Services.sendMessage(newMessage, participants, chat);
  };

  const readMessages = (chat) => {
    //todo: thnink different !!!
    Services.setMessagesRead(chat);
  };

  return (
    <MessagesContext.Provider value={{messages, totalUnread, sendNewMessage, readMessages, adminTeam}}>
      {children}
    </MessagesContext.Provider>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const MessagesProvider = connect(mapStateToProps)(MessagesProviderComponent);