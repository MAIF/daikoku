import React, { Component } from 'react';
// @ts-expect-error TS(6142): Module './Help' was resolved to '/Users/qaubert/So... Remove this comment to see the full error message
import { Help } from './Help';

import './BooleanInput.css';

// @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
const OnSwitch = (props: any) => <div className="content-switch-button-on" onClick={props.onChange}>
  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
  <div className="switch-button-on" />
</div>;

// @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
const OffSwitch = (props: any) => <div className="content-switch-button-off" onClick={props.onChange}>
  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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

    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return (<div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="mb-3 row">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <label className="col-xs-12 col-sm-2 col-form-label">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Help text={(this.props as any).help} label={(this.props as any).label}/>
          </label>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="col-sm-10">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="row">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="col-sm-6">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {value && <OnSwitch onChange={this.toggleOff}/>}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {!value && <OffSwitch onChange={this.toggleOn}/>}
              </div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="col-sm-6">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {value && <OnSwitch onChange={this.toggleOff} />}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {!value && <OffSwitch onChange={this.toggleOn} />}
      </div>
    );
  }
}
