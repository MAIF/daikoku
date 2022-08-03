import React, { useContext, useState } from 'react';
import { Form, type, constraints, format } from '@maif/react-forms';

import * as Services from '../../../../services';
// @ts-expect-error TS(6142): Module '../../../../locales/i18n-context' was reso... Remove this comment to see the full error message
import { I18nContext } from '../../../../locales/i18n-context';
import { NavContext } from '../../../../contexts';

export const GuestPanel = () => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);
  // @ts-expect-error TS(2339): Property 'loginAction' does not exist on type 'unk... Remove this comment to see the full error message
  const { loginAction, loginProvider } = useContext(NavContext);

  const [loginError, setLoginError] = useState(false);

  const schema = {
    username: {
      type: type.string,
      label: translateMethod('Email address'),
      placeholder: translateMethod('Email address'),
      format: format.email,
      constraints: [
        constraints.required(translateMethod('constraints.required.email')),
        constraints.email(translateMethod('constraints.matches.email')),
      ],
    },
    password: {
      type: type.string,
      label: translateMethod('Password'),
      format: format.password,
      constraints: [constraints.required(translateMethod('constraints.required.password'))],
    },
  };

  const submit = (data: any) => {
    setLoginError(false);

    const { username, password } = data;

    Services.login(username, password, loginAction).then((res) => {
      if (res.status === 400) {
        setLoginError(true);
      } else if (res.redirected) {
        window.location.href = res.url;
      }
    });
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="mb-3" style={{ height: '40px' }}></div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="blocks">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="mb-3 block">
          {loginProvider === 'Local' && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div className="ms-2 block__entries d-flex flex-column">
              {loginError && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <span className="badge bg-danger">
                  {translateMethod('incorrect.email.or.password')}
                </span>
              )}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Form
                schema={schema}
                onSubmit={submit}
                footer={({ valid }) => {
                  return (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <div className="d-flex justify-content-end mt-3">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <button
                        type="submit"
                        className="btn btn-outline-success ms-2"
                        onClick={valid}
                      >
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span>{translateMethod('Login')}</span>
                      </button>
                    </div>
                  );
                }}
              />
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="d-flex flex-row mt-3">
                {loginProvider == 'Local' && (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <a className="text-center" href="/signup">
                    {' '}Create an account.
                  </a>
                )}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <a className="text-center" href="/reset">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="Forgot your password ?">Forgot your password ?</Translation>
                </a>
              </div>
            </div>
          )}
          {loginProvider !== 'Local' && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div className="ms-2 block__entries d-flex flex-column">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <a href={`/auth/${loginProvider}/login`} className="block__entry__link">
                {translateMethod('Login')}
              </a>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <a
                href={`${loginProvider === 'Local' ? '/signup' : `/auth/${loginProvider}/login`}`}
                className="block__entry__link"
              >
                {translateMethod('Register')}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
