import React, { Component } from 'react';

export class UnauthenticatedFooter extends Component {
  render() {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <footer>Ce footer est vide: veuillez le remplir</footer>;
  }
}
