import React, { useContext, useEffect } from 'react';
import { connect } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { converter } from '../../../services/showdown';
import hljs from 'highlight.js';
import { I18nContext } from '../../../core';

export function UnauthenticatedHomeComponent(props) {
  const { Translation } = useContext(I18nContext);
  const location = useLocation();

  const content = props.tenant.unloggedHome || '';
  const pathname = location ? location.pathname : '';
  const displayInformation = pathname !== '/2fa' && pathname !== '/signup';

  return (
    <main role="main">
      {displayInformation && (
        <section className="organisation__header col-12 mb-4 p-3">
          <div className="container">
            <div className="row text-center">
              <div className="col-sm-4">
                <div className="avatar__container">
                  <img
                    src={props.tenant ? props.tenant.logo : '/assets/images/daikoku.svg'}
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
                {!props.tenant.title && <h1 className="jumbotron-heading">Your APIs center</h1>}
                {!!props.tenant.title && (
                  <h1 className="jumbotron-heading">{props.tenant.title}</h1>
                )}

                {!props.tenant.description && (
                  <p className="lead">
                    Daikoku is the perfect <a href="https://www.otoroshi.io">Otoroshi</a> companion
                    to manage, document, and expose your beloved APIs to your developpers community.
                    Publish a new API in a few seconds
                  </p>
                )}
                {!!props.tenant.description && (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: converter.makeHtml(props.tenant.description || ''),
                    }}></div>
                )}
                <p>
                  {props.tenant.authProvider === 'Local' && (
                    <a className="btn btn-access-negative my-2 ms-2" href={'/signup'}>
                      <i className="fas fa-plus-square me-1" />
                      <Translation i18nkey="Create your account">Create your account</Translation>
                    </a>
                  )}
                  {false && props.tenant.authProvider === 'Local' && (
                    <a className="btn btn-access-negative my-2 ms-2" href={'/reset'}>
                      <i className="fas fa-bomb me-1" />
                      <Translation i18nkey="Reset your password">Reset your password</Translation>
                    </a>
                  )}

                  <a className="btn btn-access-negative my-2 ms-2" href={`/auth/Local/login`}>
                    <i className="fas fa-user me-1" />
                    <Translation i18nkey="Connect to your account">
                      Connect to your account
                    </Translation>
                  </a>
                  {props.tenant.authProvider !== 'Local' && (
                    <a
                      className="btn btn-access-negative my-2 ms-2"
                      href={`/auth/${props.tenant.authProvider}/login`}>
                      <i className="fas fa-user me-1" />
                      <Translation i18nkey="Connect to your thrid party account">
                        Connect to your thrid party account
                      </Translation>
                    </a>
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
      {!!props.children && (
        <section className="container">
          <div className="row">{props.children}</div>
        </section>
      )}
      {!props.children && (
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

function TenantDescription(props) {
  useEffect(() => {
    window.$('pre code').each((i, block) => {
      hljs.highlightElement(block);
    });
  }, []);

  const content = props.content || '';
  return (
    <div className="d-flex col flex-column p-3">
      <div
        className="api-description"
        dangerouslySetInnerHTML={{ __html: converter.makeHtml(content) }}
      />
    </div>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const UnauthenticatedHome = connect(mapStateToProps)(UnauthenticatedHomeComponent);
