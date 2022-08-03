import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { nanoid } from 'nanoid';
import moment from 'moment';

import * as Services from '../../../services';
import * as MessageEvents from '../../../services/messages';
import { partition, Option } from '../../utils';

// @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
export const MessagesContext = React.createContext();

const MessagesProviderComponent = ({
  children,
  connectedUser
}: any) => {
  const [messages, setMessages] = useState([]);
  const [adminTeam, setAdminTeam] = useState(undefined);
  const [receivedMessage, setReceivedMessage] = useState(undefined);
  const [totalUnread, setTotalUnread] = useState(0);
  const [lastClosedDates, setLastClosedDates] = useState({});
  const [loading, setLoading] = useState(false);

  const sseId = nanoid(64);

  useEffect(() => {
    if (!connectedUser.isGuest) {
      setLoading(true);
      Services.team('admin')
        .then((team) => {
          setAdminTeam(team);
          if (team.users.some((u: any) => u.userId === connectedUser._id)) {
            return Services.myMessages();
          }
          return Services.myAdminMessages();
        })
        .then(({ messages, previousClosedDates }) => {
          setMessages(messages);
          setLastClosedDates(previousClosedDates);
          setLoading(false);
        });

      MessageEvents.addCallback((m: any) => handleEvent(m), sseId);

      return () => {
        MessageEvents.removeCallback(sseId);
      };
    }
  }, []);

  useEffect(() => {
    if (receivedMessage) {
      if ((lastClosedDates as any).every(({ chat }: any) => chat !== (receivedMessage as any).chat)) {
        setLoading(true);
        Services.lastDateChat((receivedMessage as any).chat, moment().format('x')).then((date) => {
    setLastClosedDates([
        // @ts-expect-error TS(2339): Property 'filter' does not exist on type '{}'.
        ...lastClosedDates.filter((item: any) => item.chat !== receivedMessage.chat),
        // @ts-expect-error TS(2339): Property 'chat' does not exist on type 'never'.
        { chat: receivedMessage.chat, date },
    ]);
    setLoading(false);
});
          setLastClosedDates([
    ...(lastClosedDates as any).filter((item: any) => item.chat !== (receivedMessage as any).chat),
    // @ts-expect-error TS(18004): No value exists in scope for the shorthand propert... Remove this comment to see the full error message
    { chat: (receivedMessage as any).chat, date },
]);
          setLoading(false);
        });
      }
      // @ts-expect-error TS(2552): Cannot find name 'setMessages'. Did you mean 'post... Remove this comment to see the full error message
      setMessages([receivedMessage, ...messages]);
      // @ts-expect-error TS(2304): Cannot find name 'setReceivedMessage'.
      setReceivedMessage(undefined);
    }
  // @ts-expect-error TS(2304): Cannot find name 'receivedMessage'.
  }, [receivedMessage, totalUnread]);

  useEffect(() => {
    // @ts-expect-error TS(2304): Cannot find name 'setTotalUnread'.
    setTotalUnread(messages.filter((m) => !(m as any).readBy.includes(connectedUser._id)).length);
  // @ts-expect-error TS(2552): Cannot find name 'messages'. Did you mean 'onmessa... Remove this comment to see the full error message
  }, [messages]);

  const handleEvent = (m: any) => {
    // @ts-expect-error TS(2304): Cannot find name 'setReceivedMessage'.
    setReceivedMessage(m);
  };

  const sendNewMessage = (newMessage: any, participants: any, chat: any) => {
    // @ts-expect-error TS(2304): Cannot find name 'setLoading'.
    setLoading(true);
    // @ts-expect-error TS(2304): Cannot find name 'setLoading'.
    return Services.sendMessage(newMessage, participants, chat).then(() => setLoading(false));
  };

  const readMessages = (chat: any) => {
    Services.setMessagesRead(chat)
      // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
      .then(() => Services.myChatMessages(chat))
      .then((result) => {
        // @ts-expect-error TS(2304): Cannot find name 'messages'.
        const [filterMessages] = partition(messages, (m: any) => m.chat !== chat);

        // @ts-expect-error TS(2304): Cannot find name 'setMessages'.
        setMessages([...filterMessages, ...result.messages]);
        // @ts-expect-error TS(2304): Cannot find name 'setLastClosedDates'.
        setLastClosedDates([
    // @ts-expect-error TS(2304): Cannot find name 'lastClosedDates'.
    ...(lastClosedDates as any).filter((item: any) => item.chat !== chat),
    ...result.previousClosedDates,
]);
      });
  };

  const closeChat = (chatid: any) => {
    // @ts-expect-error TS(2304): Cannot find name 'setLoading'.
    setLoading(true);
    return Services.closeMessageChat(chatid)
      .then(() => {
        // @ts-expect-error TS(2304): Cannot find name 'adminTeam'.
        if (adminTeam.users.some((u: any) => u.userId === connectedUser._id)) {
          return Services.myMessages();
        }
        return Services.myAdminMessages();
      })
      .then(({ messages, previousClosedDates }) => {
        // @ts-expect-error TS(2304): Cannot find name 'setMessages'.
        setMessages(messages);
        // @ts-expect-error TS(2304): Cannot find name 'setLastClosedDates'.
        setLastClosedDates(previousClosedDates);
        // @ts-expect-error TS(2304): Cannot find name 'setLoading'.
        setLoading(false);
      });
  };

  const getPreviousMessages = (chat: any) => {
    // @ts-expect-error TS(2304): Cannot find name 'lastClosedDates'.
    Option((lastClosedDates as any).find((item: any) => item.chat === chat))
    .map((item: any) => item.date)
    .fold(() => { }, (date: any) => {
    // @ts-expect-error TS(2304): Cannot find name 'setLoading'.
    setLoading(true);
    Services.myChatMessages(chat, date).then((result) => {
        // @ts-expect-error TS(2304): Cannot find name 'setMessages'.
        setMessages([...result.messages, ...messages]);
        // @ts-expect-error TS(2304): Cannot find name 'setLastClosedDates'.
        setLastClosedDates([
            // @ts-expect-error TS(2304): Cannot find name 'lastClosedDates'.
            ...lastClosedDates.filter((item: any) => item.chat !== chat),
            ...result.previousClosedDates,
        ]);
        // @ts-expect-error TS(2304): Cannot find name 'setLoading'.
        setLoading(false);
    });
});
            // @ts-expect-error TS(2304): Cannot find name 'setLastClosedDates'.
            setLastClosedDates([
    // @ts-expect-error TS(2304): Cannot find name 'lastClosedDates'.
    ...(lastClosedDates as any).filter((item: any) => item.chat !== chat),
    // @ts-expect-error TS(2304): Cannot find name 'result'.
    ...result.previousClosedDates,
]);
            // @ts-expect-error TS(2304): Cannot find name 'setLoading'.
            setLoading(false);
          });
        }
      );
  };

  const createNewChat = (chat: any) => {
    // @ts-expect-error TS(2304): Cannot find name 'setLoading'.
    setLoading(true);
    return Services.lastDateChat(chat, moment().format('x')).then((date) => {
      // @ts-expect-error TS(2304): Cannot find name 'setLastClosedDates'.
      setLastClosedDates([...(lastClosedDates as any).filter((item: any) => item.chat !== chat), { chat, date }]);
      // @ts-expect-error TS(2304): Cannot find name 'setLoading'.
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

const mapStateToProps = (state: any) => ({
  ...state.context
});

// @ts-expect-error TS(2345): Argument of type '({ children, connectedUser }: an... Remove this comment to see the full error message
export const MessagesProvider = connect(mapStateToProps)(MessagesProviderComponent);
