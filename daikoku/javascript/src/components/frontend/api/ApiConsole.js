import React, { Component } from 'react';
import * as Services from '../../../services';

export class ApiConsole extends Component {
  state = {
    team: { name: '--' },
  };

  componentDidMount() {
    // TODO: this current team is actually needed by the api
    Services.oneOfMyTeam(this.props.teamId).then((team) => this.setState({ team }));
  }

  render() {
    const api = this.props.api;
    if (!api) {
      return null;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', padding: 20, width: '80%' }}>
        <p>Api live testing is coming soon !</p>
      </div>
    );
  }
}
