import { useContext } from 'react';

import { I18nContext } from '../../contexts';
import { IBaseModalProps, ILoginOrRegisterModalProps } from './types';
import { useLocation } from 'react-router-dom';


export const LoginOrRegisterModal = (props: ILoginOrRegisterModalProps & IBaseModalProps) => {
  const loginProvider = props.tenant.authProvider;

  const { translate } = useContext(I18nContext);
  const location = useLocation();


  return (
    <div className="modal-content mx-auto" style={{ maxWidth: '448px' }} aria-labelledby='modal-title' aria-describedby='modal-description'>
      {!props.showOnlyMessage && (
        <div className="modal-header">
          <h5 className="modal-title" id="modal-title">{props.title ?? translate('consume.apikey')}</h5>
          <button
            type="button"
            className="btn-close"
            aria-label={translate("Close")}
            onClick={props.close}
          />
        </div>
      )}
      <div className="modal-body">
        <div className="modal-description" id="modal-description">
          {props.message ?? translate('get.apikey.requires.login')}
        </div>
      </div>
      <div
        className="p-2 d-flex align-items-center justify-content-end"
        style={{ borderTop: '1px solid #dee2e6' }}
      >
        <a
          href={`/auth/${loginProvider}/login?redirect=${location.pathname}`}
          className="btn btn-outline-success mx-1 login-button"
        >
          {translate('Login')}
        </a>
        {loginProvider === 'Local' && <a
          href={`/signup?redirect=${location.pathname}`}
          className="btn btn-outline-success register-button"
        >
          {translate('Register')}
        </a>}
      </div>
    </div>
  );
};
