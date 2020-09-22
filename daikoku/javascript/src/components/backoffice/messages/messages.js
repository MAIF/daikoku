import React, { useState, useEffect } from 'react';
import faker from 'faker';
import classNames from 'classnames';
import { Link } from 'react-router-dom';

import { t } from '../../../locales';
import * as MessageEvents from '../../../services/messages';
import * as Services from '../../../services';

export const MessagesTopBarTools = (props) => {

  const [opened, setOpened] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);

  const sseId = faker.random.alphaNumeric(64);

  useEffect(() => {
    Services.countUnreadMessages()
      .then(({count}) => setTotalUnread(count));
  }, []);

  useEffect(() => {
    MessageEvents.addCallback((m) => handleEvent(m), sseId);

    return () => {
      MessageEvents.removeCallback(sseId);
    };
  }, [totalUnread]);

  const handleEvent = (message) => {
    //todo: use context or something like...be smart
    if (message) {
      if (message.readBy.includes(props.connectedUser._id)) {
        setTotalUnread(0);
      } else {
        setTotalUnread(totalUnread + 1);
      }
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <Link
        to="/settings/messages"
        className={classNames('notification-link cursor-pointer', {
          'unread-messages': totalUnread > 0
        })}
        onClick={() => setOpened(!opened)}
        title={t('Access to the messages', props.currentLanguage)}>
        <i className="fas fa-comment-alt" />
      </Link>
    </div>
  );
};