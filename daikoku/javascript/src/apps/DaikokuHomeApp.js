import React, { Component } from 'react';
import { connect } from 'react-redux';
import md5 from 'js-md5';
import queryString from 'query-string';

import { BrowserRouter as Router, Route } from 'react-router-dom';
import { UnauthenticatedHome, UnauthenticatedTopBar } from '../components/frontend/unauthenticated';

import { t, Translation } from '../locales/Translation';
import { udpateLanguage } from '../core/context/actions';
import { Spinner } from '../components/utils/Spinner';
import {validatePassword, ValidateEmail} from '../components/utils/validation';

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
          <button type="button" className="btn btn-outline-success" onClick={this.setGravatarLink}>
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

  formSchema = currentLanguage => ({
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
        label: t('Email address', currentLanguage)
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
        <div style={{ display: 'flex', width: '100%', justifyContent: 'flex-end' }}>
          <button
            style={{ marginLeft: 5 }}
            type="button"
            className="btn btn-outline-success"
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
      const validationEmail = ValidateEmail(this.state.user.email, this.props.currentLanguage)
      if (validationPassword.ok && validationEmail.ok) {
        return fetch('/account', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...this.state.user }),
        })
          .then(r => r.json())
          .then(res => {
            if (res.error) {
              this.setState({ state: 'error', error: res.error });
            } else {
              this.setState({ state: 'done' });
            }
          });
      } else if(!!validationPassword.error){
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
          <h1 className="h1-rwd-reduce" style={{ textAlign: 'center', width: '100%' }}>
            <Translation i18nkey="Create account" language={this.props.currentLanguage}>
              Create account
            </Translation>
          </h1>
          <p style={{ width: '100%', textAlign: 'center' }}>
            <Translation
              i18nkey="create.accuont.done"
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
        <h1 className="h1-rwd-reduce" style={{ textAlign: 'center', width: '100%' }}>
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
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              marginTop: 20,
              marginBottom: 20,
            }}>
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
              onChange={user => {
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

  formSchema = currentLanguage => ({
    email: {
      type: 'string',
      props: {
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
        <div style={{ display: 'flex', width: '100%', justifyContent: 'flex-end' }}>
          <button
            style={{ marginLeft: 5 }}
            type="button"
            className="btn btn-outline-danger"
            onClick={this.resetPassword}>
            <span>
              <i className="fas fa-bomb" />
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
      const validation = validatePassword(this.state.user.password1, this.state.user.password2, this.props.currentLanguage);
      if (validation.ok) {
        return fetch('/account/reset', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(this.state.user),
        })
          .then(r => r.json())
          .then(res => {
            if (res.error) {
              this.setState({ state: 'error', error: res.error });
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
          <h1 className="h1-rwd-reduce" style={{ textAlign: 'center', width: '100%' }}>
            <Translation i18nkey="Reset password" language={this.props.currentLanguage}>
              Reset password
            </Translation>
          </h1>
          <p style={{ width: '100%', textAlign: 'center' }}>
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
        <h1 className="h1-rwd-reduce" style={{ textAlign: 'center', width: '100%' }}>
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
            <LazyForm
              flow={this.formFlow}
              schema={this.formSchema(this.props.currentLanguage)}
              value={this.state.user}
              onChange={user => {
                this.setState({ user });
              }}
            />
          </React.Suspense>
        )}
      </div>
    );
  }
}

export class DaikokuHomeApp extends Component {
  render() {
    const tenant = this.props.tenant;
    return (
      <Router>
        <div role="root-container" className="container-fluid">
          <Route
            path="/"
            render={p => (
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
            render={p => (
              <UnauthenticatedHome tenant={tenant} match={p.match} history={p.history} />
            )}
          />
          <Route
            exact
            path="/signup"
            render={p => <Signup tenant={tenant} match={p.match} history={p.history} />}
          />
          <Route exact path="/reset" render={p => <ResetPassword />} />
        </div>
      </Router>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateContextLanguage: team => udpateLanguage(team),
};

export const Signup = connect(mapStateToProps, mapDispatchToProps)(SignupComponent);
export const ResetPassword = connect(mapStateToProps, mapDispatchToProps)(ResetPasswordComponent);
