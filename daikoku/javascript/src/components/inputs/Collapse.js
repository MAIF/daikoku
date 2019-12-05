import React, { Component } from 'react';

export class Collapse extends Component {
  state = {
    collapsed: this.props.initCollapsed || this.props.collapsed,
  };

  toggle = e => {
    if (e && e.preventDefault) e.preventDefault();
    this.setState({ collapsed: !this.state.collapsed });
  };

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (nextProps.collapsed !== this.props.collapsed) {
      this.setState({ collapsed: nextProps.collapsed });
    }
  }

  render() {
    if (this.state.collapsed) {
      return (
        <div>
          <hr />
          <div className="form-group row">
            <label className="col-sm-2 control-label" />
            <div className="col-sm-10" onClick={this.toggle} style={{ cursor: 'pointer' }}>
              <span style={{  fontWeight: 'bold', marginTop: 7 }}>
                {this.props.label}
              </span>
              <button
                type="button"
                className="btn btn-access-negative pull-right btn-sm"
                style={{ float: 'right' }}
                onClick={this.toggle}>
                <i className="fas fa-eye" />
              </button>
            </div>
          </div>
          {this.props.lineEnd && <hr />}
        </div>
      );
    } else {
      return (
        <div>
          <hr />
          <div className="form-group row">
            <label className="col-sm-2 control-label" />
            <div className="col-sm-10" onClick={this.toggle} style={{ cursor: 'pointer' }}>
              <span style={{  fontWeight: 'bold', marginTop: 7 }}>
                {this.props.label}
              </span>
              <button
                type="button"
                className="btn btn-access-negative pull-right btn-sm"
                style={{ float: 'right' }}
                onClick={this.toggle}>
                <i className="fas fa-eye-slash" />
              </button>
            </div>
          </div>
          {this.props.children}
          {this.props.lineEnd && <hr />}
        </div>
      );
    }
  }
}

export class Panel extends Component {
  state = {
    collapsed: this.props.initCollapsed || this.props.collapsed,
  };

  toggle = e => {
    if (e && e.preventDefault) e.preventDefault();
    this.setState({ collapsed: !this.state.collapsed });
  };

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (nextProps.collapsed !== this.props.collapsed) {
      this.setState({ collapsed: nextProps.collapsed });
    }
  }

  render() {
    return (
      <div className="col-xs-12 col-sm-3">
        <div className="panel panel-primary" style={{ marginBottom: 0 }}>
          <div className="panel-heading" style={{ cursor: 'pointer' }} onClick={this.toggle}>
            {this.props.title}
          </div>
          {!this.state.collapsed && <div className="panel-body">{this.props.children}</div>}
        </div>
      </div>
    );
  }
}
