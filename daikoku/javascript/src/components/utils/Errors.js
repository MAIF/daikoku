import React, { useContext, useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { I18nContext } from '../../locales/i18n-context';
import { setError, unsetError } from '../../core';

const getErrorLabel = (status, error) => {
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

const ErrorComponent = ({ error, tenant, unsetError }) => {
  const navigate = useNavigate();

  const [label, setLabel] = useState();

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
    <div className="row">
      <div className="col-md-9 offset-3">
        <div className="error-page d-flex flex-column">
          <div>
            <h1 data-h1={error.status}>{error.status}</h1>
            <p data-p={label}>{label}</p>
          </div>
          <div>
            <Link
              className="btn btn-access-negative me-1"
              to="/apis"
              onClick={() => {
                unsetError();
              }}
            >
              <i className="fas fa-home" /> {translateMethod('Go home')}
            </Link>
            <button
              className="btn btn-access-negative"
              onClick={() => {
                navigate(-1);
                setTimeout(unsetError, 300);
              }}
            >
              <i className="fas fa-angle-double-left" /> {translateMethod('go_back')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const mapStateToProps = (state) => ({
  tenant: state.context.tenant,
  error: state.error,
});

const mapDispatchToProps = {
  setError: (error) => setError(error),
  unsetError: () => unsetError(),
};

export const Error = connect(mapStateToProps, mapDispatchToProps)(ErrorComponent);
