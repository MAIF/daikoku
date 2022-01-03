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
  const [loading, setLoading] = useState(false);

  const sseId = faker.random.alphaNumeric(64);

  useEffect(() => {
    if (!connectedUser.isGuest) {
      setLoading(true);
      Services.team('admin')
        .then((team) => {
          setAdminTeam(team);
          if (team.users.some((u) => u.userId === connectedUser._id)) {
            return Services.myMessages();
          }
          return Services.myAdminMessages();
        })
        .then(({ messages, previousClosedDates }) => {
          setMessages(messages);
          setLastClosedDates(previousClosedDates);
          setLoading(false);
        });

      MessageEvents.addCallback((m) => handleEvent(m), sseId);

      return () => {
        MessageEvents.removeCallback(sseId);
      };
    }
  }, []);

  useEffect(() => {
    if (receivedMessage) {
      if (lastClosedDates.every(({ chat }) => chat !== receivedMessage.chat)) {
        setLoading(true);
        Services.lastDateChat(receivedMessage.chat, moment().format('x')).then((date) => {
          setLastClosedDates([
            ...lastClosedDates.filter((item) => item.chat !== receivedMessage.chat),
            { chat: receivedMessage.chat, date },
          ]);
          setLoading(false);
        });
      }
      setMessages([receivedMessage, ...messages]);
      setReceivedMessage(undefined);
    }
  }, [receivedMessage, totalUnread]);

  useEffect(() => {
    setTotalUnread(messages.filter((m) => !m.readBy.includes(connectedUser._id)).length);
  }, [messages]);

  const handleEvent = (m) => {
    setReceivedMessage(m);
  };

  const sendNewMessage = (newMessage, participants, chat) => {
    setLoading(true);
    return Services.sendMessage(newMessage, participants, chat).then(() => setLoading(false));
  };

  const readMessages = (chat) => {
    Services.setMessagesRead(chat)
      .then(() => Services.myChatMessages(chat))
      .then((result) => {
        const [filterMessages] = partition(messages, (m) => m.chat !== chat);

        setMessages([...filterMessages, ...result.messages]);
        setLastClosedDates([
          ...lastClosedDates.filter((item) => item.chat !== chat),
          ...result.previousClosedDates,
        ]);
      });
  };

  const closeChat = (chatid) => {
    setLoading(true);
    return Services.closeMessageChat(chatid)
      .then(() => {
        if (adminTeam.users.some((u) => u.userId === connectedUser._id)) {
          return Services.myMessages();
        }
        return Services.myAdminMessages();
      })
      .then(({ messages, previousClosedDates }) => {
        setMessages(messages);
        setLastClosedDates(previousClosedDates);
        setLoading(false);
      });
  };

  const getPreviousMessages = (chat) => {
    Option(lastClosedDates.find((item) => item.chat === chat))
      .map((item) => item.date)
      .fold(
        () => {},
        (date) => {
          setLoading(true);
          Services.myChatMessages(chat, date).then((result) => {
            setMessages([...result.messages, ...messages]);
            setLastClosedDates([
              ...lastClosedDates.filter((item) => item.chat !== chat),
              ...result.previousClosedDates,
            ]);
            setLoading(false);
          });
        }
      );
  };

  const createNewChat = (chat) => {
    setLoading(true);
    return Services.lastDateChat(chat, moment().format('x')).then((date) => {
      setLastClosedDates([...lastClosedDates.filter((item) => item.chat !== chat), { chat, date }]);
      setLoading(false);
    });
  };

  return (
    <MessagesContext.Provider
      value={{
        messages,
        totalUnread,
        sendNewMessage,
        readMessages,
        adminTeam,
        closeChat,
        getPreviousMessages,
        lastClosedDates,
        loading,
        createNewChat,
      }}
    >
      {children}
    </MessagesContext.Provider>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const MessagesProvider = connect(mapStateToProps)(MessagesProviderComponent);
