import React from 'react';
import { connect } from 'react-redux';
import { Redirect } from 'react-router';
import { converter } from '../../services/showdown';
import { Translation } from '../../locales';

const MaybeHomePageComponent = ({ tenant, currentLanguage }) => {
  if (!tenant.homePageVisible) {
    return <Redirect to="/apis" />;
  }
  return (
    <main role="main">
      <section className="organisation__header  mb-4 p-3 d-flex align-items-center justify-content-around">
        <div className="row d-flex justify-content-start align-items-center">
          <div
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '50px',
              border: '3px solid #fff',
              boxShadow: '0px 0px 0px 3px lightgrey',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
            }}>
            <img
              src={tenant.logo}
              style={{
                width: 'auto',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: 'white',
              }}
              alt="avatar"
            />
          </div>
          <h1 className="h1-rwd-reduce ml-2">{tenant.name}</h1>
        </div>

        <div>
          <a className="btn btn-access-negative my-2 ml-2" href={'/apis'}>
            <i className="fas fa-atlas mr-1" />
            <Translation i18nkey="Apis" language={currentLanguage}>
              Apis
            </Translation>
          </a>
        </div>
      </section>

      <section className="container">
        <div className="row">
          <div style={{ width: '100%' }}>
            <div
              className="tenant-home-page"
              dangerouslySetInnerHTML={{ __html: converter.makeHtml(tenant.unloggedHome || '') }}
            />
          </div>
        </div>
      </section>
    </main>
  );
};

const mapStateToProps = state => ({
  ...state.context,
});

export const MaybeHomePage = connect(mapStateToProps)(MaybeHomePageComponent);
