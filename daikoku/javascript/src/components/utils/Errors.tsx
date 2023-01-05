import { useContext, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { I18nContext } from '../../contexts/i18n-context';
import { unsetError } from '../../core';

import { IState, IStateError, ITenant } from '../../types';

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

export const Error = () => {
  const navigate = useNavigate();
  const { translate } = useContext(I18nContext);

  const [label, setLabel] = useState();


  const error = useSelector<IState, IStateError>(s => s.error);
  const tenant = useSelector<IState, ITenant>(s => s.context.tenant);
  const dispatch = useDispatch();

  useEffect(() => {
    setLabel(getErrorLabel(error.status, error));
    if (error?.status) {
      document.title = `${tenant.title} - ${translate('Error')}`;
    }
  }, [error, label]);

  if (!label || !error) {
    return null;
  }

  return (
    <div className="row">
      <div className="col-12">
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
                dispatch(unsetError());
              }}
            >
              <i className="fas fa-home" /> {translate('Go home')}
            </Link>
            <button
              className="btn btn-access-negative"
              onClick={() => {
                Promise.resolve(dispatch(unsetError()))
                  .then(() => navigate(-1));
              }}
            >
              <i className="fas fa-angle-double-left" /> {translate('go_back')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
