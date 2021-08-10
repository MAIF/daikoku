import React from 'react';
import { t } from '../../../locales';

export const LoginOrRegisterModal = (props) => {
  const loginProvider = props.tenant.authProvider;
  const { asFlatFormat } = props;

  return asFlatFormat ? (
    <div className="mx-auto" style={{ maxWidth: '448px', color: '#000' }}>
      <p className="font-weight-bold text-center">{props.message}</p>
      <div className="m-2 d-flex align-items-center justify-content-center login-button">
        <a href={`/auth/${loginProvider}/login`} className="btn btn-outline-success mx-1">
          {t('Login', props.currentLanguage)}
        </a>
        <a
          href={`${loginProvider === 'Local' ? '/signup' : `/auth/${loginProvider}/login`}`}
          className="btn btn-success register-button">
          {t('Register', props.currentLanguage)}
        </a>
      </div>
    </div>
  ) : (
    <div className="modal-content mx-auto" style={{ maxWidth: '448px' }}>
      {!props.showOnlyMessage && (
        <div className="modal-header">
          <h5 className="modal-title">{t('consume.apikey', props.currentLanguage)}</h5>
          <button type="button" className="close" aria-label="Close" onClick={props.closeModal}>
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}
      <div className="modal-body">
        <div className="modal-description">
          {props.showOnlyMessage
            ? props.message
            : t('get.apikey.requires.login', props.currentLanguage)}
        </div>
      </div>
      <div
        className="p-2 d-flex align-items-center justify-content-end login-button"
        style={{ borderTop: '1px solid #dee2e6' }}>
        <a href={`/auth/${loginProvider}/login`} className="btn btn-outline-success mx-1">
          {t('Login', props.currentLanguage)}
        </a>
        <a
          href={`${loginProvider === 'Local' ? '/signup' : `/auth/${loginProvider}/login`}`}
          className="btn btn-success register-button">
          {t('Register', props.currentLanguage)}
        </a>
      </div>
    </div>
  );
};
