import React, { Component } from 'react';
import { connect } from 'react-redux';
import { converter } from '../../../services/showdown';
import hljs from 'highlight.js';

import { Translation } from '../../../locales';

export class UnauthenticatedHomeComponent extends Component {
  state = {};

  componentDidCatch(e) {
    console.log('TeamHomeError', e);
  }

  render() {
    const content = this.props.tenant.unloggedHome || '';
    const displayInformation = (this.props.location ? this.props.location.pathname : "") !== "/2fa";
    
    return (
      <main role="main" className="row">
        {displayInformation && <section className="organisation__header col-12 mb-4 p-3">
          <div className="container">
            <div className="row text-center">
              <div className="col-sm-4">
                <div className="avatar__container">
                  <img
                    src={this.props.tenant ? this.props.tenant.logo : '/assets/images/daikoku.svg'}
                    style={{
                      width: 'auto',
                      height: '100%',
                      borderRadius: '50%',
                      backgroundColor: 'white',
                    }}
                    alt="avatar"
                  />
                </div>
              </div>
              <div className="col-sm-8">
                {!this.props.tenant.title && (
                  <h1 className="jumbotron-heading">Your APIs center</h1>
                )}
                {!!this.props.tenant.title && (
                  <h1 className="jumbotron-heading">{this.props.tenant.title}</h1>
                )}

                {!this.props.tenant.description && (
                  <p className="lead">
                    Daikoku is the perfect <a href="https://www.otoroshi.io">Otoroshi</a> companion
                    to manage, document, and expose your beloved APIs to your developpers community.
                    Publish a new API in a few seconds
                  </p>
                )}
                {!!this.props.tenant.description && (
                  <p className="lead">{this.props.tenant.description}</p>
                )}
                <p>
                  {this.props.tenant.authProvider === 'Local' && (
                    <a className="btn btn-access-negative my-2 ml-2" href={'/signup'}>
                      <i className="fas fa-plus-square mr-1" />
                      <Translation
                        i18nkey="Create your account"
                        language={this.props.currentLanguage}>
                        Create your account
                      </Translation>
                    </a>
                  )}
                  {false && this.props.tenant.authProvider === 'Local' && (
                    <a className="btn btn-access-negative my-2 ml-2" href={'/reset'}>
                      <i className="fas fa-bomb mr-1" />
                      <Translation
                        i18nkey="Reset your password"
                        language={this.props.currentLanguage}>
                        Reset your password
                      </Translation>
                    </a>
                  )}

                  <a className="btn btn-access-negative my-2 ml-2" href={`/auth/Local/login`}>
                    <i className="fas fa-user mr-1" />
                    <Translation
                      i18nkey="Connect to your account"
                      language={this.props.currentLanguage}>
                      Connect to your account
                    </Translation>
                  </a>
                  {this.props.tenant.authProvider !== 'Local' && (
                    <a
                      className="btn btn-access-negative my-2 ml-2"
                      href={`/auth/${this.props.tenant.authProvider}/login`}>
                      <i className="fas fa-user mr-1" />
                      <Translation
                        i18nkey="Connect to your thrid party account"
                        language={this.props.currentLanguage}>
                        Connect to your thrid party account
                      </Translation>
                    </a>
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>}
        {!!this.props.children && (
          <section className="container">
            <div className="row">{this.props.children}</div>
          </section>
        )}
        {!this.props.children && (
          <section className="container">
            <div className="row">
              <div style={{ width: '100%' }}>
                <TenantDescription content={content} />
              </div>
            </div>
          </section>
        )}
      </main>
    );
  }
}

class TenantDescription extends Component {
  componentDidMount() {
    window.$('pre code').each((i, block) => {
      hljs.highlightBlock(block);
    });
  }

  render() {
    const content = this.props.content || '';
    return (
      <div className="d-flex col flex-column p-3">
        <div
          className="api-description"
          dangerouslySetInnerHTML={{ __html: converter.makeHtml(content) }}
        />
      </div>
    );
  }
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const UnauthenticatedHome = connect(mapStateToProps)(UnauthenticatedHomeComponent);
