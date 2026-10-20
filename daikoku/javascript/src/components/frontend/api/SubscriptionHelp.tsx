import { Info } from 'lucide-react';
import { useContext, useId, useState } from 'react';
import { Tooltip } from 'react-tooltip';
import { I18nContext } from '../../../contexts';
import {
  getVisibleSubscriptionBlockers,
  type SubscriptionHelp as SubscriptionHelpContent,
} from './subscriptionHelpReasons';

export function SubscriptionHelp({ help }: { help: SubscriptionHelpContent }) {
  const { translate } = useContext(I18nContext);
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const sections = {
    blockers: getVisibleSubscriptionBlockers(help),
    warnings: help.warnings,
  };

  if (!sections.blockers.length && !sections.warnings.length) return null;

  return (
    <>
      <Tooltip
        id={contentId}
        className="bf-tooltip"
        place="bottom-end"
        positionStrategy="fixed"
        portalRoot={document.body}
        isOpen={open}
        setIsOpen={setOpen}
        openEvents={{ mouseenter: true, click: true }}
        closeEvents={{ mouseleave: true, blur: true }}
        globalCloseEvents={{ clickOutsideAnchor: true }}
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
      <button
        type="button"
        className="btn --tertiary --small --icon-only"
        aria-label={translate('subscription.help.label')}
        aria-expanded={open}
        data-tooltip-id={contentId}
        aria-controls={open ? contentId : undefined}
        aria-describedby={open ? contentId : undefined}
      >
        <Info size={16} aria-hidden="true" />
      </button>
    </>
  );
}
