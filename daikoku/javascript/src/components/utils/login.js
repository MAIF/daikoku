import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Translation } from '../../locales';

export class LoginPage extends Component {
  state = {
    username: '',
    password: '',
    error: null,
    message: null,
  };

  onChange = e => {
    this.setState({ [e.target.name]: e.target.value });
  };

  handleError = mess => {
    return err => {
      console.log(err && err.message ? err.message : err);
      this.setState({ error: mess });
      throw err;
    };
  };

  render() {
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
                language={this.props.tenant.defaultLanguage}
                i18nkey="login.to.tenant"
                replacements={[this.props.tenant.name]}>
                Login to {this.props.tenant.name}
              </Translation>
            </h3>
          </div>

          <form
            className="form-horizontal text-left"
            method={this.props.method}
            action={this.props.action}>
            <input type="hidden" name="token" className="form-control" value={this.props.token} />
            <div className="form-group">
              <label className="col-sm-2 control-label">
                <Translation language={this.props.tenant.defaultLanguage} i18nkey="Username">
                  Username
                </Translation>
              </label>
              <div className="col-sm-10">
                <input
                  type="text"
                  name="username"
                  className="form-control"
                  value={this.props.username}
                  onChange={this.onChange}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="col-sm-2 control-label">
                <Translation language={this.props.tenant.defaultLanguage} i18nkey="Password">
                  Password
                </Translation>
              </label>
              <div className="col-sm-10">
                <input
                  type="password"
                  name="password"
                  className="form-control"
                  value={this.props.password}
                  onChange={this.onChange}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="col-sm-2 control-label" />
              <div className="col-sm-10">
                <button type="submit" className="btn btn-access-negative" style={{ marginLeft: 0 }}>
                  <Translation language={this.props.tenant.defaultLanguage} i18nkey="Login">
                    Login
                  </Translation>
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="col-sm-2 control-label" />
              <div className="col-sm-10">
                <a href="/reset">
                  <Translation
                    language={this.props.tenant.defaultLanguage}
                    i18nkey="Forgot your password ?">
                    Forgot your password ?
                  </Translation>
                </a>
                <p>{!this.state.error && this.state.message}</p>
                <p style={{ color: 'red', width: '100%', textAlign: 'left' }}>
                  {!!this.state.error && this.state.error}
                </p>
              </div>
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
