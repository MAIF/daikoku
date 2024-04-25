import React, { useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ISession, ISimpleSession } from '../../types';
import { I18nContext } from '../i18n-context';
import { ModalContext } from '../modalContext';

export const SessionModal = (props: {session: ISimpleSession}) => {
  const { translate } = useContext(I18nContext);
  const { alert } = useContext(ModalContext);
  const navigate = useNavigate();

  useEffect(() => {
    const sessionExpires = translate('session.expire.info');
    const extendMySession = translate('session.extend');

    if (props.session) {
      let reloadTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

      const extendSession = (close: () => void) => {
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

      const setupTimeouts = (_session: ISimpleSession) => {
        const firstPing = _session.expires - Date.now() - 2 * 60 * 1000;
        const secondPing = _session.expires - Date.now() + 2000;
        setTimeout(() => {
          alert({
            message: (close: () => void) => <div style={{ width: '100%' }}>
              <p>{sessionExpires}</p>
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline-success"
                  onClick={() => extendSession(close)}
                >
                  {extendMySession}
                </button>
              </div>
            </div>,
            title: translate('modal.session.expire.title')
          });
        }, firstPing);
        reloadTimeout = setTimeout(() => { navigate('/') }, secondPing);
      };
      setupTimeouts(props.session);
    }
  }, []);

  return <></>;
};
