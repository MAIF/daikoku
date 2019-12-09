import React, { Component } from 'react';

export class ApiRedoc extends Component {
  componentDidMount() {
    const url = `${window.location.origin}/api/teams/${this.props.teamId}/apis/${this.props.api._id}/swagger.json`;
    // eslint-disable-next-line no-undef
    Redoc.init(
      url,
      {
        scrollYOffset: 50,
        hideHostname: true,
        suppressWarnings: true,
      },
      document.getElementById('redoc-container')
    );
  }
  render() {
    const api = this.props.api;
    if (!api) {
      return null;
    }
    if (!api.swagger) {
      return null;
    }
    return <div id="redoc-container" />;
  }
}
