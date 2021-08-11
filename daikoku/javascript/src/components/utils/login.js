import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Translation } from '../../locales';
import * as Services from '../../services/index';

export class LoginPage extends Component {
  state = {
    username: '',
    password: '',
    message: null,
    loginError: null,
  };

  onChange = (e) => {
    this.setState({
      [e.target.name]: e.target.value,
      loginError: null,
    });
  };

  submit = (e) => {
    e.preventDefault();
    const { username, password } = this.state;

    Services.login(username, password, this.props.action).then((res) => {
      if (res.status === 400)
        this.setState({
          loginError: true,
        });
      else if (res.redirected) window.location.href = res.url;
    });
  };

  render() {
    const { loginError } = this.state;

    return (
      <div>
        <div className="login__container text-center">
          <div className="organisation__header d-flex align-items-center">
            <div className="col-sm-4">
              <img
                className="organisation__avatar"
                src={this.props.tenant.logo || '/assets/images/daikoku.svg'}
                alt="avatar"
              />
            </div>
            <h3>
              <Translation
               
                i18nkey="login.to.tenant"
                replacements={[this.props.tenant.name]}>
                Login to {this.props.tenant.name}
              </Translation>
            </h3>
          </div>

          <form
            className="form-horizontal text-left mx-auto"
            method={this.props.method}
            onSubmit={this.submit}
            style={{ maxWidth: '448px' }}>
            <input type="hidden" name="token" className="form-control" value={this.props.token} />
            {loginError && (
              <span className="alert alert-danger d-flex justify-content-center">
                <Translation i18nkey="login.failed">
                  User not found or invalid credentials
                </Translation>
              </span>
            )}
            <div className="form-group">
              <label className="control-label">
                <Translation i18nkey="Email address">
                  Email address
                </Translation>
              </label>
              <input
                type="text"
                name="username"
                className="form-control"
                value={this.props.username}
                onChange={this.onChange}
              />
            </div>
            <div className="form-group">
              <label className="control-label">
                <Translation i18nkey="Password">
                  Password
                </Translation>
              </label>
              <input
                type="password"
                name="password"
                className="form-control"
                value={this.props.password}
                onChange={this.onChange}
              />
            </div>
            <div className="form-group">
              <button type="submit" className="btn btn-success btn-block">
                <Translation i18nkey="Login">
                  Login
                </Translation>
              </button>
            </div>
            {this.props.provider == 'Local' && (
              <div
                className="form-group p-3 text-center"
                style={{
                  border: '1px solid var(--form-border-color, #586069)',
                  borderRadius: '6px',
                }}>
                <Translation
                 
                  i18nkey="login_page.register_message"
                  replacements={[this.props.tenant.name]}
                />
                <a href="/signup">{' '}Create an account.</a>
              </div>
            )}
            <div className="form-group">
              <a href="/reset">
                <Translation
                 
                  i18nkey="Forgot your password ?">
                  Forgot your password ?
                </Translation>
              </a>
            </div>
          </form>
        </div>
      </div>
    );
  }
}

LoginPage.propTypes = {
  tenant: PropTypes.shape({
    name: PropTypes.string.isRequired,
    logo: PropTypes.string.isRequired,
  }).isRequired,
  token: PropTypes.string,
  method: PropTypes.string,
  action: PropTypes.string,
  username: PropTypes.string,
  password: PropTypes.string,
};
