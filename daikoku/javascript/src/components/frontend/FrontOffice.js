import React from 'react';
import { connect } from 'react-redux';

const FrontOfficeComponent = (props) => {
  return (
    <>
      {!props.error.status && props.children}
    </>
  );
};

const mapStateToProps = (state) => ({
  error: state.error,
});

export const FrontOffice = connect(mapStateToProps)(FrontOfficeComponent);
