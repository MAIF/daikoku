import { constraints, Form, format, type } from '@maif/react-forms';
import { md5 } from 'js-md5';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BrowserRouter as Router, Route, Routes, useNavigate, Link } from 'react-router-dom';

import { I18nContext } from '../contexts/i18n-context';
import * as Services from '../services';
import { IUserSimple } from '../types';

const AvatarInput = ({
  rawValues,
  value,
  onChange
}: any) => {
  const { Translation } = useContext(I18nContext);

  const setGravatarLink = () => {
    const email = (rawValues.email || Date.now().toString()).toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    onChange(url);
  };

  return (
    <div className="d-flex flex-row align-items-center">
      <div className="d-flex flex-column flex-grow-1">
        <input
          type="text"
          className="form-control"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="btn btn-outline-primary btn-block" onClick={setGravatarLink}>
          <i className="fas fa-user-circle me-1" />
          <Translation i18nkey="Set avatar from Gravatar">Set avatar from Gravatar</Translation>
        </button>
      </div>
      {rawValues.avatar && <img src={value} style={{ height: '70px' }} />}
    </div>
  );
};

export const Signup = () => {
  const { translate, Translation } = useContext(I18nContext);

  const navigate = useNavigate();

  const defaultAvatar = `https://www.gravatar.com/avatar/${md5('foo@foo.bar')}?size=128&d=robohash`;
  const [user, setUser] = useState<IUserSimple>();
  const [state, setState] = useState<'creation' | 'error' | 'done'>('creation');
  const [error, setError] = useState<string>();

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('error')) {
      setState('error');
      setError(translate(`account.creation.error.${query.get('error')}`));
    }
  }, []);

  const schema = {
    name: {
      type: type.string,
      label: translate('Name'),
      constraints: [constraints.required(translate('constraints.required.name'))],
    },
    email: {
      type: type.string,
      format: format.email,
      label: translate('Email address'),
      constraints: [
        constraints.required(translate('constraints.required.email')),
        constraints.email(translate('constraints.matches.email')),
      ],
    },
    avatar: {
      type: type.string,
      label: translate('Avatar'),
      defaultValue: defaultAvatar,
      render: AvatarInput,
    },
    password: {
      type: type.string,
      format: format.password,
      label: translate('Password'),
      constraints: [
        constraints.required(translate('constraints.required.password')),
        constraints.matches(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,1000}$/,
          translate('constraints.matches.password')
        ),
      ],
    },
    confirmPassword: {
      type: type.string,
      format: format.password,
      label: translate('Confirm password'),
      constraints: [
        constraints.required(translate('constraints.required.confirmPassword')),
        constraints.oneOf(
          [constraints.ref('password')],
          translate('constraints.oneof.confirm.password')
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
      <div className="col">
        <h1 className="h1-rwd-reduce text-center">
          <Translation i18nkey="Create account">Create account</Translation>
        </h1>
        <p style={{ width: '100%', textAlign: 'center' }}>
          <Translation i18nkey="create.account.done" replacements={[user!.email]}>
            You will receive an email at <b>{user!.email}</b> to finish your account creation
            process. You will have 15 minutes from now to finish your account creation process.
          </Translation>
        </p>
      </div>
    );
  }

  return (
    <div className="section mx-auto mt-3 p-3" style={{ maxWidth: '448px' }}>
      {state === 'error' && error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <Form
        schema={schema}
        flow={flow}
        onSubmit={createAccount}
        value={user}
        className='signup-form'
        options={{
          actions: {
            cancel: {
              display: true,
              label: translate('Cancel'),
              action: () => navigate('/')
            },
            submit: {
              label: translate('Create account')
            }
          }
        }}
      />
    </div>
  );
};

export const ResetPassword = () => {
  const { translate, Translation } = useContext(I18nContext);

  const [user, setUser] = useState<IUserSimple>();
  const [state, setState] = useState<'creation' | 'error' | 'done'>('creation');
  const [error, setError] = useState<string>();

  const navigate = useNavigate();

  const schema = {
    email: {
      type: type.string,
      format: format.email,
      label: translate('Email address'),
      constraints: [
        constraints.required(translate('constraints.required.email')),
        constraints.email(translate('constraints.matches.email')),
      ],
    },
    password: {
      type: type.string,
      format: format.password,
      label: translate('Password'),
      constraints: [
        constraints.required(translate('constraints.required.password')),
        constraints.matches(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,1000}$/,
          translate('constraints.matches.password')
        ),
      ],
    },
    confirmPassword: {
      type: type.string,
      format: format.password,
      label: translate('Confirm password'),
      constraints: [
        constraints.required(translate('constraints.required.confirmPassword')),
        constraints.oneOf(
          [constraints.ref('password')],
          translate('constraints.oneof.confirm.password')
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
    const query = new URLSearchParams(window.location.search);
    if (query.get('error')) {
      setState('error');
      setError(translate(`account.reset.error.${query.get('error')}`));
    }
  }, []);

  if (state === 'done' && user) {
    return (
      <div className="section mx-auto mt-3 p-3" style={{ maxWidth: '448px' }}>
        <div className="alert alert-info" role="alert">
          <Translation i18nkey="password.reset.done" replacements={[user.email]}>
            You will receive an email at <b>{user.email}</b> to finish your passsword reset process.
            You will have 15 minutes from now to finish your password reset process.
          </Translation>
        </div>
        <div className="d-flex justify-content-end">
          <Link className='btn btn-outline-success' to="/">{translate('go_back')}</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="section mx-auto mt-3 p-3" style={{ maxWidth: '448px' }}>
      {state === 'error' && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <Form
        schema={schema}
        flow={flow}
        onSubmit={resetPassword}
        footer={({ reset, valid }) => {
          return (
            <div className="d-flex justify-content-end">
              <button className="btn btn-outline-danger m-3" onClick={() => navigate(-1)}>
                {translate('Cancel')}
              </button>
              <button className="btn btn-outline-success m-3" onClick={valid}>
                <span>
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

export const TwoFactorAuthentication = () => {
  const [code, setCode] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [error, setError] = useState<string>();

  const [showBackupCodes, toggleBackupCodesInput] = useState(false);
  const [backupCode, setBackupCode] = useState('');

  const { translate, language } = useContext(I18nContext);

  function verify() {
    if (!code || code.length !== 6) {
      setError(translate('2fa.code_error'));
      setCode('');
    } else {
      Services.verify2faCode(token, code).then((res) => {
        if (res.status >= 400) {
          setError(translate('2fa.wrong_code'));
          setCode('');
        } else if (res.redirected) {
          window.location.href = res.url;
        }
      });
    }
  }

  function reset2faAccess() {
    Services.reset2faAccess(backupCode).then((res) => {
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(translate('2fa.successfully_disabled'));
        window.location.replace('/');
      }
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token')
    if (!token) {
      window.location.replace('/');
    } else {
      setToken(token);
    }
  }, []);

  useEffect(() => {
    if (error) setError(translate('2fa.code_error'));
  }, [language]);

  return (
    <div className="d-flex flex-column mx-auto my-3" style={{ maxWidth: '350px' }}>
      {showBackupCodes ? (
        <>
          <input
            type="text"
            value={backupCode}
            placeholder={translate('2fa.insert_backup_codes')}
            onChange={(e) => setBackupCode(e.target.value)}
            className="form-control"
          />
          <button className="btn btn-outline-success mt-3" type="button" onClick={reset2faAccess}>
            {translate('2fa.reset_access')}
          </button>
          <a href="#" onClick={() => toggleBackupCodesInput(false)} className="text-center mt-3">
            {translate('2fa.using_code')}
          </a>
        </>
      ) : (
        <>
          <span className="mb-3">{translate('2fa.message')}</span>
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          <input
            type="number"
            value={code}
            placeholder={translate('2fa.insert_code')}
            onChange={(e) => {
              if (e.target.value.length < 7) {
                setError(undefined);
                setCode(e.target.value);
              }
            }}
            className="form-control"
          />

          <button className="btn btn-outline-success mt-3" type="button" onClick={verify}>
            {translate('2fa.verify_code')}
          </button>
          <a href="#" onClick={() => toggleBackupCodesInput(!showBackupCodes)} className="text-center mt-3">
            {translate('2fa.lost_device_message')}
          </a>
        </>
      )}
    </div>
  );
};