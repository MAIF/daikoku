import React, { useContext } from 'react';
import { I18nContext } from '../../../core';

export const LoginOrRegisterModal = (props: any) => {
  const loginProvider = props.tenant.authProvider;
  const { asFlatFormat } = props;

    const { translateMethod } = useContext(I18nContext);

  return asFlatFormat ? (
        <div className="mx-auto" style={{ maxWidth: '448px', color: '#000' }}>
            <p className="font-weight-bold text-center">{props.message}</p>
            <div className="m-2 d-flex align-items-center justify-content-center">
                <a
          href={`/auth/${loginProvider}/login`}
          className="btn btn-outline-success mx-1 login-button"
        >
          {translateMethod('Login')}
        </a>
                <a
          href={`${loginProvider === 'Local' ? '/signup' : `/auth/${loginProvider}/login`}`}
          className="btn btn-success register-button"
        >
          {translateMethod('Register')}
        </a>
      </div>
    </div>
  ) : (
        <div className="modal-content mx-auto" style={{ maxWidth: '448px' }}>
      {!props.showOnlyMessage && (
                <div className="modal-header">
                    <h5 className="modal-title">{translateMethod('consume.apikey')}</h5>
                    <button
            type="button"
            className="btn-close"
            aria-label="Close"
            onClick={props.closeModal}
          />
        </div>
      )}
            <div className="modal-body">
                <div className="modal-description">
          {props.showOnlyMessage ? props.message : translateMethod('get.apikey.requires.login')}
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
          {translateMethod('Login')}
        </a>
                <a
          href={`${loginProvider === 'Local' ? '/signup' : `/auth/${loginProvider}/login`}`}
          className="btn btn-success register-button"
        >
          {translateMethod('Register')}
        </a>
      </div>
    </div>
  );
};
