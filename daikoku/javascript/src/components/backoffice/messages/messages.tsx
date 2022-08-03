import React, { useState, useContext } from 'react';
import classNames from 'classnames';
import { Link } from 'react-router-dom';

import { MessagesContext } from '../../backoffice';
// @ts-expect-error TS(6142): Module '../../../locales/i18n-context' was resolve... Remove this comment to see the full error message
import { I18nContext } from '../../../locales/i18n-context';

export const MessagesTopBarTools = (_: any) => {
  // @ts-expect-error TS(2339): Property 'totalUnread' does not exist on type 'unk... Remove this comment to see the full error message
  const { totalUnread } = useContext(MessagesContext);

  const [opened, setOpened] = useState(false);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div style={{ position: 'relative' }}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Link
        to="/settings/messages"
        className={classNames('messages-link cursor-pointer', {
          'unread-messages': totalUnread > 0,
        })}
        onClick={() => setOpened(!opened)}
        title={translateMethod('Access to the messages')}
      >
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <i className="fas fa-comment-alt" />
      </Link>
    </div>
  );
};
