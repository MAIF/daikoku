import React, { useContext, useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
// @ts-expect-error TS(6142): Module '../../locales/i18n-context' was resolved t... Remove this comment to see the full error message
import { I18nContext } from '../../locales/i18n-context';
import { setError, unsetError } from '../../core';

const getErrorLabel = (status: any, error: any) => {
  // if (status) console.log(status, error);
  if (status === 400) {
    return 'Bad Request';
  } else if (status === 401) {
    return error.message || 'Forbidden';
  } else if (status === 403) {
    return error.message || 'Unauthorized';
  } else if (status === 404) {
    return error.message || 'Page Not Found';
  } else if (status > 399 && status < 500) {
    return 'Client Error';
  } else if (status > 499 && status < 600) {
    return error.message || 'Server Error';
  } else {
    return null;
  }
};

const ErrorComponent = ({
  error,
  tenant,
  unsetError
}: any) => {
  const navigate = useNavigate();

  const [label, setLabel] = useState();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    setLabel(getErrorLabel(error.status, error));
    if (error?.status) {
      document.title = `${tenant.title} - ${translateMethod('Error')}`;
    }
  }, [error, label]);

  if (!label || !error) {
    return null;
  }

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-12">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="error-page d-flex flex-column">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <h1 data-h1={error.status}>{error.status}</h1>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <p data-p={label}>{label}</p>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Link
              className="btn btn-access-negative me-1"
              to="/apis"
              onClick={() => {
                unsetError();
              }}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-home" /> {translateMethod('Go home')}
            </Link>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button
              className="btn btn-access-negative"
              onClick={() => {
                navigate(-1);
                setTimeout(unsetError, 300);
              }}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-angle-double-left" /> {translateMethod('go_back')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const mapStateToProps = (state: any) => ({
  tenant: state.context.tenant,
  error: state.error
});

const mapDispatchToProps = {
  setError: (error: any) => setError(error),
  unsetError: () => unsetError(),
};

export const Error = connect(mapStateToProps, mapDispatchToProps)(ErrorComponent);
