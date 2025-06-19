import React, { useContext, useState } from 'react';
import { Form, type, constraints, format } from '@maif/react-forms';

import * as Services from '../../../../services';
import { I18nContext } from '../../../../contexts/i18n-context';
import { GlobalContext } from '../../../../contexts/globalContext';
import { Link } from 'react-router-dom';
import { loginWithPasskey } from '../../authentication';

export const GuestPanel = () => {
  const { translate, Translation } = useContext(I18nContext);
  const { loginAction, tenant } = useContext(GlobalContext);

  const [loginError, setLoginError] = useState(false);

  const schema = {
    username: {
      type: type.string,
      label: translate('login.label'),
      placeholder: translate('login.placeholder'),
      format: format.email,
      props: {
        autocomplete: 'username webauthn',
        autofocus: 'autofocus',
      },
      constraints: [
        constraints.required(translate('constraints.required.email')),
        constraints.email(translate('constraints.matches.email')),
      ],
    },
    password: {
      type: type.string,
      label: translate('password.label'),
      placeholder: translate('password.label'),
      format: format.password,
      constraints: [constraints.required(translate('constraints.required.password'))],
    },
  };

  const submit = (data: { username: string, password: string }) => {
    setLoginError(false);

    const { username, password } = data;


    Services.login(username, password, loginAction)
      .then((res) => {
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
          {tenant.loginProvider === 'Local' && (
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
                    <div className="d-flex mt-3">
                      <button
                        type="submit"
                        className="btn btn-outline-success flex-grow-1"
                        onClick={valid}
                      >
                        <span>{translate('Login')}</span>
                      </button>
                    </div>
                  );
                }}
              />
              <div className="login-divider">OR</div>
              <button className="btn btn-outline-success" onClick={() => loginWithPasskey()}>use passkey</button>
              <div className="d-flex flex-row justify-content-between mt-3">
                {tenant.loginProvider == 'Local' && (
                  <Link className="text-center" to="/signup">
                    <Translation i18nkey="create.account.link.label" />
                  </Link>
                )}
                <Link className="text-center" to="/reset">
                  <Translation i18nkey="Forgot your password ?">Forgot your password ?</Translation>
                </Link>
              </div>
            </div>
          )}
          {tenant.loginProvider !== 'Local' && (
            <div className="ms-2 block__entries d-flex flex-column">
              <a href={`/auth/${tenant.loginProvider}/login`} className="block__entry__link">
                {translate('Login')}
              </a>
              <a
                href={`${tenant.loginProvider === 'Local' ? '/signup' : `/auth/${tenant.loginProvider}/login`}`}
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
