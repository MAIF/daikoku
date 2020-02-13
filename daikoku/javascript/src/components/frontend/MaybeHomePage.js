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
    <div className="row">
      <div
        className="tenant-home-page"
        dangerouslySetInnerHTML={{ __html: converter.makeHtml(tenant.unloggedHome || '') }}
      />
    </div>
  );
};

const mapStateToProps = state => ({
  ...state.context,
});

export const MaybeHomePage = connect(mapStateToProps)(MaybeHomePageComponent);
