import React, { Component } from 'react';
import { Help } from './Help';

import './BooleanInput.css';

const OnSwitch = (props) => (
  <div className="content-switch-button-on" onClick={props.onChange}>
    <div className="switch-button-on" />
  </div>
);

const OffSwitch = (props) => (
  <div className="content-switch-button-off" onClick={props.onChange}>
    <div className="switch-button-off" />
  </div>
);

export class BooleanInput extends Component {
  toggleOff = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    this.props.onChange(false);
  };

  toggleOn = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    this.props.onChange(true);
  };

  toggle = (value) => {
    this.props.onChange(value);
  };

  render() {
    const value = !!this.props.value;

    return (
      <div>
        <div className="form-group row">
          <label className="col-xs-12 col-sm-2 col-form-label">
            <Help text={this.props.help} label={this.props.label} />
          </label>
          <div className="col-sm-10">
            <div className="row">
              <div className="col-sm-6">
                {value && <OnSwitch onChange={this.toggleOff} />}
                {!value && <OffSwitch onChange={this.toggleOn} />}
              </div>
              <div className="col-sm-6">
                {this.props.after && <div className="pull-right">{this.props.after()}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export class SimpleBooleanInput extends Component {
  toggleOff = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    this.props.onChange(false);
  };

  toggleOn = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    this.props.onChange(true);
  };

  toggle = (value) => {
    this.props.onChange(value);
  };

  render() {
    const value = !!this.props.value;
    return (
      <div>
        {value && <OnSwitch onChange={this.toggleOff} />}
        {!value && <OffSwitch onChange={this.toggleOn} />}
      </div>
    );
  }
}
