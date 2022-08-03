import React, { useContext, useEffect } from 'react';
// @ts-expect-error TS(6142): Module '../../../locales/i18n-context' was resolve... Remove this comment to see the full error message
import { I18nContext } from '../../../locales/i18n-context';

export const SessionModal = ({
  session
}: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    const sessionExpires = translateMethod('session.expire.info');
    const extendMySession = translateMethod('session.extend');

    if (session) {
      let reloadTimeout: any = null;

      const extendSession = (close: any) => {
        return fetch('/api/session/_renew', {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: '',
        })
          .then((r) => r.json())
          .then((sess) => {
            clearTimeout(reloadTimeout);
            setupTimeouts(sess);
            close();
          });
      };

      const setupTimeouts = (_session: any) => {
        const firstPing = _session.expires - Date.now() - 2 * 60 * 1000;
        const secondPing = _session.expires - Date.now() + 2000;
        setTimeout(() => {
          window.alert(
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            (close: any) => <div style={{ width: '100%' }}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <p>{sessionExpires}</p>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div
                style={{
                  width: '100%',
                  // @ts-expect-error TS(2322): Type '{ width: string; disllay: string; justifyCon... Remove this comment to see the full error message
                  disllay: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => extendSession(close)}
                >
                  {extendMySession}
                </button>
              </div>
            </div>,
            // @ts-expect-error TS(2554): Expected 0-1 arguments, but got 2.
            'Your session is expiring'
          );
        }, firstPing);
        reloadTimeout = setTimeout(() => {
          // @ts-expect-error TS(2322): Type 'string' is not assignable to type '(string |... Remove this comment to see the full error message
          window.location = '/';
        }, secondPing);
      };
      setupTimeouts(session);
    }
  }, []);

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <></>;
};
