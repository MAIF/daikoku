import React, { useState, useContext } from 'react';
import classNames from 'classnames';
import { Link } from 'react-router-dom';

import { t } from '../../../locales';
import {MessagesContext} from '../../backoffice';

export const MessagesTopBarTools = (props) => {
  const { totalUnread } = useContext(MessagesContext);

  const [opened, setOpened] = useState(false);

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