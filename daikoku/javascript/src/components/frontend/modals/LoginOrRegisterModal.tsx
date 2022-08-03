import React, { useContext } from 'react';
import { I18nContext } from '../../../core';

export const LoginOrRegisterModal = (props: any) => {
  const loginProvider = props.tenant.authProvider;
  const { asFlatFormat } = props;

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  return asFlatFormat ? (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mx-auto" style={{ maxWidth: '448px', color: '#000' }}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <p className="font-weight-bold text-center">{props.message}</p>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="m-2 d-flex align-items-center justify-content-center">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <a
          href={`/auth/${loginProvider}/login`}
          className="btn btn-outline-success mx-1 login-button"
        >
          {translateMethod('Login')}
        </a>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <a
          href={`${loginProvider === 'Local' ? '/signup' : `/auth/${loginProvider}/login`}`}
          className="btn btn-success register-button"
        >
          {translateMethod('Register')}
        </a>
      </div>
    </div>
  ) : (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="modal-content mx-auto" style={{ maxWidth: '448px' }}>
      {!props.showOnlyMessage && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="modal-header">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h5 className="modal-title">{translateMethod('consume.apikey')}</h5>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button
            type="button"
            className="btn-close"
            aria-label="Close"
            onClick={props.closeModal}
          />
        </div>
      )}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-body">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="modal-description">
          {props.showOnlyMessage ? props.message : translateMethod('get.apikey.requires.login')}
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div
        className="p-2 d-flex align-items-center justify-content-end"
        style={{ borderTop: '1px solid #dee2e6' }}
      >
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <a
          href={`/auth/${loginProvider}/login`}
          className="btn btn-outline-success mx-1 login-button"
        >
          {translateMethod('Login')}
        </a>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
