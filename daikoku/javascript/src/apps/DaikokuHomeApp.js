import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import md5 from 'js-md5';
import queryString from 'query-string';

import { BrowserRouter as Router, Route } from 'react-router-dom';
import { UnauthenticatedHome, UnauthenticatedTopBar } from '../components/frontend/unauthenticated';

import { Spinner } from '../components/utils/Spinner';
import { validatePassword, ValidateEmail } from '../components/utils/validation';
import * as Services from '../services';
import { toastr } from 'react-redux-toastr';
import { I18nContext } from '../locales/i18n-context';

const LazyForm = React.lazy(() => import('../components/inputs/Form'));

function Gravatar(props) {
  const { Translation } = useContext(I18nContext);

  const setGravatarLink = () => {
    const email = (props.rawValue.email || Date.now().toString()).toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    props.changeValue('avatar', url);
  };

  const gravatarButton = () => (
    <button
      type="button"
      className={'btn btn-access ' + (props.fullWidth ? 'btn-block' : '')}
      onClick={setGravatarLink}>
      <i className="fas fa-user-circle mr-1" />
      <Translation i18nkey="Set avatar from Gravatar">Set avatar from Gravatar</Translation>
    </button>
  );

  const { fullWidth } = props;

  if (fullWidth) return gravatarButton();
  else
    return (
      <div className="form-group row">
        <label className="col-xs-12 col-sm-2 col-form-label" />
        <div className="col-sm-10">{gravatarButton()}</div>
      </div>
    );
}

export function SignupComponent(props) {
  const { translateMethod, Translation } = useContext(I18nContext);

  const [state, setState] = useState({
    user: {
      avatar: `https://www.gravatar.com/avatar/${md5('foo@foo.bar')}?size=128&d=robohash`,
    },
  });

  const formSchema = {
    name: {
      type: 'string',
      props: {
        label: translateMethod('Name'),
        isColmunFormat: true,
      },
    },
    email: {
      type: 'string',
      props: {
        type: 'email',
        label: translateMethod('Email address'),
        isColmunFormat: true,
      },
    },
    avatar: {
      type: 'string',
      props: {
        label: translateMethod('Avatar'),
        isColmunFormat: true,
      },
    },
    password1: {
      type: 'string',
      props: {
        type: 'password',
        label: translateMethod('Password'),
        isColmunFormat: true,
      },
    },
    password2: {
      type: 'string',
      props: {
        type: 'password',
        label: translateMethod('Confirm password'),
        isColmunFormat: true,
      },
    },
    gravatar: {
      type: Gravatar,
      props: {
        fullWidth: true,
      },
    },
    createAccount: {
      type: () => (
        <div className="my-3">
          <button type="button" className="btn btn-success btn-block" onClick={createAccount}>
            <Translation i18nkey="Create account">Create account</Translation>
          </button>
        </div>
      ),
    },
  };

  const formFlow = [
    'name',
    'email',
    'avatar',
    'password1',
    'password2',
    'gravatar',
    'createAccount',
  ];

  const createAccount = () => {
    if (
      state.user.name &&
      state.user.email &&
      state.user.avatar &&
      state.user.password1 &&
      state.user.password2
    ) {
      const validationPassword = validatePassword(
        state.user.password1,
        state.user.password2,
        translateMethod
      );
      const validationEmail = ValidateEmail(state.user.email, translateMethod);
      if (validationPassword.ok && validationEmail.ok) {
        return fetch('/account', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...state.user }),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.error) {
              setState({ ...state, state: 'error', error: res.error });
            } else {
              setState({ ...state, state: 'done' });
            }
          });
      } else if (validationPassword.error) {
        setState({ ...state, state: 'error', error: validationPassword.error });
      } else {
        setState({ ...state, state: 'error', error: validationEmail.error });
      }
    } else {
      setState({
        state: 'error',
        error: translateMethod('Missing informations ...'),
      });
    }
  };

  useEffect(() => {
    const query = queryString.parse(window.location.search);
    if (query.error && query.error === 'not-valid-anymore') {
      setState({
        ...state,
        state: 'error',
        error: translateMethod('account.creation.error'),
      });
    }
  }, []);

  if (state.state === 'done') {
    return (
      <div className="col">
        <h1 className="h1-rwd-reduce text-center">
          <Translation i18nkey="Create account">Create account</Translation>
        </h1>
        <p style={{ width: '100%', textAlign: 'center' }}>
          <Translation i18nkey="create.account.done" replacements={[state.user.email]}>
            You will receive an email at <b>{state.user.email}</b> to finish your account creation
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
      {state.user && (
        <div className="d-flex justify-content-center align-items-center my-4">
          <img
            src={state.user.avatar}
            style={{ width: 60, borderRadius: '50%', backgroundColor: 'white' }}
            alt="avatar"
          />
        </div>
      )}
      {state.error && (
        <div className="alert alert-danger text-center" role="alert">
          {state.error}
        </div>
      )}
      {state.user && (
        <React.Suspense fallback={<Spinner />}>
          <LazyForm
            flow={formFlow}
            schema={formSchema}
            value={state.user}
            onChange={(user) => {
              setState({ ...state, user, error: undefined });
            }}
          />
        </React.Suspense>
      )}
    </div>
  );
}

export function ResetPasswordComponent(props) {
  const { translateMethod, Translation } = useContext(I18nContext);

  const [state, setState] = {
    user: {},
  });

  const formSchema = {
    email: {
      type: 'string',
      props: {
        type: 'email',
        label: translateMethod('Email address'),
      },
    },
    password1: {
      type: 'string',
      props: {
        type: 'password',
        label: translateMethod('Type your new password'),
      },
    },
    password2: {
      type: 'string',
      props: {
        type: 'password',
        label: translateMethod('Re-type your new password'),
      },
    },
    resetPassword: {
      type: () => (
        <div className="d-flex justify-content-end">
          <button type="button" className="btn btn-outline-danger m-2" onClick={resetPassword}>
            <span>
              <i className="fas fa-bomb mr-1" />
              <Translation i18nkey="Reset password">Reset password</Translation>
            </span>
          </button>
        </div>
      ),
    },
  };

  const formFlow = ['email', 'password1', 'password2', 'resetPassword'];

  const resetPassword = () => {
    if (state.user.email && state.user.password1 && state.user.password2) {
      const validation = validatePassword(
        state.user.password1,
        state.user.password2,
        translateMethod
      );
      if (validation.ok) {
        return fetch('/account/reset', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(state.user),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.error) {
              setState({ ...state, state: 'error', error: translateMethod(res.error) });
            } else {
              setState({ ...state, state: 'done' });
            }
          });
      } else {
        setState({ ...state, state: 'error', error: validation.error });
      }
    } else {
      setState({
        ...state,
        state: 'error',
        error: translateMethod('Missing informations ...'),
      });
    }
  };

  useEffect(() => {
    const query = queryString.parse(window.location.search);
    if (query.error && query.error === 'not-valid-anymore') {
      setState({
        ...state,
        state: 'error',
        error: translateMethod('account.reset.error'),
      });
    }
  }, []);

  if (state.state === 'done') {
    return (
      <div className="col">
        <h1 className="h1-rwd-reduce text-center mt-2">
          <Translation i18nkey="Reset password">Reset password</Translation>
        </h1>
        <p className="text-center mt-2">
          <Translation i18nkey="password.reset.done" replacements={[state.user.email]}>
            You will receive an email at <b>{state.user.email}</b> to finish your passsword reset
            process. You will have 15 minutes from now to finish your password reset process.
          </Translation>
        </p>
      </div>
    );
  }
  return (
    <div className="col">
      <h1 className="h1-rwd-reduce text-center mt-2">
        <Translation i18nkey="Reset password">Reset password</Translation>
      </h1>
      {state.state === 'error' && (
        <div className="alert alert-danger" role="alert">
          {state.error}
        </div>
      )}
      {state.user && (
        <React.Suspense fallback={<Spinner />}>
          <div className="row">
            <LazyForm
              flow={formFlow}
              schema={formSchema}
              value={state.user}
              onChange={(user) => {
                setState({ ...state, user });
              }}
            />
          </div>
        </React.Suspense>
      )}
    </div>
  );
}

export function TwoFactorAuthentication({ title }) {
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
}

export function DaikokuHomeApp(props) {
  const tenant = props.tenant;

  return (
    <Router>
      <div role="root-container" className="container-fluid">
        <Route
          path="/"
          render={(p) => (
            <UnauthenticatedTopBar
              tenant={tenant}
              location={p.location}
              history={p.history}
              match={p.match}
            />
          )}
        />
        <Route
          exact
          path="/"
          render={(p) => (
            <UnauthenticatedHome tenant={tenant} match={p.match} history={p.history} />
          )}
        />
        <Route
          exact
          path="/signup"
          render={(p) => <Signup tenant={tenant} match={p.match} history={p.history} />}
        />
        <Route exact path="/reset" render={() => <ResetPassword />} />
        <Route
          exact
          path="/2fa"
          render={(p) => (
            <TwoFactorAuthentication
              match={p.match}
              history={p.history}
              title={`${tenant.name} - ${translateMethod('Verification code')}`}
            />
          )}
        />
      </div>
    </Router>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const Signup = connect(mapStateToProps)(SignupComponent);
export const ResetPassword = connect(mapStateToProps)(ResetPasswordComponent);
