import React, { useContext, useState } from 'react';
import { CurrentUserContext } from '../../../contexts/userContext';

export const UnauthenticatedTopBar = () => {
  const { tenant } = useContext(CurrentUserContext)
  const [error, setError] = useState<string>()

  const userMenu = () => {
    return (
      <div className="dropdown-menu dropdown-menu-right">
        <a className="dropdown-item" href="/signup">
          <i className="fas fa-sign-out-alt" />
          Sign up
        </a>
      </div>
    );
  };

  return (<header>

    <div className="navbar shadow-sm fixed-top">
      <div className="container-fluid d-flex justify-content-center justify-content-sm-between">
        <a href="/" className="navbar-brand d-flex align-items-center" title="Daikoku home">
          {tenant.name}
        </a>
        <div className="d-flex">
          <div className="dropdown">
            <div className="img__container d-flex align-items-cennter justify-content-center" style={{ width: 38, height: 38 }}>
              <img style={{ width: '100%', height: 'auto' }} src={tenant.logo || '/assets/images/daikoku.svg'} className="dropdown-toggle logo-anonymous user-logo" data-toggle="dropdown" alt="dropdown" />
            </div>
            {userMenu()}
          </div>
          <div className="dropdown hide">
            <button className="navbar-toggler" type="button" data-toggle="dropdown">
              <span className="navbar-toggler-icon" />
            </button>
            {userMenu()}
          </div>
        </div>
      </div>
    </div>
    {error && (<div className="alert alert-danger alert-dismissible fade show mb-0" role="alert">
      <strong>Holy guacamole!</strong> {error}.
      <button type="button" className="btn-close" onClick={() => setError(undefined)} aria-label="Close" />
    </div>)}
  </header>);
}
