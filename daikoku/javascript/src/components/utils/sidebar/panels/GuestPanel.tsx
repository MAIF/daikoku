import React, { useContext, useState } from 'react';
import { Form, type, constraints, format } from '@maif/react-forms';

import * as Services from '../../../../services';
import { I18nContext } from '../../../../contexts/i18n-context';
import { NavContext } from '../../../../contexts';

export const GuestPanel = () => {
  const { translate, Translation } = useContext(I18nContext);
  const { loginAction, loginProvider } = useContext(NavContext);

  const [loginError, setLoginError] = useState(false);

  const schema = {
    username: {
      type: type.string,
      label: translate('Email address'),
      placeholder: translate('Email address'),
      format: format.email,
      constraints: [
        constraints.required(translate('constraints.required.email')),
        constraints.email(translate('constraints.matches.email')),
      ],
    },
    password: {
      type: type.string,
      label: translate('Password'),
      format: format.password,
      constraints: [constraints.required(translate('constraints.required.password'))],
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
    <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
      <div className="mb-3" style={{ height: '40px' }}></div>
      <div className="blocks">
        <div className="mb-3 block">
          {loginProvider === 'Local' && (
            <div className="ms-2 block__entries d-flex flex-column">
              {loginError && (
                <span className="badge bg-danger">
                  {translate('incorrect.email.or.password')}
                </span>
              )}
              <Form
                schema={schema}
                onSubmit={submit}
                footer={({ valid }) => {
                  return (
                    <div className="d-flex justify-content-end mt-3">
                      <button
                        type="submit"
                        className="btn btn-outline-success ms-2"
                        onClick={valid}
                      >
                        <span>{translate('Login')}</span>
                      </button>
                    </div>
                  );
                }}
              />
              <div className="d-flex flex-row mt-3">
                {loginProvider == 'Local' && (
                  <a className="text-center" href="/signup">
                    {' '}Create an account.
                  </a>
                )}
                <a className="text-center" href="/reset">
                  <Translation i18nkey="Forgot your password ?">Forgot your password ?</Translation>
                </a>
              </div>
            </div>
          )}
          {loginProvider !== 'Local' && (
            <div className="ms-2 block__entries d-flex flex-column">
              <a href={`/auth/${loginProvider}/login`} className="block__entry__link">
                {translate('Login')}
              </a>
              <a
                href={`${loginProvider === 'Local' ? '/signup' : `/auth/${loginProvider}/login`}`}
                className="block__entry__link"
              >
                {translate('Register')}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
