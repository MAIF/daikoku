import React, { Component } from 'react';

type State = any;

export class UnauthenticatedTopBar extends Component<{}, State> {
  removeError: any;
  state = {};

  userMenu = () => {
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div className="dropdown-menu dropdown-menu-right">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <a className="dropdown-item" href="/signup">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className="fas fa-sign-out-alt" /> Sign up
        </a>
      </div>
    );
  };

  render() {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return (<header>
        
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="navbar shadow-sm fixed-top">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="container-fluid d-flex justify-content-center justify-content-sm-between">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <a href="/" className="navbar-brand d-flex align-items-center" title="Daikoku home">
              {(this.props as any).tenant.name}
            </a>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="d-flex">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="dropdown">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="img__container d-flex align-items-cennter justify-content-center" style={{ width: 38, height: 38 }}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <img style={{ width: '100%', height: 'auto' }} src={(this.props as any).tenant.logo || '/assets/images/daikoku.svg'} className="dropdown-toggle logo-anonymous user-logo" data-toggle="dropdown" alt="dropdown"/>
                </div>
                {this.userMenu()}
              </div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="dropdown hide">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <button className="navbar-toggler" type="button" data-toggle="dropdown">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <span className="navbar-toggler-icon"/>
                </button>
                {this.userMenu()}
              </div>
            </div>
          </div>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {(this.state as any).error && (<div className="alert alert-danger alert-dismissible fade show mb-0" role="alert">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <strong>Holy guacamole!</strong> {(this.state as any).error}.
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button type="button" className="btn-close" onClick={this.removeError} aria-label="Close"/>
          </div>)}
      </header>);
  }
}
