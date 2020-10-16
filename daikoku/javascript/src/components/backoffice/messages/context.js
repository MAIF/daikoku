import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import faker from 'faker';
import moment from 'moment';

import * as Services from '../../../services';
import * as MessageEvents from '../../../services/messages';
import { partition, Option } from '../../utils';


export const MessagesContext = React.createContext();

const MessagesProviderComponent = ({ children, connectedUser }) => {
  const [messages, setMessages] = useState([]);
  const [adminTeam, setAdminTeam] = useState(undefined);
  const [receivedMessage, setReceivedMessage] = useState(undefined);
  const [totalUnread, setTotalUnread] = useState(0);
  const [lastClosedDates, setLastClosedDates] = useState({});

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
    }
  }, [receivedMessage, totalUnread]);

  useEffect(() => {
    setTotalUnread(messages.filter(m => !m.readBy.includes(connectedUser._id)).length);
    setLastClosedDates(calcLastClosedDates());
  }, [messages]);

  const handleEvent = (m) => {
    setReceivedMessage(m);
  };

  const sendNewMessage = (newMessage, participants, chat) => {
    return Services.sendMessage(newMessage, participants, chat);
  };

  const readMessages = (chat) => {
    Services.setMessagesRead(chat)
      .then(() => Services.myChatMessages(chat))
      .then((chatMessages) => {
        const [filterMessages] = partition(messages, m => m.chat !== chat);
        setMessages([...filterMessages, ...chatMessages]);
      });
  };

  const closeChat = (chatid) => {
    return Services.closeMessageChat(chatid)
      .then(() => {
        if (adminTeam.users.some(u => u.userId === connectedUser._id)) {
          return Services.myMessages();
        }
        return Services.myAdminMessages();
      })
      .then((m) => setMessages(m));
  };

  const calcLastClosedDates = () => {
    return messages.reduce((acc, {chat, closed}) => {
      if (closed) {
        const maybeLastDate = acc[chat];
        if (!maybeLastDate) {
          return { ...acc, [chat]: closed };
        } else if (maybeLastDate && closed < maybeLastDate) {
          return {...acc, [chat]: closed};
        }
      }
      return acc;
    }, {});
  };

  const getPreviousMessages = (chat) => {
    const date = Option(lastClosedDates[chat]).getOrElse(moment().format('x'));
    Services.lastDateChat(chat, date)
      .then(({date}) => {
        if (date) {
          Services.myChatMessages(chat, date)
            .then(previousMessages => setMessages([...previousMessages, ...messages]));
        }
      });
  };

  return (
    <MessagesContext.Provider value={{ messages, totalUnread, sendNewMessage, readMessages, adminTeam, closeChat, getPreviousMessages, lastClosedDates}}>
      {children}
    </MessagesContext.Provider>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const MessagesProvider = connect(mapStateToProps)(MessagesProviderComponent);