import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import md5 from 'js-md5';
import queryString from 'query-string';
import { Form, type, format, constraints } from '@maif/react-forms';
import { toastr } from 'react-redux-toastr';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import { UnauthenticatedHome, UnauthenticatedTopBar } from '../components/frontend/unauthenticated';
import * as Services from '../services';
import { I18nContext } from '../locales/i18n-context';


const AvatarInput = ({rawValues, value, error, onChange}) => {
  const { Translation } = useContext(I18nContext);

  const setGravatarLink = () => {
    const email = (rawValues.email || Date.now().toString()).toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    onChange(url);
  };

  return (
    <div className='d-flex flex-row align-items-center'>
      <div className="d-flex flex-column flex-grow-1">
        <input type="text" className='form-control' value={value} onChange={e => onChange(e.target.value)} />
        <button
          type="button"
          className='btn btn-access btn-block'
          onClick={setGravatarLink}>
          <i className="fas fa-user-circle mr-1" />
          <Translation i18nkey="Set avatar from Gravatar">Set avatar from Gravatar</Translation>
        </button>
      </div>
      {rawValues.avatar && <img src={value} style={{ height: '70px' }} />}
    </div>
  );
};

export const SignupComponent = () => {
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
      constraints: [
        constraints.required(translateMethod('constraints.required.name'))
      ]
    },
    email: {
      type: type.string,
      format: format.email,
      label: translateMethod('Email address'),
      constraints: [
        constraints.required(translateMethod('constraints.required.email'))
      ]
    },
    avatar: {
      type: type.string,
      label: translateMethod('Avatar'),
      defaultValue: defaultAvatar,
      render: AvatarInput

    },
    password: {
      type: type.string,
      format: format.password,
      label: translateMethod('Password'),
      constraints: [
        constraints.required(translateMethod('constraints.required.password')),
        constraints.matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,1000}$/, translateMethod('constraint.matches.password'))
      ]
    },
    confirmPassword: {
      type: type.string,
      format: format.password,
      label: translateMethod('Confirm password'),
      constraints: [
        constraints.required(translateMethod('constraints.required.confirmPassword')),
        constraints.oneOf([constraints.ref('password')], translateMethod('constraint.oneof.confirm.password'))
      ]
    },
  };

  const flow = [
    'name',
    'email',
    'avatar',
    'password',
    'confirmPassword',
  ];

  const createAccount = (data) => {
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
      <div className="col">
        <h1 className="h1-rwd-reduce text-center">
          <Translation i18nkey="Create account">Create account</Translation>
        </h1>
        <p style={{ width: '100%', textAlign: 'center' }}>
          <Translation i18nkey="create.account.done" replacements={[user.email]}>
            You will receive an email at <b>{user.email}</b> to finish your account creation
            process. You will have 15 minutes from now to finish your account creation process.
          </Translation>
        </p>
      </div>
    );
  }

  return (
    <div className="section mx-auto mt-3 p-3" style={{ maxWidth: '448px', minWidth: '448px' }}>
      <h1 className="h1-rwd-reduce text-center">
        <Translation i18nkey="Create account">Create account</Translation>
      </h1>
      {state === 'error' && error && <div className="alert alert-danger" role="alert">
        {error}
      </div>}
      <Form
        schema={schema}
        flow={flow}
        onChange={createAccount}
        footer={({ reset, valid }) => {
            return (
              <div className="d-flex justify-content-end">
                <button className="btn btn-outline-danger m-3" onClick={reset}>
                  <Translation i18nkey="Cancel">Cancel</Translation>
                </button>
                <button className="btn btn-outline-success m-3" onClick={valid}>
                  <Translation i18nkey="Create account">Create account</Translation>
                </button>
              </div>
            );
          }}
      />
    </div>
  );
};

export const ResetPasswordComponent = (props) => {
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
        constraints.url(translateMethod('constraints.format.url'))
      ]
    },
    password: {
      type: type.string,
      format: format.password,
      label: translateMethod('Password'),
      constraints: [
        constraints.required(translateMethod('constraints.required.password')),
        constraints.matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,1000}$/, translateMethod('constraints.matches.password'))
      ]
    },
    confirmPassword: {
      type: type.string,
      format: format.password,
      label: translateMethod('Confirm password'),
      constraints: [
        constraints.required(translateMethod('constraints.required.confirmPassword')),
        constraints.oneOf([constraints.ref('password')], translateMethod('constraint.oneof.confirm.password'))
      ]
    }
  };

  const flow = ['email', 'password', 'confirmPassword'];

  const resetPassword = data => {
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
      <div className="col">
        <h1 className="h1-rwd-reduce text-center mt-2">
          <Translation i18nkey="Reset password">Reset password</Translation>
        </h1>
        <p className="text-center mt-2">
          <Translation i18nkey="password.reset.done" replacements={[user.email]}>
            You will receive an email at <b>{user.email}</b> to finish your passsword reset
            process. You will have 15 minutes from now to finish your password reset process.
          </Translation>
        </p>
      </div>
    );
  }
  return (
    <div className="section mx-auto mt-3 p-3" style={{ maxWidth: '448px', minWidth: '448px' }}>
      <h1 className="h1-rwd-reduce text-center mt-2">
        <Translation i18nkey="Reset password">Reset password</Translation>
      </h1>
      {state === 'error' && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <Form
        schema={schema}
        flow={flow}
        onChange={resetPassword}
        footer={({ reset, valid }) => {
            return (
              <div className="d-flex justify-content-end">
                <button className="btn btn-outline-primary m-3" onClick={reset}>Cancel</button>
                <button className="btn btn-outline-danger m-3" onClick={valid}>
                  <span>
                    <i className="fas fa-bomb mr-1" />
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

export const TwoFactorAuthentication = ({ title }) => {
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState();

  const [showBackupCodes, toggleBackupCodesInput] = useState(false);
  const [backupCode, setBackupCode] = useState('');

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
    else setToken(params.get('token'));
  }, []);

  useEffect(() => {
    if (error) setError(translateMethod('2fa.code_error'));
  }, [language]);

  return (
    <div className="d-flex flex-column mx-auto my-3" style={{ maxWidth: '350px' }}>
      <h3>{title}</h3>
      {showBackupCodes ? (
        <>
          <input
            type="text"
            value={backupCode}
            placeholder={translateMethod('2fa.insert_backup_codes')}
            onChange={(e) => setBackupCode(e.target.value)}
            className="form-control"
          />
          <button className="btn btn-outline-success mt-3" type="button" onClick={reset2faAccess}>
            {translateMethod('2fa.reset_access')}
          </button>
          <a href="#" onClick={() => toggleBackupCodesInput(false)} className="text-center mt-3">
            {translateMethod('2fa.using_code')}
          </a>
        </>
      ) : (
        <>
          <span className="mb-3">{translateMethod('2fa.message')}</span>
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          <input
            type="number"
            value={code}
            placeholder={translateMethod('2fa.insert_code')}
            onChange={(e) => {
              if (e.target.value.length < 7) {
                setError(null);
                setCode(e.target.value);
              }
            }}
            className="form-control"
          />

          <button className="btn btn-outline-success mt-3" type="button" onClick={verify}>
            {translateMethod('2fa.verify_code')}
          </button>
          <a href="#" onClick={toggleBackupCodesInput} className="text-center mt-3">
            {translateMethod('2fa.lost_device_message')}
          </a>
        </>
      )}
    </div>
  );
};

export const DaikokuHomeApp = (props) => {
  const tenant = props.tenant;
  const { translateMethod } = useContext(I18nContext);

  return (
    <Router>
      <div role="root-container" className="container-fluid">
        <Routes>
          <Route
            path="*"
            element={
              <>
                <UnauthenticatedTopBar tenant={tenant} />
              </>
            }
          />
        </Routes>
        <Routes>
          <Route path="/" element={<UnauthenticatedHome tenant={tenant} />} />
        </Routes>
        <Routes>
          <Route path="/signup" element={<Signup tenant={tenant} />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route
            path="/2fa"
            element={
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

const mapStateToProps = (state) => ({
  ...state.context,
});

export const Signup = connect(mapStateToProps)(SignupComponent);
export const ResetPassword = connect(mapStateToProps)(ResetPasswordComponent);
