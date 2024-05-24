import React, { FormEvent, useContext, useEffect, useState } from 'react';
import * as Services from '../../services/index';
import { I18nContext } from '../../contexts';
import { useParams, useSearchParams } from 'react-router-dom';
import { GlobalContext } from '../../contexts/globalContext';
import { isError } from '../../types';

export function LoginPage(props: {}) {
  const { Translation, translate } = useContext(I18nContext);
  const { tenant } = useContext(GlobalContext);

  const { provider } = useParams()
  const [searchParams] = useSearchParams();

  const [state, setState] = useState<any>({
    username: '',
    password: '',
    message: null,
    loginError: null,
  });

  const [action, setAction] = useState<string>();

  const onChange = (e) => {
    setState({
      ...state,
      [e.target.name]: e.target.value,
      loginError: null,
    });
  };

  useEffect(() => {
    Services.getAuthContext(provider!)
      .then(context => {
        if (!isError(context)) {
          setAction(context.action)
        }
      })
  }, [])


  const submit = (e: FormEvent<HTMLElement>) => {
    e.preventDefault();
    const { username, password } = state;

    if (action)
      Services.login(username, password, action, searchParams.get('redirect'))
        .then((res) => {
          if (res.status === 400)
            setState({
              ...state,
              loginError: true,
            });
          else if (res.redirected) window.location.href = res.url;
        });
  };

  const { loginError } = state;

  return (
    <div>
      <div className="login__container text-center">
        <div className="organisation__header d-flex align-items-center">
          <div className="col-sm-4">
            <img
              className="organisation__avatar"
              src={tenant.logo || '/assets/images/daikoku.svg'}
              alt="avatar"
            />
          </div>
          <h3>
            <Translation i18nkey="login.to.tenant" replacements={[tenant.name]}>
              Login to {tenant.name}
            </Translation>
          </h3>
        </div>

        <form
          className="form-horizontal text-start mx-auto"
          method="POST"
          onSubmit={e => submit(e)}
          style={{ maxWidth: '448px' }}
        >
          {/* <input type="hidden" name="token" className="form-control" value={props.token} /> */}
          {loginError && (
            <span className="alert alert-danger d-flex justify-content-center">
              <Translation i18nkey="login.failed">
                User not found or invalid credentials
              </Translation>
            </span>
          )}
          <div className="mb-3">
            <label className="control-label mb-2">
              <Translation i18nkey="login.label">Email address</Translation>
            </label>
            <input
              type="text"
              name="username"
              className="form-control"
              value={state.username}
              onChange={onChange}
            />
          </div>
          <div className="mb-3">
            <label className="control-label mb-2">
              <Translation i18nkey="password.label">Password</Translation>
            </label>
            <input
              type="password"
              name="password"
              className="form-control"
              value={state.password}
              onChange={onChange}
            />
          </div>
          <div className="mb-3 d-grid gap-1">
            <button type="submit" className="btn btn-outline-success">
              <Translation i18nkey="login.btn.label">Login</Translation>
            </button>
          </div>
          {provider == 'Local' && (
            <div
              className="mb-3 p-3 text-center"
              style={{
                border: '1px solid var(--form-border-color, #586069)',
                borderRadius: '6px',
              }}
            >
              <Translation
                i18nkey="login_page.register_message"
                replacements={[tenant.name]}
              />
              <a href="/signup">Create an account.</a>
            </div>
          )}
          <div className="mb-3">
            <a href="/reset">
              <Translation i18nkey="Forgot your password ?">Forgot your password ?</Translation>
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
