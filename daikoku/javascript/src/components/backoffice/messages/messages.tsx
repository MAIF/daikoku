import React, { useState, useContext } from 'react';
import classNames from 'classnames';
import { Link } from 'react-router-dom';

import { MessagesContext } from '../../backoffice';
import { I18nContext } from '../../../contexts/i18n-context';
import {MessageSquare} from "lucide-react";

export const MessagesTopBarTools = (_: any) => {
    const { totalUnread } = useContext(MessagesContext);

  const [opened, setOpened] = useState(false);

    const { translate } = useContext(I18nContext);

  return (
        <div style={{ position: 'relative' }}>
            <Link
        to="/settings/messages"
        className={classNames('messages-link cursor-pointer', {
          'unread-messages': totalUnread > 0,
        })}
        onClick={() => setOpened(!opened)}
        title={translate('Access to the messages')}
      >
      <MessageSquare />
      </Link>
    </div>
  );
};
