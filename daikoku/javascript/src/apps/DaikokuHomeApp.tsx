import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'js-m... Remove this comment to see the full error message
import md5 from 'js-md5';
import queryString from 'query-string';
import { Form, type, format, constraints } from '@maif/react-forms';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import { UnauthenticatedHome, UnauthenticatedTopBar } from '../components/frontend/unauthenticated';
import * as Services from '../services';
// @ts-expect-error TS(6142): Module '../locales/i18n-context' was resolved to '... Remove this comment to see the full error message
import { I18nContext } from '../locales/i18n-context';

const AvatarInput = ({
  rawValues,
  value,
  error,
  onChange
}: any) => {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);

  const setGravatarLink = () => {
    const email = (rawValues.email || Date.now().toString()).toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    onChange(url);
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex flex-row align-items-center">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex flex-column flex-grow-1">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <input
          type="text"
          className="form-control"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-access btn-block" onClick={setGravatarLink}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className="fas fa-user-circle me-1" />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Set avatar from Gravatar">Set avatar from Gravatar</Translation>
        </button>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {rawValues.avatar && <img src={value} style={{ height: '70px' }} />}
    </div>
  );
};

export const SignupComponent = () => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  const defaultAvatar = `https://www.gravatar.com/avatar/${md5('foo@foo.bar')}?size=128&d=robohash`;
  const [user, setUser] = useState(undefined);
  const [state, setState] = useState('creation');
  const [error, setError] = useState(undefined);

  useEffect(() => {
    const query = queryString.parse(window.location.search);
    if (query.error) {
      setState('error');
      setError(translateMethod(`account.creation.error.${query.error}`));
    }
  }, []);

  const schema = {
    name: {
      type: type.string,
      label: translateMethod('Name'),
      constraints: [constraints.required(translateMethod('constraints.required.name'))],
    },
    email: {
      type: type.string,
      format: format.email,
      label: translateMethod('Email address'),
      constraints: [
        constraints.required(translateMethod('constraints.required.email')),
        constraints.email(translateMethod('constraints.matches.email')),
      ],
    },
    avatar: {
      type: type.string,
      label: translateMethod('Avatar'),
      defaultValue: defaultAvatar,
      render: AvatarInput,
    },
    password: {
      type: type.string,
      format: format.password,
      label: translateMethod('Password'),
      constraints: [
        constraints.required(translateMethod('constraints.required.password')),
        constraints.matches(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,1000}$/,
          translateMethod('constraint.matches.password')
        ),
      ],
    },
    confirmPassword: {
      type: type.string,
      format: format.password,
      label: translateMethod('Confirm password'),
      constraints: [
        constraints.required(translateMethod('constraints.required.confirmPassword')),
        constraints.oneOf(
          [constraints.ref('password')],
          translateMethod('constraint.oneof.confirm.password')
        ),
      ],
    },
  };

  const flow = ['name', 'email', 'avatar', 'password', 'confirmPassword'];

  const createAccount = (data: any) => {
    setUser(data);
    return fetch('/account', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...data }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.error) {
          setState('error');
          setError(res.error);
        } else {
          setUser(data);
          setState('done');
        }
      });
  };

  if (state === 'done') {
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div className="col">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h1 className="h1-rwd-reduce text-center">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Create account">Create account</Translation>
        </h1>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <p style={{ width: '100%', textAlign: 'center' }}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="create.account.done" replacements={[user.email]}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            You will receive an email at <b>{user.email}</b> to finish your account creation
            process. You will have 15 minutes from now to finish your account creation process.
          </Translation>
        </p>
      </div>
    );
  }

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="section mx-auto mt-3 p-3" style={{ maxWidth: '448px' }}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <h1 className="h1-rwd-reduce text-center">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Create account">Create account</Translation>
      </h1>
      {state === 'error' && error && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Form
        schema={schema}
        flow={flow}
        onSubmit={createAccount}
        value={user}
        footer={({ reset, valid }) => {
          return (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div className="d-flex justify-content-end">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button className="btn btn-outline-danger m-3" onClick={reset}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="Cancel">Cancel</Translation>
              </button>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button className="btn btn-outline-success m-3" onClick={valid}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="Create account">Create account</Translation>
              </button>
            </div>
          );
        }}
      />
    </div>
  );
};

export const ResetPasswordComponent = (props: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  const [user, setUser] = useState(undefined);
  const [state, setState] = useState('creation');
  const [error, setError] = useState(undefined);

  const schema = {
    email: {
      type: type.string,
      format: format.email,
      label: translateMethod('Email address'),
      constraints: [
        constraints.required(translateMethod('constraints.required.email')),
        constraints.email(translateMethod('constraints.matches.email')),
      ],
    },
    password: {
      type: type.string,
      format: format.password,
      label: translateMethod('Password'),
      constraints: [
        constraints.required(translateMethod('constraints.required.password')),
        constraints.matches(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,1000}$/,
          translateMethod('constraints.matches.password')
        ),
      ],
    },
    confirmPassword: {
      type: type.string,
      format: format.password,
      label: translateMethod('Confirm password'),
      constraints: [
        constraints.required(translateMethod('constraints.required.confirmPassword')),
        constraints.oneOf(
          [constraints.ref('password')],
          translateMethod('constraint.oneof.confirm.password')
        ),
      ],
    },
  };

  const flow = ['email', 'password', 'confirmPassword'];

  const resetPassword = (data: any) => {
    return fetch('/account/reset', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.error) {
          setState('error');
          setError(res.error);
        } else {
          setUser(data);
          setState('done');
        }
      });
  };

  useEffect(() => {
    const query = queryString.parse(window.location.search);
    if (query.error) {
      setState('error');
      setError(translateMethod(`account.reset.error.${query.error}`));
    }
  }, []);

  if (state === 'done') {
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div className="col">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h1 className="h1-rwd-reduce text-center mt-2">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Reset password">Reset password</Translation>
        </h1>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <p className="text-center mt-2">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="password.reset.done" replacements={[user.email]}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            You will receive an email at <b>{user.email}</b> to finish your passsword reset process.
            You will have 15 minutes from now to finish your password reset process.
          </Translation>
        </p>
      </div>
    );
  }
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="section mx-auto mt-3 p-3" style={{ maxWidth: '448px' }}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <h1 className="h1-rwd-reduce text-center mt-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Reset password">Reset password</Translation>
      </h1>
      {state === 'error' && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Form
        schema={schema}
        flow={flow}
        onSubmit={resetPassword}
        footer={({ reset, valid }) => {
          return (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div className="d-flex justify-content-end">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button className="btn btn-outline-danger m-3" onClick={reset}>
                Cancel
              </button>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button className="btn btn-outline-success m-3" onClick={valid}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <span>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="Reset password">Reset password</Translation>
                </span>
              </button>
            </div>
          );
        }}
      />
    </div>
  );
};

export const TwoFactorAuthentication = ({
  title
}: any) => {
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState();

  const [showBackupCodes, toggleBackupCodesInput] = useState(false);
  const [backupCode, setBackupCode] = useState('');

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, language } = useContext(I18nContext);

  function verify() {
    if (!code || code.length !== 6) {
      setError(translateMethod('2fa.code_error'));
      setCode('');
    } else {
      Services.verify2faCode(token, code).then((res) => {
        if (res.status >= 400) {
          setError(translateMethod('2fa.wrong_code'));
          setCode('');
        } else if (res.redirected) window.location.href = res.url;
      });
    }
  }

  function reset2faAccess() {
    Services.reset2faAccess(backupCode).then((res) => {
      if (res.error) toastr.error(res.error);
      else {
        toastr.success(translateMethod('2fa.successfully_disabled'));
        window.location.replace('/');
      }
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('token')) window.location.replace('/');
    // @ts-expect-error TS(2345): Argument of type 'string | null' is not assignable... Remove this comment to see the full error message
    else setToken(params.get('token'));
  }, []);

  useEffect(() => {
    if (error) setError(translateMethod('2fa.code_error'));
  }, [language]);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex flex-column mx-auto my-3" style={{ maxWidth: '350px' }}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <h3>{title}</h3>
      {showBackupCodes ? (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <input
            type="text"
            value={backupCode}
            placeholder={translateMethod('2fa.insert_backup_codes')}
            onChange={(e) => setBackupCode(e.target.value)}
            className="form-control"
          />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-outline-success mt-3" type="button" onClick={reset2faAccess}>
            {translateMethod('2fa.reset_access')}
          </button>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <a href="#" onClick={() => toggleBackupCodesInput(false)} className="text-center mt-3">
            {translateMethod('2fa.using_code')}
          </a>
        </>
      ) : (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span className="mb-3">{translateMethod('2fa.message')}</span>
          {error && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <input
            type="number"
            value={code}
            placeholder={translateMethod('2fa.insert_code')}
            onChange={(e) => {
              if (e.target.value.length < 7) {
                // @ts-expect-error TS(2345): Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
                setError(null);
                setCode(e.target.value);
              }
            }}
            className="form-control"
          />

          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-outline-success mt-3" type="button" onClick={verify}>
            {translateMethod('2fa.verify_code')}
          </button>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <a href="#" onClick={toggleBackupCodesInput} className="text-center mt-3">
            {translateMethod('2fa.lost_device_message')}
          </a>
        </>
      )}
    </div>
  );
};

export const DaikokuHomeApp = (props: any) => {
  const tenant = props.tenant;
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Router>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div role="root-container" className="container-fluid">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Routes>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Route
            path="*"
            element={
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <UnauthenticatedTopBar tenant={tenant} />
              </>
            }
          />
        </Routes>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Routes>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Route path="/" element={<UnauthenticatedHome tenant={tenant} />} />
        </Routes>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Routes>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Route path="/signup" element={<Signup tenant={tenant} />} />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Route path="/reset" element={<ResetPassword />} />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Route
            path="/2fa"
            element={
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <TwoFactorAuthentication
                title={`${tenant.name} - ${translateMethod('Verification code')}`}
              />
            }
          />
        </Routes>
      </div>
    </Router>
  );
};

const mapStateToProps = (state: any) => ({
  ...state.context
});

export const Signup = connect(mapStateToProps)(SignupComponent);
export const ResetPassword = connect(mapStateToProps)(ResetPasswordComponent);
