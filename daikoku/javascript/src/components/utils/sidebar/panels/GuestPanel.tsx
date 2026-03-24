import { constraints, Form, format, type } from '@maif/react-forms';
import { useContext, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { GlobalContext } from '../../../../contexts/globalContext';
import { I18nContext } from '../../../../contexts/i18n-context';
import * as Services from '../../../../services';

export const GuestPanel = () => {
  const { translate, Translation } = useContext(I18nContext);
  const { loginAction, tenant } = useContext(GlobalContext);

  const buttonRef = useRef<HTMLButtonElement>(null)

  const [loginError, setLoginError] = useState(false);
  const [loading, setLoading] = useState(false);

  const location = useLocation()

  const schema = {
    username: {
      type: type.string,
      label: translate('login.label'),
      placeholder: translate('login.placeholder'),
      format: format.email,
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
    
    setLoading(true)
    setLoginError(false);

    const { username, password } = data;


    Services.login(username, password, loginAction)
      .then((res) => {
        if (res.status === 400) {
          setLoginError(true);
          setLoading(false)
          buttonRef.current?.classList.add('active', 'btn-outline-danger')
          setTimeout(() => {
            buttonRef.current?.classList.remove('active', 'btn-outline-danger');
          }, 800);
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
                    <div className="d-flex justify-content-end mt-3">
                      <button
                        type="submit"
                        ref={buttonRef}
                        className="btn btn-outline-success ms-2 shake"
                        disabled={loading}
                        onClick={valid}
                      >
                        <span>{translate('Login')}</span>
                      </button>
                    </div>
                  );
                }}
              />
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
              <a href={`/auth/${tenant.loginProvider}/login?redirect=${location.pathname}`} className="block__entry__link">
                {translate('Login')}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
