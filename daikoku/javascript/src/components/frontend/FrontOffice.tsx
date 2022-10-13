import React from 'react';
import { connect } from 'react-redux';

const FrontOfficeComponent = (props: any) => {
    return <>{!props.error.status && props.children}</>;
};

const mapStateToProps = (state: any) => ({
  error: state.error
});

export const FrontOffice = connect(mapStateToProps)(FrontOfficeComponent);
