import React from 'react';
import { connect } from 'react-redux';

const FrontOfficeComponent = (props: any) => {
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <>{!props.error.status && props.children}</>;
};

const mapStateToProps = (state: any) => ({
  error: state.error
});

export const FrontOffice = connect(mapStateToProps)(FrontOfficeComponent);
