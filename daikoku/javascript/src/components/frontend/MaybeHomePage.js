import React from 'react';
import { connect } from 'react-redux';
import { Redirect } from 'react-router';
import { converter } from '../../services/showdown';

const MaybeHomePageComponent = ({ tenant, connectedUser }) => {
  if (!tenant.homePageVisible || connectedUser._humanReadableId) {
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

const mapStateToProps = (state) => ({
  ...state.context,
});

export const MaybeHomePage = connect(mapStateToProps)(MaybeHomePageComponent);
