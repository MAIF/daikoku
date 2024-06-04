import React, { PropsWithChildren, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import hljs from 'highlight.js';

import { converter } from '../../../services/showdown';
import { I18nContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';

export function UnauthenticatedHome({ children }: PropsWithChildren) {
  const { Translation } = useContext(I18nContext);
  const location = useLocation();

  const { tenant } = useContext(GlobalContext)
  const content = tenant.unloggedHome || '';
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
                    src={tenant ? tenant.logo : '/assets/images/daikoku.svg'}
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
                {!tenant.title && <h1 className="jumbotron-heading">Your APIs center</h1>}
                {!!tenant.title && (
                  <h1 className="jumbotron-heading">{tenant.title}</h1>
                )}

                {!tenant.description && (
                  <p className="lead">
                    Daikoku is the perfect <a href="https://www.otoroshi.io">Otoroshi</a> companion
                    to manage, document, and expose your beloved APIs to your developpers community.
                    Publish a new API in a few seconds
                  </p>
                )}
                {!!tenant.description && (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: converter.makeHtml(tenant.description || ''),
                    }}
                  ></div>
                )}
                <p>
                  {tenant.authProvider === 'Local' && (
                    <a className="btn btn-outline-primary my-2 ms-2" href={'/signup'}>
                      <i className="fas fa-plus-square me-1" />
                      <Translation i18nkey="Create your account">Create your account</Translation>
                    </a>
                  )}
                  {false && tenant.authProvider === 'Local' && (
                    <a className="btn btn-outline-primary my-2 ms-2" href={'/reset'}>
                      <i className="fas fa-bomb me-1" />
                      <Translation i18nkey="Reset your password">Reset your password</Translation>
                    </a>
                  )}

                  <a className="btn btn-outline-primary my-2 ms-2" href={`/auth/Local/login`}>
                    <i className="fas fa-user me-1" />
                    <Translation i18nkey="Connect to your account">
                      Connect to your account
                    </Translation>
                  </a>
                  {tenant.authProvider !== 'Local' && (
                    <a
                      className="btn btn-outline-primary my-2 ms-2"
                      href={`/auth/${tenant.authProvider}/login`}
                    >
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
      {!!children && (
        <section className="container">
          <div className="row">{children}</div>
        </section>
      )}
      {!children && (
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

function TenantDescription(props: any) {
  useEffect(() => {
    (window as any).$('pre code').each((i: any, block: any) => {
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

