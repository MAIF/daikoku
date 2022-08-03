import React, { useContext, useEffect } from 'react';
import { connect } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { converter } from '../../../services/showdown';
import hljs from 'highlight.js';
import { I18nContext } from '../../../core';

export function UnauthenticatedHomeComponent(props: any) {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);
  const location = useLocation();
  const navigate = useNavigate();

  const content = props.tenant.unloggedHome || '';
  const pathname = location ? location.pathname : '';
  const displayInformation = pathname !== '/2fa' && pathname !== '/signup';

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <main role="main">
      {displayInformation && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <section className="organisation__header col-12 mb-4 p-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="container">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="row text-center">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="col-sm-4">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="avatar__container">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="col-sm-8">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {!props.tenant.title && <h1 className="jumbotron-heading">Your APIs center</h1>}
                {!!props.tenant.title && (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <h1 className="jumbotron-heading">{props.tenant.title}</h1>
                )}

                {!props.tenant.description && (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <p className="lead">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    Daikoku is the perfect <a href="https://www.otoroshi.io">Otoroshi</a> companion
                    to manage, document, and expose your beloved APIs to your developpers community.
                    Publish a new API in a few seconds
                  </p>
                )}
                {!!props.tenant.description && (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <div
                    dangerouslySetInnerHTML={{
                      __html: converter.makeHtml(props.tenant.description || ''),
                    }}
                  ></div>
                )}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <p>
                  {props.tenant.authProvider === 'Local' && (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <a className="btn btn-access-negative my-2 ms-2" href={'/signup'}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="fas fa-plus-square me-1" />
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <Translation i18nkey="Create your account">Create your account</Translation>
                    </a>
                  )}
                  {false && props.tenant.authProvider === 'Local' && (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <a className="btn btn-access-negative my-2 ms-2" href={'/reset'}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="fas fa-bomb me-1" />
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <Translation i18nkey="Reset your password">Reset your password</Translation>
                    </a>
                  )}

                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <a className="btn btn-access-negative my-2 ms-2" href={`/auth/Local/login`}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-user me-1" />
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Translation i18nkey="Connect to your account">
                      Connect to your account
                    </Translation>
                  </a>
                  {props.tenant.authProvider !== 'Local' && (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <a
                      className="btn btn-access-negative my-2 ms-2"
                      href={`/auth/${props.tenant.authProvider}/login`}
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="fas fa-user me-1" />
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <section className="container">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="row">{props.children}</div>
        </section>
      )}
      {!props.children && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <section className="container">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="row">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div style={{ width: '100%' }}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex col flex-column p-3">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div
        className="api-description"
        dangerouslySetInnerHTML={{ __html: converter.makeHtml(content) }}
      />
    </div>
  );
}

const mapStateToProps = (state: any) => ({
  ...state.context
});

export const UnauthenticatedHome = connect(mapStateToProps)(UnauthenticatedHomeComponent);
