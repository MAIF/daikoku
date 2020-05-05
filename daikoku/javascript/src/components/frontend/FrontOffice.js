import React from 'react';
import { connect } from 'react-redux';

import { Error } from '../utils';

const FrontOfficeComponent = (props) => {
  return (
    <>
      {props.error.status && <Error error={props.error} />}
      {!props.error.status && props.children}
    </>
  );
};

const mapStateToProps = (state) => ({
  error: state.error,
});

export const FrontOffice = connect(mapStateToProps)(FrontOfficeComponent);
