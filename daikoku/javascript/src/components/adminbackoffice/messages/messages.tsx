import classNames from 'classnames';
import head from 'lodash/head';
import maxBy from 'lodash/maxBy';
import orderBy from 'lodash/orderBy';
import sortBy from 'lodash/sortBy';
import values from 'lodash/values';
import { useContext, useEffect, useState } from 'react';
import Send from 'react-feather/dist/icons/send';
import ChevronLeft from 'react-feather/dist/icons/chevron-left';
import Select from 'react-select';
import { differenceInDays, format, formatDistanceToNow } from 'date-fns';

import { useTenantBackOffice } from '../../../contexts';
import { I18nContext } from '../../../contexts/i18n-context';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import * as MessagesEvents from '../../../services/messages';
import { IUserSimple, isError } from '../../../types';
import { MessagesContext } from '../../backoffice';
import { BeautifulTitle, Option, formatMessageDate, getInitials, getLanguageFns, partition, userHasAvatar } from '../../utils';
import { IMessage } from '../../../types/chat';

const unknownUser = (id: string): IUserSimple => ({
  _id: id,
  _humanReadableId: 'unknown',
  email: 'unknown',
  picture: '/assets/images/anonymous.jpg',
  isDaikokuAdmin: false,
  isGuest: true,
  starredApis: [],
  name: 'unknown user',
  twoFactorAuthentication: null
})

export const AdminMessages = () => {
  useTenantBackOffice();

  const {
    messages,
    sendNewMessage,
    readMessages,
    closeChat,
    getPreviousMessages,
    lastClosedDates,
    loading,
    createNewChat,
    adminTeam,
  } = useContext(MessagesContext);

  type IGroupedMessage = { chat: string, user: IUserSimple, messages: Array<IMessage> }

  const [groupedMessages, setGroupedMessages] = useState<Array<IGroupedMessage>>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [users, setUsers] = useState<Array<IUserSimple>>([]);
  const [selectedChat, setSelectedChat] = useState<string>();

  const [possibleNewUsers, setPossibleNewUsers] = useState<Array<IUserSimple>>([]);

  const { connectedUser } = useContext(GlobalContext);

  useEffect(() => {
    Services.fetchAllUsers()
      .then((users) => {
        if (!isError(users)) {
          setUsers(users)
        }
      });
  }, []);

  useEffect(() => {
    setPossibleNewUsers(users.filter((u) => !u.isDaikokuAdmin && !groupedMessages.some(({ chat }) => chat === u._id)));
  }, [groupedMessages, users]);

  useEffect(() => {
    if (users.length) {
      const groupedMessages = messages.reduce<Array<IGroupedMessage>>((groups, m) => {
        const { chat } = m;
        const [actualGroup, others] = partition(groups, (g) => g.chat === chat);
        const user = users.find((u) => u._id === chat) ?? unknownUser(chat);
        const updatedGroup = Option(head(actualGroup))
          .map((g) => ({
            ...g,
            messages: [...g.messages, m]
          }))
          .getOrElse({ chat, user, messages: [m] });

        return [...others, updatedGroup];
      }, []);
      setGroupedMessages(groupedMessages);
      maybeReadMessage();
    }
  }, [messages, users]);

  useEffect(() => {
    maybeReadMessage();
  }, [selectedChat]);

  const { translate, language, Translation } = useContext(I18nContext);

  const maybeReadMessage = () => {
    if (selectedChat) {
      const unreadCount = Option(groupedMessages.find((g) => g.chat === selectedChat))
        .map((group) => group.messages)
        .getOrElse([])
        .filter((m) => !m.readBy.includes(connectedUser._id)).length;
      if (unreadCount) {
        readMessages(selectedChat);
      }
    }
  };

  const closeSelectedChat = (chat: string) => {
    if (selectedChat === chat) {
      setSelectedChat(undefined);
    }
    closeChat(chat);
  };

  const sendMessage = () => {
    if (!loading && newMessage.trim() && selectedChat && adminTeam) {
      const participants = Option(groupedMessages.find((g) => g.chat === selectedChat))
        .map(g => head(g.messages))
        .map(m => m.participants)
        .getOrElse([selectedChat, ...adminTeam.users.map((u) => u.userId)]);

      sendNewMessage(newMessage, participants, selectedChat).then(() => {
        setNewMessage('');
      });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!newMessage.trim()) return;

    switch (event.key) {
      case 'Enter':
        sendMessage();
        event.preventDefault();
    }
  };

  const createDialog = (user: IUserSimple) => {
    createNewChat(user._id)
      .then(() => {
        setGroupedMessages([...groupedMessages, { chat: user._id, user, messages: [] }]);
        setSelectedChat(user._id);
      });
  };

  const orderedMessages = sortBy(groupedMessages, 'chat');
  const dialog = Option(groupedMessages.find(({ chat }) => chat === selectedChat))
    .map((g) => MessagesEvents.fromMessagesToDialog(g.messages))
    .getOrElse([]);

  return (
    <div className="d-flex flex-row messages-container">
      <div className="d-flex flex-column col-12 col-md-3 p-2 messages-sender-container level2">
        <Select
          placeholder={translate('Start new conversation')}
          className="mx-2 mb-2 reactSelect"
          options={possibleNewUsers.map((u) => ({
            label: (<div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              {u.name} ({u.email}){' '}
              {userHasAvatar(u) && <img
                style={{
                  borderRadius: '50%',
                  backgroundColor: 'white',
                  width: 34,
                  height: 34,
                }}
                src={u.picture} alt="avatar" />}
              {!userHasAvatar(u) && <div
                className='avatar-without-img'
                style={{
                  borderRadius: '50%',
                  backgroundColor: 'white',
                  width: 34,
                  height: 34,
                }}>{getInitials(u.name)}</div>}
            </div>),
            value: u,
          }))}
          value={null} //@ts-ignore //FIXME
          onChange={({ value }) => createDialog(value)}
          filterOption={(data, search) => values(data.value)
            .filter((e) => typeof e === 'string')
            .some((v) => v.includes(search))} classNamePrefix="reactSelect" />
        {orderBy(orderedMessages.map(({ chat, user, messages }) => {
          const maxMessage = maxBy(messages, 'date');
          const maxDate = Option(maxMessage)
            .map((m) => new Date(m.date))
            .getOrElse(new Date());
          const unreadCount = messages.filter((m) => !m.readBy.includes(connectedUser?._id)).length;
          return { chat, user, messages, unreadCount, maxDate };
        }), ['unreadCount', 'maxDate', 'user.name'], ['desc', 'desc', 'asc'])
          .map(({ chat, user, messages, unreadCount, maxDate }, idx) => {
            const lastMessageDateDisplayed = differenceInDays(new Date, maxDate) > 1 ? format(maxDate, 'D MMM.') : formatDistanceToNow(maxDate, { includeSeconds: true, addSuffix: true, locale: getLanguageFns(language)});
            return (<div key={idx} className={classNames('p-3 cursor-pointer d-flex flex-row messages-sender level2-link__with-bg', {
              'level2-link__active-bg': selectedChat === chat,
            })} onClick={() => setSelectedChat(chat)}>
              <div className="col-4">
                {userHasAvatar(user) && <img className="user-avatar" src={user.picture} alt="user-avatar" style={{ width: '100%' }} />}
                {!userHasAvatar(user) && <div className="user-avatar avatar-without-img" style={{ width: '100%', aspectRatio: '1 / 1', fontSize: '2rem' }}>{getInitials(user.name)}</div>}
                {unreadCount > 0 && <span className="notification">{unreadCount}</span>}
              </div>
              <div className="col-8">
                <div className="d-flex justify-content-between">
                  <BeautifulTitle title={user.name} className="message__user--name">
                    <h4 className="message__user--name">{user.name}</h4>
                  </BeautifulTitle>
                  <a className="delete-link cursor-pointer" onClick={(e) => {
                    e.stopPropagation();
                    closeSelectedChat(chat);
                  }}>
                    <i className="fas fa-trash" />
                  </a>
                </div>
                <div className="d-flex justify-content-end">
                  <div>{lastMessageDateDisplayed}</div>
                </div>
              </div>
            </div>);
          })}
      </div>
      <div className="col-12 col-sm-9">
        <div className="d-flex d-sm-none justify-content-end">
          <button className="btn btn-sm btn-outline-primary ">
            <ChevronLeft />
          </button>
        </div>
        <div className="d-flex flex-column-reverse ms-2 messages-content">
          {dialog.reverse().map((group, idx: number) => {
            return (<div key={`discussion-messages-${idx}`} className={classNames('discussion-messages', {
              'discussion-messages--received': group.every((m) => m.sender === selectedChat),
              'discussion-messages--send': group.every((m) => m.sender !== selectedChat),
            })}>
              {group.map((m, idx: number) => {
                const sender = Option(users.find((u) => u._id === m.sender))
                  .map((u) => u.name)
                  .getOrElse(translate('Unknown user'));
                return (<div key={`discussion-message-${idx}`} className="discussion-message d-flex flex-column level2">
                  <span className="sender">{sender}</span>
                  <span className="message">{m.message}</span>
                  <span className="info">
                    <span className="date">{formatMessageDate(m.date, language)}</span>
                  </span>
                </div>);
              })}
            </div>);
          })}
          {selectedChat && lastClosedDates?.find((x) => x.chat === selectedChat)?.date ? (<div className="d-flex flex-row justify-content-center my-1">
            <button className="btn btn-sm btn-outline-info" disabled={loading} onClick={() => getPreviousMessages(selectedChat)}>
              <Translation i18nkey="Load previous messages">Load previous messages</Translation>
            </button>
          </div>) : <></>}
          {selectedChat && (<div className="discussion-form discussion-form__message">
            <input disabled={loading} type="text" value={loading ? '...' : newMessage} onKeyDown={handleKeyDown} onChange={(e) => setNewMessage(e.target.value)} placeholder={translate('Your message')} />
            <button disabled={loading} className="send-button" onClick={sendMessage}>
              <Send />
            </button>
          </div>)}
        </div>
      </div>
    </div>
  );
}
