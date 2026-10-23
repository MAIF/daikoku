import { type ReactNode, useContext, useId } from 'react';
import { Tooltip } from 'react-tooltip';
import { I18nContext } from '../../../contexts';
import {
  getVisibleSubscriptionBlockers,
  type SubscriptionHelp as SubscriptionHelpContent,
} from './subscriptionHelpReasons';

export function SubscriptionHelp({
  help,
  children,
}: {
  help: SubscriptionHelpContent;
  children: ReactNode;
}) {
  const { translate } = useContext(I18nContext);
  const contentId = useId();
  const sections = {
    blockers: getVisibleSubscriptionBlockers(help),
    warnings: help.warnings,
  };

  if (!sections.blockers.length && !sections.warnings.length) return <>{children}</>;

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
          {(['blockers', 'warnings'] as const).map(
            (section) =>
              sections[section].length > 0 && (
                <section key={section}>
                  <strong>{translate(`subscription.help.${section}`)}</strong>
                  <ul className="mb-2 ps-3">
                    {sections[section].map((item) => (
                      <li key={item.reason} className="mb-2">
                        {translate(`subscription.help.reason.${item.reason}`)}
                        {item.teams.length > 0 && (
                          <div>
                            {translate({
                              key: 'subscription.help.teams',
                              replacements: [item.teams.join(', ')],
                            })}
                          </div>
                        )}
                        {item.details.length > 0 && <div>{item.details.join(', ')}</div>}
                      </li>
                    ))}
                  </ul>
                </section>
              )
          )}
        </div>
      </Tooltip>
      <span className="d-inline-flex" data-tooltip-id={contentId}>
        {children}
      </span>
    </>
  );
}
