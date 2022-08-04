import React, { Component } from 'react';
import { Help } from './Help';

import './BooleanInput.css';

const OnSwitch = (props: any) => <div className="content-switch-button-on" onClick={props.onChange}>
    <div className="switch-button-on" />
</div>;

const OffSwitch = (props: any) => <div className="content-switch-button-off" onClick={props.onChange}>
    <div className="switch-button-off" />
</div>;

export class BooleanInput extends Component {
  toggleOff = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    (this.props as any).onChange(false);
  };

  toggleOn = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    (this.props as any).onChange(true);
  };

  toggle = (value: any) => {
    (this.props as any).onChange(value);
  };

  render() {
    const value = !!(this.props as any).value;

        return (<div>
                <div className="mb-3 row">
                    <label className="col-xs-12 col-sm-2 col-form-label">
                        <Help text={(this.props as any).help} label={(this.props as any).label}/>
          </label>
                    <div className="col-sm-10">
                        <div className="row">
                            <div className="col-sm-6">
                                {value && <OnSwitch onChange={this.toggleOff}/>}
                                {!value && <OffSwitch onChange={this.toggleOn}/>}
              </div>
                            <div className="col-sm-6">
                                {(this.props as any).after && <div className="pull-right">{(this.props as any).after()}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>);
  }
}

export class SimpleBooleanInput extends Component {
  toggleOff = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    (this.props as any).onChange(false);
  };

  toggleOn = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    (this.props as any).onChange(true);
  };

  toggle = (value: any) => {
    (this.props as any).onChange(value);
  };

  render() {
    const value = !!(this.props as any).value;
    return (
            <div>
                {value && <OnSwitch onChange={this.toggleOff} />}
                {!value && <OffSwitch onChange={this.toggleOn} />}
      </div>
    );
  }
}
