import React, { Component } from 'react';

import {BeautifulTitle} from '../utils'

export class Help extends Component {
  render() {
    if (this.props.text) {
      return (
        <BeautifulTitle place={this.props.place} title={this.props.text}>
          <i
            className="fas fa-question-circle ml-1"
          />
        </BeautifulTitle>
      );
    }
    return null;
  }
}
