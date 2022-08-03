import React, { useContext, useState } from 'react';
import * as Services from '../../services/index';
import { I18nContext } from '../../core';

export function LoginPage(props: any) {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);

  const [state, setState] = useState({
    username: '',
    password: '',
    message: null,
    loginError: null,
  });

  const onChange = (e: any) => {
    setState({
      ...state,
      [e.target.name]: e.target.value,
      loginError: null,
    });
  };

  const submit = (e: any) => {
    e.preventDefault();
    const { username, password } = state;

    Services.login(username, password, props.action).then((res) => {
      if (res.status === 400)
        setState({
          ...state,
          // @ts-expect-error TS(2322): Type 'true' is not assignable to type 'null'.
          loginError: true,
        });
      else if (res.redirected) window.location.href = res.url;
    });
  };

  const { loginError } = state;

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="login__container text-center">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="organisation__header d-flex align-items-center">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="col-sm-4">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <img
              className="organisation__avatar"
              src={props.tenant.logo || '/assets/images/daikoku.svg'}
              alt="avatar"
            />
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h3>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="login.to.tenant" replacements={[props.tenant.name]}>
              Login to {props.tenant.name}
            </Translation>
          </h3>
        </div>

        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <form
          className="form-horizontal text-start mx-auto"
          method={props.method}
          onSubmit={submit}
          style={{ maxWidth: '448px' }}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <input type="hidden" name="token" className="form-control" value={props.token} />
          {loginError && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <span className="alert alert-danger d-flex justify-content-center">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="login.failed">
                User not found or invalid credentials
              </Translation>
            </span>
          )}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="mb-3">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <label className="control-label mb-2">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Email address">Email address</Translation>
            </label>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input
              type="text"
              name="username"
              className="form-control"
              value={props.username}
              onChange={onChange}
            />
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="mb-3">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <label className="control-label mb-2">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Password">Password</Translation>
            </label>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input
              type="password"
              name="password"
              className="form-control"
              value={props.password}
              onChange={onChange}
            />
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="mb-3 d-grid gap-1">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button type="submit" className="btn btn-success">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Login">Login</Translation>
            </button>
          </div>
          {props.provider == 'Local' && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div
              className="mb-3 p-3 text-center"
              style={{
                border: '1px solid var(--form-border-color, #586069)',
                borderRadius: '6px',
              }}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation
                i18nkey="login_page.register_message"
                replacements={[props.tenant.name]}
              />
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <a href="/signup">{' '}Create an account.</a>
            </div>
          )}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="mb-3">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <a href="/reset">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Forgot your password ?">Forgot your password ?</Translation>
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
