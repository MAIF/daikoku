import React from 'react';
import {connect} from 'react-redux';
import {Link} from 'react-router-dom';
import {goBack} from 'connected-react-router';

const getErrorLabel = (status, error) => {
  if (status === 400) {
    return 'Bad Request';
  } else if (status === 401) {
    return 'Forbidden';
  } else if (status === 403) {
    return 'Unauthorized';
  }  else if (status === 404) {
    return error.message || 'Page Not Found';
  } else if (status > 399 && status < 500) {
    return 'Client Error';
  } else if (status > 499 && status < 600) {
    return error.message || 'Server Error';
  } else {
    return null;
  }
};

const ErrorComponent = ({error, goBack}) => {
  const label = getErrorLabel(error.status, error);

  if (!label) {
    return null;
  }
  return (
    <div className="row">
      <div className="col">
        <div className="error-page d-flex flex-column">
          <div>
            <h1 data-h1={error.status}>{error.status}</h1>
            <p data-p={label}>{label}</p>
          </div>
          <div>
            <Link className="btn btn-access-negative mr-1" to="/">
              <i className="fas fa-home"/> Go home
            </Link>
            <button className="btn btn-access-negative" onClick={() => goBack()}>
              <i className="fas fa-angle-double-left"/> Go back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const mapStateToProps = state => ({
  error: state.error,
  router: state.router
});

const mapDispatchToProps = {
  goBack
};

export const Error = connect(mapStateToProps, mapDispatchToProps)(ErrorComponent);