import React, { Component } from 'react';
import { Help } from './Help';

export class LabelInput extends Component {
  state = {
    value: this.props.value,
    loading: false,
  };

  identity(v) {
    return v;
  }

  componentDidMount() {
    const transform = this.props.transform || this.identity;
    if (this.props.from) {
      this.props.from().then(value => this.setState({ value: transform(value) }));
    }
  }

  render() {
    return (
      <div className="form-group row">
        <label className="col-sm-2 control-label">
          {this.props.label} <Help text={this.props.help} />
        </label>
        <div className="col-sm-10">
          {!this.state.loading && <span className="form-control">Loading ...</span>}
          {this.state.loading && <span className="form-control">{this.state.value}</span>}
        </div>
      </div>
    );
  }
}
