import React, { Component } from 'react';
import PropTypes from 'prop-types';

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

  handleError = (mess) => {
    return err => {
      console.log(err && err.message ? err.message : err);
      this.setState({ error: mess });
      throw err;
    };
  };

  render() {
    return (
      <div>
        <div className="jumbotron text-center">
          <h3 className="mb-5">Login to {this.props.tenant.name}</h3>
          <form
            className="form-horizontal text-left"
            method={this.props.method}
            action={this.props.action}>
            <input type="hidden" name="token" className="form-control" value={this.props.token} />
            <div className="form-group">
              <label className="col-sm-2 control-label">Username</label>
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
              <label className="col-sm-2 control-label">Password</label>
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
                  Login
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="col-sm-2 control-label" />
              <div className="col-sm-10">
                <a href="/reset">Forgot your password ?</a>
                <p>{!this.state.error && this.state.message}</p>
                <p style={{ color: 'red', width: '100%', textAlign: 'left' }}>
                  {!!this.state.error && this.state.error}
                </p>
              </div>
            </div>
          </form>
          <p>
            <img src={this.props.tenant.logo} alt="logo" className="logo-medium" />
          </p>
        </div>
      </div>
    );
  }
}

LoginPage.propTypes = {
  tenant: PropTypes.shape({
    name: PropTypes.string.isRequired,
    logo: PropTypes.string.isRequired
  }).isRequired,
  token: PropTypes.string,
  method: PropTypes.string,
  action: PropTypes.string,
  username: PropTypes.string,
  password: PropTypes.string
};