import React, { Component, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import md5 from 'js-md5';
import queryString from 'query-string';

import { BrowserRouter as Router, Route, useParams } from 'react-router-dom';
import { UnauthenticatedHome, UnauthenticatedTopBar } from '../components/frontend/unauthenticated';

import { t, Translation } from '../locales/Translation';
import { udpateLanguage } from '../core/context/actions';
import { Spinner } from '../components/utils/Spinner';
import { validatePassword, ValidateEmail } from '../components/utils/validation';
import * as Services from '../services';
import { toastr } from 'react-redux-toastr';

const LazyForm = React.lazy(() => import('../components/inputs/Form'));

class Gravatar extends Component {
  setGravatarLink = () => {
    const email = this.props.rawValue.email.toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    this.props.changeValue('picture', url);
  };

  render() {
    return (
      <div className="form-group row">
        <label className="col-xs-12 col-sm-2 col-form-label" />
        <div className="col-sm-10">
          <button type="button" className="btn btn-access" onClick={this.setGravatarLink}>
            <i className="fas fa-user-circle mr-1" />
            <Translation i18nkey="Set avatar from Gravatar" language={this.props.currentLanguage}>
              Set avatar from Gravatar
            </Translation>
          </button>
        </div>
      </div>
    );
  }
}

export class SignupComponent extends Component {
  state = {
    user: {
      avatar: `https://www.gravatar.com/avatar/${md5('foo@foo.bar')}?size=128&d=robohash`,
    },
  };

  formSchema = (currentLanguage) => ({
    name: {
      type: 'string',
      props: {
        label: t('Name', currentLanguage),
      },
    },
    email: {
      type: 'string',
      props: {
        type: 'email',
        label: t('Email address', currentLanguage),
      },
    },
    avatar: {
      type: 'string',
      props: {
        label: t('Avatar', currentLanguage),
      },
    },
    password1: {
      type: 'string',
      props: {
        type: 'password',
        label: t('Password', currentLanguage),
      },
    },
    password2: {
      type: 'string',
      props: {
        type: 'password',
        label: t('Confirm password', currentLanguage),
      },
    },
    gravatar: {
      type: Gravatar,
      props: {
        currentLanguage: currentLanguage,
      },
    },
    createAccount: {
      type: () => (
        <div className="d-flex justify-content-end">
          <button
            type="button"
            className="btn btn-access-negative m-2"
            onClick={this.createAccount}>
            <span>
              <i className="fas fa-save mr-1" />
              <Translation i18nkey="Create account" language={currentLanguage}>
                Create account
              </Translation>
            </span>
          </button>
        </div>
      ),
    },
  });

  formFlow = ['name', 'email', 'avatar', 'password1', 'password2', 'gravatar', 'createAccount'];

  createAccount = () => {
    if (
      this.state.user.name &&
      this.state.user.email &&
      this.state.user.avatar &&
      this.state.user.password1 &&
      this.state.user.password2
    ) {
      const validationPassword = validatePassword(
        this.state.user.password1,
        this.state.user.password2,
        this.props.currentLanguage
      );
      const validationEmail = ValidateEmail(this.state.user.email, this.props.currentLanguage);
      if (validationPassword.ok && validationEmail.ok) {
        return fetch('/account', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...this.state.user }),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.error) {
              this.setState({ state: 'error', error: res.error });
            } else {
              this.setState({ state: 'done' });
            }
          });
      } else if (validationPassword.error) {
        this.setState({ state: 'error', error: validationPassword.error });
      } else {
        this.setState({ state: 'error', error: validationEmail.error });
      }
    } else {
      this.setState({
        state: 'error',
        error: t('Missing informations ...', this.props.currentLanguage),
      });
    }
  };

  componentDidMount() {
    const query = queryString.parse(window.location.search);
    if (query.error && query.error === 'not-valid-anymore') {
      this.setState({
        state: 'error',
        error: t(
          'account.creation.error',
          this.props.currentLanguage,
          "Your account creation request is not valid anymore (it's only valid for 15 minutes). Please creates a new request."
        ),
      });
    }
  }

  render() {
    if (this.state.state === 'done') {
      return (
        <div className="col">
          <h1 className="h1-rwd-reduce text-center">
            <Translation i18nkey="Create account" language={this.props.currentLanguage}>
              Create account
            </Translation>
          </h1>
          <p style={{ width: '100%', textAlign: 'center' }}>
            <Translation
              i18nkey="create.account.done"
              language={this.props.currentLanguage}
              replacements={[this.state.user.email]}>
              You will receive an email at <b>{this.state.user.email}</b> to finish your account
              creation process. You will have 15 minutes from now to finish your account creation
              process.
            </Translation>
          </p>
        </div>
      );
    }

    return (
      <div className="col">
        <h1 className="h1-rwd-reduce text-center">
          <Translation i18nkey="Create account" language={this.props.currentLanguage}>
            Create account
          </Translation>
        </h1>
        {this.state.state === 'error' && (
          <div className="alert alert-danger" role="alert">
            {this.state.error}
          </div>
        )}
        {this.state.user && (
          <div className="d-flex justify-content-end align-items-center my-4">
            <img
              src={this.state.user.avatar}
              style={{ width: 60, borderRadius: '50%', backgroundColor: 'white' }}
              alt="avatar"
            />
          </div>
        )}
        {this.state.user && (
          <React.Suspense fallback={<Spinner />}>
            <LazyForm
              flow={this.formFlow}
              schema={this.formSchema(this.props.currentLanguage)}
              value={this.state.user}
              onChange={(user) => {
                this.setState({ user });
              }}
            />
          </React.Suspense>
        )}
      </div>
    );
  }
}

export class ResetPasswordComponent extends Component {
  state = {
    user: {},
  };

  formSchema = (currentLanguage) => ({
    email: {
      type: 'string',
      props: {
        type: 'email',
        label: t('Email address', currentLanguage),
      },
    },
    password1: {
      type: 'string',
      props: {
        type: 'password',
        label: t('Type your new password', currentLanguage),
      },
    },
    password2: {
      type: 'string',
      props: {
        type: 'password',
        label: t('Re-type your new password', currentLanguage),
      },
    },
    resetPassword: {
      type: () => (
        <div className="d-flex justify-content-end">
          <button type="button" className="btn btn-outline-danger m-2" onClick={this.resetPassword}>
            <span>
              <i className="fas fa-bomb mr-1" />
              <Translation i18nkey="Reset password" language={currentLanguage}>
                Reset password
              </Translation>
            </span>
          </button>
        </div>
      ),
    },
  });

  formFlow = ['email', 'password1', 'password2', 'resetPassword'];

  resetPassword = () => {
    if (this.state.user.email && this.state.user.password1 && this.state.user.password2) {
      const validation = validatePassword(
        this.state.user.password1,
        this.state.user.password2,
        this.props.currentLanguage
      );
      if (validation.ok) {
        return fetch('/account/reset', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(this.state.user),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.error) {
              this.setState({ state: 'error', error: t(res.error, this.props.currentLanguage) });
            } else {
              this.setState({ state: 'done' });
            }
          });
      } else {
        this.setState({ state: 'error', error: validation.error });
      }
    } else {
      this.setState({
        state: 'error',
        error: t('Missing informations ...', this.props.currentLanguage),
      });
    }
  };

  componentDidMount() {
    const query = queryString.parse(window.location.search);
    if (query.error && query.error === 'not-valid-anymore') {
      this.setState({
        state: 'error',
        error: t(
          'account.reset.error',
          this.props.currentLanguage,
          "Your password reset request is not valid anymore (it's only valid for 15 minutes). Please creates a new request."
        ),
      });
    }
  }

  render() {
    if (this.state.state === 'done') {
      return (
        <div className="col">
          <h1 className="h1-rwd-reduce text-center mt-2">
            <Translation i18nkey="Reset password" language={this.props.currentLanguage}>
              Reset password
            </Translation>
          </h1>
          <p className="text-center mt-2">
            <Translation
              i18nkey="password.reset.done"
              language={this.props.currentLanguage}
              replacements={[this.state.user.email]}>
              You will receive an email at <b>{this.state.user.email}</b> to finish your passsword
              reset process. You will have 15 minutes from now to finish your password reset
              process.
            </Translation>
          </p>
        </div>
      );
    }
    return (
      <div className="col">
        <h1 className="h1-rwd-reduce text-center mt-2">
          <Translation i18nkey="Reset password" language={this.props.currentLanguage}>
            Reset password
          </Translation>
        </h1>
        {this.state.state === 'error' && (
          <div className="alert alert-danger" role="alert">
            {this.state.error}
          </div>
        )}
        {this.state.user && (
          <React.Suspense fallback={<Spinner />}>
            <div className="row">
              <LazyForm
                flow={this.formFlow}
                schema={this.formSchema(this.props.currentLanguage)}
                value={this.state.user}
                onChange={(user) => {
                  this.setState({ user });
                }}
              />
            </div>
          </React.Suspense>
        )}
      </div>
    );
  }
}

export function TwoFactorAuthentication({ title, currentLanguage }) {
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState();

  const [showBackupCodes, toggleBackupCodesInput] = useState(false);
  const [backupCode, setBackupCode] = useState("");

  function verify() {
    if (!code || code.length !== 6) {
      setError(t('2fa.code_error', currentLanguage));
      setCode("");
    }
    else {
      Services.verify2faCode(token, code)
        .then(res => {
          if (res.status >= 400) {
            setError(t('2fa.wrong_code', currentLanguage));
            setCode("");
          }
          else if (res.redirected)
            window.location.href = res.url;
        })
    }
  }

  function reset2faAccess() {
    Services.reset2faAccess(backupCode)
      .then(res => {
        if (res.status >= 400)
          res.json().then(r => toastr.error(r.error))
        else {
          toastr.success(t('2fa.successfully_disabled', currentLanguage));
          window.location.replace("/");
        }
      })
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.get('token'))
      window.location.replace("/")
    else
      setToken(params.get("token"));
  }, [])

  useEffect(() => {
    if (error)
      setError(t('2fa.code_error', currentLanguage));
  }, [currentLanguage])

  return (
    <div className="d-flex flex-column mx-auto my-3" style={{ maxWidth: '350px' }}>
      <h3>{title}</h3>
      {showBackupCodes ?
        <>
          <input type="text" value={backupCode}
            placeholder={t('2fa.insert_backup_codes', currentLanguage)}
            onChange={e => setBackupCode(e.target.value)} className="form-control" />
          <button className="btn btn-outline-success mt-3" type="button"
            onClick={reset2faAccess}>{t('2fa.reset_access', currentLanguage)}</button>
          <a href="#" onClick={() => toggleBackupCodesInput(false)} className="text-center mt-3">
            {t('2fa.using_code', currentLanguage)}
          </a>
        </>
        : <>
          <span className="mb-3">{t('2fa.message', currentLanguage)}</span>
          {error && <div className="alert alert-danger" role="alert">
            {error}
          </div>}
          <input type="number" value={code} placeholder={t('2fa.insert_code', currentLanguage)}
            onChange={e => {
              if (e.target.value.length < 7) {
                setError(null)
                setCode(e.target.value)
              }
            }} className="form-control" />

          <button className="btn btn-outline-success mt-3" type="button" onClick={verify}>
            {t('2fa.verify_code', currentLanguage)}
          </button>
          <a href="#" onClick={toggleBackupCodesInput} className="text-center mt-3">
            {t('2fa.lost_device_message', currentLanguage)}  
          </a>
        </>}
    </div>
  )
}

export class DaikokuHomeApp extends Component {
  render() {
    const tenant = this.props.tenant;
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
          <Route exact path="/2fa" render={(p) => <TwoFactorAuthentication
            match={p.match}
            history={p.history}
            currentLanguage={'En'}
            title={`${tenant.name} - ${t('Verification code', 'En')}`} />} />
        </div>
      </Router>
    );
  }
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateContextLanguage: (team) => udpateLanguage(team),
};

export const Signup = connect(mapStateToProps, mapDispatchToProps)(SignupComponent);
export const ResetPassword = connect(mapStateToProps, mapDispatchToProps)(ResetPasswordComponent);
