import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { nanoid } from 'nanoid';
import moment from 'moment';

import * as Services from '../../../services';
import * as MessageEvents from '../../../services/messages';
import { partition, Option } from '../../utils';
import { isError, ITeamSimple } from '../../../types';

const initMessageContext = {
  messages: [],
  totalUnread: 0,
  sendNewMessage: () => { },
  readMessages: () => { },
  adminTeam: {},
  closeChat: () => { },
  getPreviousMessages: () => { },
  lastClosedDates: null,
  loading: false,
  createNewChat: () => { },
}

type TMessageContext = {
  messages: any,
  totalUnread: number,
  sendNewMessage: any,
  readMessages: any,
  adminTeam: any,
  closeChat: any,
  getPreviousMessages: any,
  lastClosedDates: any,
  loading: boolean,
  createNewChat: any,
}
export const MessagesContext = React.createContext<TMessageContext>(initMessageContext);

const MessagesProviderComponent = ({
  children,
  connectedUser
}: { children: JSX.Element, connectedUser?: any }) => {
  const [messages, setMessages] = useState<Array<any>>([]);
  const [adminTeam, setAdminTeam] = useState<ITeamSimple>();
  const [receivedMessage, setReceivedMessage] = useState<any>(undefined);
  const [totalUnread, setTotalUnread] = useState<number>(0);
  const [lastClosedDates, setLastClosedDates] = useState<Array<any>>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const sseId = nanoid(64);

  useEffect(() => {
    if (!connectedUser.isGuest) {
      setLoading(true);
      Services.team('admin')
        .then((team) => {
          if (!isError(team)) {
            setAdminTeam(team);
            if (team.users.some((u: any) => u.userId === connectedUser._id)) {
              return Services.myMessages();
            }
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
            ...lastClosedDates.filter((item: any) => item.chat !== receivedMessage.chat),
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
    setTotalUnread(messages.filter((m) => !(m as any).readBy.includes(connectedUser._id)).length);
  }, [messages]);

  const handleEvent = (m: any) => {
    setReceivedMessage(m);
  };

  const sendNewMessage = (newMessage: any, participants: any, chat: any) => {
    setLoading(true);
    return Services.sendMessage(newMessage, participants, chat).then(() => setLoading(false));
  };

  const readMessages = (chat: any) => {
    Services.setMessagesRead(chat)
      .then(() => Services.myChatMessages(chat))
      .then((result) => {
        const [filterMessages] = partition(messages, (m: any) => m.chat !== chat);

        setMessages([...filterMessages, ...result.messages]);
        setLastClosedDates([
          ...(lastClosedDates as any).filter((item: any) => item.chat !== chat),
          ...result.previousClosedDates,
        ]);
      });
  };

  const closeChat = (chatid: string) => {
    setLoading(true);
    return Services.closeMessageChat(chatid)
      .then(() => {
        if (adminTeam?.users.some((u) => u.userId === connectedUser._id)) {
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

  const getPreviousMessages = (chat: any) => {
    Option((lastClosedDates as any).find((item: any) => item.chat === chat))
      .map((item: any) => item.date)
      .fold(() => { }, (date: any) => {
        setLoading(true);
        Services.myChatMessages(chat, date).then((result) => {
          setMessages([...result.messages, ...messages]);
          setLastClosedDates([
            ...lastClosedDates.filter((item: any) => item.chat !== chat),
            ...result.previousClosedDates,
          ]);
          setLoading(false);
        });
      });
  };

  const createNewChat = (chat: any) => {
    setLoading(true);
    return Services.lastDateChat(chat, moment().format('x')).then((date) => {
      setLastClosedDates([...(lastClosedDates as any).filter((item: any) => item.chat !== chat), { chat, date }]);
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

export const MessagesProvider = connect(mapStateToProps)(MessagesProviderComponent);
