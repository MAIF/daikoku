import React, { Component } from 'react';

type CollapseState = any;

export class Collapse extends Component<{}, CollapseState> {
  state = {
    collapsed: (this.props as any).initCollapsed || (this.props as any).collapsed,
};

  toggle = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    this.setState({ collapsed: !this.state.collapsed });
  };

  UNSAFE_componentWillReceiveProps(nextProps: any) {
    if (nextProps.collapsed !== (this.props as any).collapsed) {
      this.setState({ collapsed: nextProps.collapsed });
    }
  }

  render() {
    if (this.state.collapsed) {
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return (<div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <hr />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="mb-3 row">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <label className="col-sm-2 control-label mb-2"/>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-sm-10" onClick={this.toggle} style={{ cursor: 'pointer' }}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span style={{ fontWeight: 'bold', marginTop: 7 }}>{(this.props as any).label}</span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button type="button" className="btn btn-access-negative pull-right btn-sm" style={{ float: 'right' }} onClick={this.toggle}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-eye"/>
              </button>
            </div>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {(this.props as any).lineEnd && <hr />}
        </div>);
    } else {
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return (<div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <hr />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="mb-3 row">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <label className="col-sm-2 control-label mb-2"/>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-sm-10" onClick={this.toggle} style={{ cursor: 'pointer' }}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span style={{ fontWeight: 'bold', marginTop: 7 }}>{(this.props as any).label}</span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button type="button" className="btn btn-access-negative pull-right btn-sm" style={{ float: 'right' }} onClick={this.toggle}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-eye-slash"/>
              </button>
            </div>
          </div>
          {this.props.children}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {(this.props as any).lineEnd && <hr />}
        </div>);
    }
  }
}

type PanelState = any;

export class Panel extends Component<{}, PanelState> {
  state = {
    collapsed: (this.props as any).initCollapsed || (this.props as any).collapsed,
};

  toggle = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    this.setState({ collapsed: !this.state.collapsed });
  };

  UNSAFE_componentWillReceiveProps(nextProps: any) {
    if (nextProps.collapsed !== (this.props as any).collapsed) {
      this.setState({ collapsed: nextProps.collapsed });
    }
  }

  render() {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return (<div className="col-xs-12 col-sm-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="panel panel-primary" style={{ marginBottom: 0 }}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="panel-heading" style={{ cursor: 'pointer' }} onClick={this.toggle}>
            {(this.props as any).title}
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {!this.state.collapsed && <div className="panel-body">{this.props.children}</div>}
        </div>
      </div>);
  }
}
