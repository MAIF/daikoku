import { nanoid } from 'nanoid';
import React, { PropsWithChildren, useContext, useEffect, useState } from 'react';

import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import * as MessageEvents from '../../../services/messages';
import { isError, ITeamSimple } from '../../../types';
import { IChatClosedDate, IMessage } from '../../../types/chat';
import { Option, partition } from '../../utils';

const initMessageContext = {
  messages: [],
  totalUnread: 0,
  sendNewMessage: (newMessage: string, participants: Array<string>, chat: string) => Promise.resolve(),
  readMessages: (chat: string) => Promise.resolve(),
  adminTeam: {} as ITeamSimple,
  closeChat: (chat: string) => Promise.resolve(),
  getPreviousMessages: (chat: string) => { },
  lastClosedDates: undefined,
  loading: false,
  createNewChat: () => Promise.resolve(),
}

type TMessageContext = {
  messages: Array<IMessage>,
  totalUnread: number,
  sendNewMessage: (newMessage: string, participants: Array<string>, chat: string) => Promise<void>,
  readMessages: (chat: string) => Promise<void>,
  adminTeam?: ITeamSimple,
  closeChat: (chat: string) => Promise<void>,
  getPreviousMessages: (chat: string) => void,
  lastClosedDates?: Array<IChatClosedDate>,
  loading: boolean,
  createNewChat: (chat: string) => Promise<void>,
}
export const MessagesContext = React.createContext<TMessageContext>(initMessageContext);

export const MessagesProvider = (props: PropsWithChildren) => {
  const [messages, setMessages] = useState<Array<IMessage>>([]);
  const [adminTeam, setAdminTeam] = useState<ITeamSimple>();
  const [receivedMessage, setReceivedMessage] = useState<IMessage>();
  const [totalUnread, setTotalUnread] = useState<number>(0);
  const [lastClosedDates, setLastClosedDates] = useState<Array<IChatClosedDate>>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const { connectedUser } = useContext(GlobalContext)
  const sseId = nanoid(64);

  useEffect(() => {
    if (!connectedUser.isGuest) {
      setLoading(true);
      Services.team('admin')
        .then((team) => {
          if (!isError(team)) {
            setAdminTeam(team);
            if (team.users.some((u) => u.userId === connectedUser._id)) {
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

      MessageEvents.addCallback((m: IMessage) => handleEvent(m), sseId);

      return () => {
        MessageEvents.removeCallback(sseId);
      };
    }
  }, []);

  useEffect(() => {
    if (receivedMessage) {
      if (lastClosedDates.every(({ chat }) => chat !== receivedMessage.chat)) {
        setLoading(true);
        Services.lastDateChat(receivedMessage.chat, new Date().getTime())
          .then((date) => {
            setLastClosedDates([
              ...lastClosedDates.filter(item => item.chat !== receivedMessage.chat),
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

  const handleEvent = (m: IMessage) => {
    setReceivedMessage(m);
  };

  const sendNewMessage = (newMessage: string, participants: Array<string>, chat: string) => {
    setLoading(true);
    return Services.sendMessage(newMessage, participants, chat)
      .then(() => setLoading(false));
  };

  const readMessages = (chat: string) => {
    return Services.setMessagesRead(chat)
      .then(() => Services.myChatMessages(chat))
      .then((result) => {
        const [filterMessages] = partition(messages, (m) => m.chat !== chat);

        setMessages([...filterMessages, ...result.messages]);
        setLastClosedDates([
          ...(lastClosedDates).filter((item) => item.chat !== chat),
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

  const getPreviousMessages = (chat: string) => {
    Option((lastClosedDates).find((item) => item.chat === chat))
      .map((item) => item.date)
      .fold(() => { }, (date) => {
        setLoading(true);
        Services.myChatMessages(chat, date)
          .then((result) => {
            setMessages([...result.messages, ...messages]);
            setLastClosedDates([
              ...lastClosedDates.filter((item) => item.chat !== chat),
              ...result.previousClosedDates,
            ]);
            setLoading(false);
          });
      });
  };

  const createNewChat = (chat: string) => {
    setLoading(true);
    return Services.lastDateChat(chat, new Date().getTime())
      .then((date) => {
        setLastClosedDates([...(lastClosedDates).filter((item) => item.chat !== chat), { chat, date }]);
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
      {props.children}
    </MessagesContext.Provider>
  );
};
