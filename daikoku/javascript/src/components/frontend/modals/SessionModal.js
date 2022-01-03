import React, { useContext, useEffect } from 'react';
import { I18nContext } from '../../../locales/i18n-context';

export const SessionModal = ({ session }) => {
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    const sessionExpires = translateMethod('session.expire.info');
    const extendMySession = translateMethod('session.extend');

    if (session) {
      let reloadTimeout = null;

      const extendSession = (close) => {
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

      const setupTimeouts = (_session) => {
        const firstPing = _session.expires - Date.now() - 2 * 60 * 1000;
        const secondPing = _session.expires - Date.now() + 2000;
        setTimeout(() => {
          window.alert(
            (close) => (
              <div style={{ width: '100%' }}>
                <p>{sessionExpires}</p>
                <div
                  style={{
                    width: '100%',
                    disllay: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => extendSession(close)}
                  >
                    {extendMySession}
                  </button>
                </div>
              </div>
            ),
            'Your session is expiring'
          );
        }, firstPing);
        reloadTimeout = setTimeout(() => {
          window.location = '/';
        }, secondPing);
      };
      setupTimeouts(session);
    }
  }, []);

  return <></>;
};
