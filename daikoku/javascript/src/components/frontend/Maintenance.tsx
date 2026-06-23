import { type SubmitEvent, useContext, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { I18nContext } from "../../contexts";
import * as Services from '../../services/index';
import { AuthProvider } from "../../types";


export const MaintenancePage = ({ provider }: { provider: AuthProvider }) => {
  const { Translation } = useContext(I18nContext);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [searchParams] = useSearchParams();

  const [state, setState] = useState<any>({
    username: "",
    password: "",
    message: null,
    loginError: null,
  });

  const [toggleLogin, setToggleLogin] = useState(false);
  const [loading, setLoading] = useState(false);

  const onChange = (e) => {
    setState({
      ...state,
      [e.target.name]: e.target.value,
      loginError: null,
    });
  };

  const submit = (e: SubmitEvent<HTMLElement>) => {
    setLoading(true);

    e.preventDefault();

    const { username, password } = state;
    const action = `/auth/${toggleLogin ? "Local" : provider}/callback`;
    Services.login(username, password, action, searchParams.get('redirect'))
      .then((res) => {
        if (res.status === 400) {
          setState({
            ...state,
            loginError: true,
          });
          setLoading(false);
          buttonRef.current?.classList.add('active', 'btn-outline-danger')
          setTimeout(() => {
            buttonRef.current?.classList.remove('active', 'btn-outline-danger');
          }, 800);
        }
        else if (res.redirected) {
          window.location.href = res.url;
        }
      });
  };

  const { loginError } = state;
  return (
    <div style={{ height: '100vh' }} className=" justify-content-center d-flex align-items-center flex-column">
      <div style={{ height: '400px', width: '448px' }} >
        <h1>Daikoku est en maintenance</h1>
        <p>Vous ne pouvez vous connecter uniquement si vous êtes administrateur</p>
        {provider === 'Otoroshi' || provider === 'OAuth2' && (
          <div className={"flex-column d-flex"} >
            <button
              type="button"
              className="btn btn-outline-primary shake gap-1 mb-2 "
              onClick={() => {
                location.href = `/auth/${provider}/login`
              }
              }>
              Connexion openId
            </button>
            <button
              type="button"
              className="btn btn-outline-primary shake gap-1 mb-2"
              onClick={() => { setToggleLogin(!toggleLogin) }}>
              Connexion Locale
            </button>
          </div>
        )}

        {toggleLogin || (provider === 'Local' || provider === 'LDAP') && (
          <form
            className="form-horizontal text-start mx-auto"
            method="POST"
            onSubmit={e => submit(e)}
            style={{ maxWidth: '448px' }}
          >
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
              <button type="submit" ref={buttonRef} className="btn btn-outline-success shake" disabled={loading}>
                <Translation i18nkey="login.btn.label">Login</Translation>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
