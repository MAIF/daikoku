import { useContext } from 'react';

import { I18nContext } from '../../contexts';
import { IBaseModalProps, ILoginOrRegisterModalProps } from './types';


export const LoginOrRegisterModal = (props: ILoginOrRegisterModalProps & IBaseModalProps) => {
  const loginProvider = props.tenant.authProvider;

  const { translate } = useContext(I18nContext);

  return (
    <div className="modal-content mx-auto" style={{ maxWidth: '448px' }}>
      {!props.showOnlyMessage && (
        <div className="modal-header">
          <h5 className="modal-title">{props.title ?? translate('consume.apikey')}</h5>
          <button
            type="button"
            className="btn-close"
            aria-label="Close"
            onClick={props.close}
          />
        </div>
      )}
      <div className="modal-body">
        <div className="modal-description">
          {props.message ?? translate('get.apikey.requires.login')}
        </div>
      </div>
      <div
        className="p-2 d-flex align-items-center justify-content-end"
        style={{ borderTop: '1px solid #dee2e6' }}
      >
        <a
          href={`/auth/${loginProvider}/login`}
          className="btn btn-outline-success mx-1 login-button"
        >
          {translate('Login')}
        </a>
        <a
          href={`${loginProvider === 'Local' ? '/signup' : `/auth/${loginProvider}/login`}`}
          className="btn btn-outline-success register-button"
        >
          {translate('Register')}
        </a>
      </div>
    </div>
  );
};
