import React, { useState, useEffect, useContext } from 'react';
import { useSelector } from 'react-redux';
import classNames from 'classnames';
import { Send, ChevronLeft } from 'react-feather';
import head from'lodash/head';
import sortBy from'lodash/sortBy';
import values from'lodash/values';
import orderBy from'lodash/orderBy';
import maxBy from'lodash/maxBy';
import moment from 'moment';
import Select from 'react-select';

import { MessagesContext } from '../../backoffice';
import * as MessagesEvents from '../../../services/messages';
import * as Services from '../../../services';
import { Option, partition, formatMessageDate, BeautifulTitle } from '../../utils';
// @ts-expect-error TS(6142): Module '../../../locales/i18n-context' was resolve... Remove this comment to see the full error message
import { I18nContext } from '../../../locales/i18n-context';
import { useTenantBackOffice } from '../../../contexts';

export const AdminMessages = () => {
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  useTenantBackOffice();

  const {
    // @ts-expect-error TS(2339): Property 'messages' does not exist on type 'unknow... Remove this comment to see the full error message
    messages,
    // @ts-expect-error TS(2339): Property 'sendNewMessage' does not exist on type '... Remove this comment to see the full error message
    sendNewMessage,
    // @ts-expect-error TS(2339): Property 'readMessages' does not exist on type 'un... Remove this comment to see the full error message
    readMessages,
    // @ts-expect-error TS(2339): Property 'closeChat' does not exist on type 'unkno... Remove this comment to see the full error message
    closeChat,
    // @ts-expect-error TS(2339): Property 'getPreviousMessages' does not exist on t... Remove this comment to see the full error message
    getPreviousMessages,
    // @ts-expect-error TS(2339): Property 'lastClosedDates' does not exist on type ... Remove this comment to see the full error message
    lastClosedDates,
    // @ts-expect-error TS(2339): Property 'loading' does not exist on type 'unknown... Remove this comment to see the full error message
    loading,
    // @ts-expect-error TS(2339): Property 'createNewChat' does not exist on type 'u... Remove this comment to see the full error message
    createNewChat,
    // @ts-expect-error TS(2339): Property 'adminTeam' does not exist on type 'unkno... Remove this comment to see the full error message
    adminTeam,
  } = useContext(MessagesContext);

  const [groupedMessages, setGroupedMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedChat, setSelectedChat] = useState(undefined);

  const [possibleNewUsers, setPossibleNewUsers] = useState([]);

  const connectedUser = useSelector((s) => (s as any).context.connectedUser);

  useEffect(() => {
    Services.fetchAllUsers().then((users) => setUsers(users));
  }, []);

  useEffect(() => {
    setPossibleNewUsers(users.filter((u) => !(u as any).isDaikokuAdmin && !groupedMessages.some(({ chat }) => chat === (u as any)._id)));
  }, [groupedMessages, users]);

  useEffect(() => {
    if (users.length) {
      const groupedMessages = messages.reduce((groups: any, m: any) => {
        const { chat } = m;
        const [actualGroup, others] = partition(groups, (g: any) => g.chat === chat);
        const user = users.find((u) => (u as any)._id === chat);
        const updatedGroup = Option(head(actualGroup))
          .map((g: any) => ({
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

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, language, Translation } = useContext(I18nContext);

  const maybeReadMessage = () => {
    if (selectedChat) {
      const unreadCount = Option(groupedMessages.find((g) => (g as any).chat === selectedChat))
    .map((group: any) => group.messages)
    .getOrElse([])
    .filter((m: any) => !m.readBy.includes(connectedUser._id)).length;
      if (unreadCount) {
        readMessages(selectedChat);
      }
    }
  };

  const closeSelectedChat = (chat: any) => {
    if (selectedChat === chat) {
      setSelectedChat(undefined);
    }
    closeChat(chat);
  };

  const sendMessage = () => {
    if (!loading && newMessage.trim()) {
      const participants = Option(groupedMessages.find((g) => (g as any).chat === selectedChat))
    .map((g: any) => head(g.messages))
    .map((m: any) => m.participants)
    .getOrElse([selectedChat, ...adminTeam.users.map((u: any) => u.userId)]);

      sendNewMessage(newMessage, participants, selectedChat).then(() => {
        setNewMessage('');
      });
    }
  };

  const handleKeyDown = (event: any) => {
    if (!newMessage.trim()) return;

    switch (event.key) {
      case 'Enter':
        sendMessage();
        event.preventDefault();
    }
  };

  const createDialog = (user: any) => {
    createNewChat(user._id).then(() => {
      // @ts-expect-error TS(2322): Type '{ chat: any; user: any; messages: never[]; }... Remove this comment to see the full error message
      setGroupedMessages([...groupedMessages, { chat: user._id, user, messages: [] }]);
      setSelectedChat(user._id);
    });
  };

  const orderedMessages = sortBy(groupedMessages, 'chat');
  const dialog = Option(groupedMessages.find(({ chat }) => chat === selectedChat))
    .map((g: any) => MessagesEvents.fromMessagesToDialog(g.messages))
    .getOrElse([]);

  moment.locale(language);
  moment.updateLocale('fr', {
    relativeTime: {
      s: translateMethod('moment.duration.seconds', false, 'few sec'),
      m: translateMethod('moment.duration.minutes', false, '1 min', '1'),
      mm: translateMethod('moment.duration.minutes', false, '%d min', '%d'),
      h: translateMethod('moment.duration.hours', false, '1 h', '1'),
      hh: translateMethod('moment.duration.jours', false, '%d h', '%d'),
      d: translateMethod('moment.duration.days', false, '1 d', '1'),
      dd: translateMethod('moment.duration.days', false, '%d d', '%d'),
    },
  });

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div className="d-flex flex-row messages-container">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex flex-column col-12 col-md-3 messages-sender">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Select placeholder={translateMethod('Start new conversation')} className="mx-2 mb-2 reactSelect" options={possibleNewUsers.map((u) => ({
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        label: (<div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                {(u as any).name} ({(u as any).email}){' '}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <img style={{
                borderRadius: '50%',
                backgroundColor: 'white',
                width: 34,
                height: 34,
            }} src={(u as any).picture} alt="avatar"/>
              </div>),
        value: u,
    // @ts-expect-error TS(2339): Property 'value' does not exist on type 'SingleVal... Remove this comment to see the full error message
    }))} value={null} onChange={({ value }) => createDialog(value)} filterOption={(data, search) => values(data.value)
        .filter((e) => typeof e === 'string')
        .some((v) => v.includes(search))} classNamePrefix="reactSelect"/>
        {orderBy(orderedMessages.map(({ chat, user, messages }) => {
        const maxMessage = maxBy(messages, 'date');
        const maxDate = Option(maxMessage)
            .map((m: any) => moment(m.date))
            .getOrElse(moment());
        // @ts-expect-error TS(2339): Property 'filter' does not exist on type 'never'.
        const unreadCount = messages.filter((m: any) => !m.readBy.includes(connectedUser._id)).length;
        return { chat, user, messages, unreadCount, maxDate };
    }), ['unreadCount', 'maxDate', 'user.name'], ['desc', 'desc', 'asc']) //todo: maybe order
        .map(({ chat, user, messages, unreadCount, maxDate }, idx) => {
        const lastMessageDateDisplayed = moment().diff(maxDate, 'days') > 1 ? maxDate.format('D MMM.') : maxDate.fromNow(true);
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return (<div key={idx} className={classNames('p-3 cursor-pointer d-flex flex-row', {
                'messages-sender__active': selectedChat === chat,
            })} onClick={() => setSelectedChat(chat)}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="col-4">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <img className="user-avatar" src={user.picture} alt="user-avatar" style={{ width: '100%' }}/>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  {unreadCount > 0 && <span className="notification">{unreadCount}</span>}
                </div>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="col-8">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="d-flex justify-content-between">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <BeautifulTitle title={user.name} className="message__user--name">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <h4 className="message__user--name">{user.name}</h4>
                    </BeautifulTitle>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <a className="delete-link cursor-pointer" onClick={(e) => {
                e.stopPropagation();
                closeSelectedChat(chat);
            }}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="fas fa-trash"/>
                    </a>
                  </div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="d-flex justify-content-end">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <div>{lastMessageDateDisplayed}</div>
                  </div>
                </div>
              </div>);
    })}
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-12 col-sm-9">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex d-sm-none justify-content-end">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-sm btn-access-negative ">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ChevronLeft />
          </button>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="p-3 d-flex justify-content-around align-items-center messages-sender__active">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <img className="user-avatar" src="https://www.gravatar.com/avatar/53fc466c35867413e3b4c906ebf370cb?size=128&amp;d=robohash" alt="user-avatar"/>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h4 className="message__user--name">A remplir avec le bon user</h4>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex flex-column-reverse ms-2 messages-content">
          {dialog.reverse().map((group: any, idx: any) => {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return (<div key={`discussion-messages-${idx}`} className={classNames('discussion-messages', {
                'discussion-messages--received': group.every((m: any) => m.sender === selectedChat),
                'discussion-messages--send': group.every((m: any) => m.sender !== selectedChat),
            })}>
                {group.map((m: any, idx: any) => {
                // @ts-expect-error TS(2339): Property '_id' does not exist on type 'never'.
                const sender = Option(users.find((u) => u._id === m.sender))
                    .map((u: any) => u.name)
                    .getOrElse(translateMethod('Unknown user'));
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<div key={`discussion-message-${idx}`} className="discussion-message d-flex flex-column">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span className="sender">{sender}</span>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span className="message">{m.message}</span>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span className="info">
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span className="date">{formatMessageDate(m.date)}</span>
                      </span>
                    </div>);
            })}
              </div>);
    })}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {selectedChat && lastClosedDates.find((x: any) => x.chat === selectedChat).date && (<div className="d-flex flex-row justify-content-center my-1">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button className="btn btn-sm btn-outline-primary" disabled={loading ? 'disabled' : null} onClick={() => getPreviousMessages(selectedChat)}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="Load previous messages">Load previous messages</Translation>
              </button>
            </div>)}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {selectedChat && (<div className="discussion-form discussion-form__message">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <input disabled={loading ? 'disabled' : null} type="text" value={loading ? '...' : newMessage} onKeyDown={handleKeyDown} onChange={(e) => setNewMessage(e.target.value)} placeholder={translateMethod('Your message')}/>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button disabled={loading ? 'disabled' : null} className="send-button" onClick={sendMessage}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Send />
              </button>
            </div>)}
        </div>
      </div>
    </div>);

            const unreadCount = (messages as any).filter((m: any) => !m.readBy.includes(connectedUser._id)).length;

            // @ts-expect-error TS(18004): No value exists in scope for the shorthand propert... Remove this comment to see the full error message
            return { chat, user, messages, unreadCount, maxDate };
          }),
          // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
          ['unreadCount', 'maxDate', 'user.name'],
          ['desc', 'desc', 'asc']
        ) //todo: maybe order
          // @ts-expect-error TS(2552): Cannot find name 'map'. Did you mean 'Map'?
          .map(({ chat, user, messages, unreadCount, maxDate }, idx) => {
            const lastMessageDateDisplayed =
              moment().diff(maxDate, 'days') > 1 ? maxDate.format('D MMM.') : maxDate.fromNow(true);
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            return (<div key={idx} className={classNames('p-3 cursor-pointer d-flex flex-row', {
        // @ts-expect-error TS(2304): Cannot find name 'selectedChat'.
        'messages-sender__active': selectedChat === chat,
    // @ts-expect-error TS(2304): Cannot find name 'setSelectedChat'.
    })} onClick={() => setSelectedChat(chat)}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="col-4">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <img className="user-avatar" src={(user as any).picture} alt="user-avatar" style={{ width: '100%' }}/>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  {unreadCount > 0 && <span className="notification">{unreadCount}</span>}
                </div>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="col-8">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="d-flex justify-content-between">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <BeautifulTitle title={(user as any).name} className="message__user--name">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <h4 className="message__user--name">{(user as any).name}</h4>
                    </BeautifulTitle>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <a className="delete-link cursor-pointer" onClick={(e) => {
        e.stopPropagation();
        // @ts-expect-error TS(2304): Cannot find name 'closeSelectedChat'.
        closeSelectedChat(chat);
    }}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="fas fa-trash"/>
                    </a>
                  </div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="d-flex justify-content-end">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <div>{lastMessageDateDisplayed}</div>
                  </div>
                </div>
              </div>);
          })}
      // @ts-expect-error TS(2304): Cannot find name 'div'.
      </div>
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div className="col-12 col-sm-9">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex d-sm-none justify-content-end">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-sm btn-access-negative ">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ChevronLeft />
          </button>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="p-3 d-flex justify-content-around align-items-center messages-sender__active">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <img
            className="user-avatar"
            src="https://www.gravatar.com/avatar/53fc466c35867413e3b4c906ebf370cb?size=128&amp;d=robohash"
            alt="user-avatar"
          />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h4 className="message__user--name">A remplir avec le bon user</h4>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex flex-column-reverse ms-2 messages-content">
          {/* @ts-expect-error TS(2304): Cannot find name 'dialog'. */}
          {dialog.reverse().map((group: any, idx: any) => {
            return (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div
                key={`discussion-messages-${idx}`}
                className={classNames('discussion-messages', {
                  // @ts-expect-error TS(2304): Cannot find name 'selectedChat'.
                  'discussion-messages--received': group.every((m: any) => m.sender === selectedChat),
                  // @ts-expect-error TS(2304): Cannot find name 'selectedChat'.
                  'discussion-messages--send': group.every((m: any) => m.sender !== selectedChat),
                })}
              >
                {group.map((m: any, idx: any) => {
                  // @ts-expect-error TS(2304): Cannot find name 'users'.
                  const sender = Option(users.find((u) => (u as any)._id === m.sender))
    .map((u: any) => u.name)
    // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
    .getOrElse(translateMethod('Unknown user'));
                  return (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <div
                      key={`discussion-message-${idx}`}
                      className="discussion-message d-flex flex-column"
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span className="sender">{sender}</span>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span className="message">{m.message}</span>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span className="info">
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span className="date">{formatMessageDate(m.date)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {/* @ts-expect-error TS(2304): Cannot find name 'selectedChat'. */}
          {selectedChat && lastClosedDates.find((x: any) => x.chat === selectedChat).date && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div className="d-flex flex-row justify-content-center my-1">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button
                className="btn btn-sm btn-outline-primary"
                // @ts-expect-error TS(2322): Type 'string | null' is not assignable to type 'bo... Remove this comment to see the full error message
                disabled={loading ? 'disabled' : null}
                // @ts-expect-error TS(2304): Cannot find name 'getPreviousMessages'.
                onClick={() => getPreviousMessages(selectedChat)}
              >
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="Load previous messages">Load previous messages</Translation>
              </button>
            </div>
          )}
          {/* @ts-expect-error TS(2304): Cannot find name 'selectedChat'. */}
          {selectedChat && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div className="discussion-form discussion-form__message">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <input
                // @ts-expect-error TS(2322): Type 'string | null' is not assignable to type 'bo... Remove this comment to see the full error message
                disabled={loading ? 'disabled' : null}
                type="text"
                // @ts-expect-error TS(2304): Cannot find name 'loading'.
                value={loading ? '...' : newMessage}
                // @ts-expect-error TS(2304): Cannot find name 'handleKeyDown'.
                onKeyDown={handleKeyDown}
                // @ts-expect-error TS(2304): Cannot find name 'setNewMessage'.
                onChange={(e) => setNewMessage(e.target.value)}
                // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
                placeholder={translateMethod('Your message')}
              />
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button
                // @ts-expect-error TS(2322): Type 'string | null' is not assignable to type 'bo... Remove this comment to see the full error message
                disabled={loading ? 'disabled' : null}
                className="send-button"
                // @ts-expect-error TS(2304): Cannot find name 'sendMessage'.
                onClick={sendMessage}
              >
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Send />
              </button>
            </div>
          )}
        </div>
      </div>
    // @ts-expect-error TS(2304): Cannot find name 'div'.
    </div>
  );
};
