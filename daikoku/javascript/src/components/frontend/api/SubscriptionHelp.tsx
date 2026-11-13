import { type ReactNode, useContext, useId } from 'react';
import { Tooltip } from 'react-tooltip';
import { I18nContext } from '../../../contexts';
import { type SubscriptionHelp as SubscriptionHelpContent } from './subscriptionHelpReasons';

export function SubscriptionHelp({
  help,
  children,
}: {
  help: SubscriptionHelpContent;
  children: ReactNode;
}) {
  const { translate } = useContext(I18nContext);
  const contentId = useId();

  if (!help.blockers.length) return <>{children}</>;

  return (
    <>
      <Tooltip
        id={contentId}
        className="bf-tooltip"
        place="bottom-end"
        positionStrategy="fixed"
        portalRoot={document.body}
        openEvents={{ mouseenter: true }}
        closeEvents={{ mouseleave: true }}
        clickable
      >
        <div
          style={{
            maxWidth: 'min(420px, calc(100vw - 48px))',
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          <strong>{translate('subscription.help.blockers')}</strong>
          <ul className="mb-2 ps-3">
            {help.blockers.map((item) => (
              <li key={item.reason} className="mb-2">
                {translate(`subscription.help.reason.${item.reason}`)}
              </li>
            ))}
          </ul>
        </div>
      </Tooltip>
      <span className="d-inline-flex" data-tooltip-id={contentId}>
        {children}
      </span>
    </>
  );
}
