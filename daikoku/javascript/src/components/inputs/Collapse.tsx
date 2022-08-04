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
            return (<div>
                    <hr />
                    <div className="mb-3 row">
                        <label className="col-sm-2 control-label mb-2"/>
                        <div className="col-sm-10" onClick={this.toggle} style={{ cursor: 'pointer' }}>
                            <span style={{ fontWeight: 'bold', marginTop: 7 }}>{(this.props as any).label}</span>
                            <button type="button" className="btn btn-access-negative pull-right btn-sm" style={{ float: 'right' }} onClick={this.toggle}>
                                <i className="fas fa-eye"/>
              </button>
            </div>
          </div>
                    {(this.props as any).lineEnd && <hr />}
        </div>);
    } else {
            return (<div>
                    <hr />
                    <div className="mb-3 row">
                        <label className="col-sm-2 control-label mb-2"/>
                        <div className="col-sm-10" onClick={this.toggle} style={{ cursor: 'pointer' }}>
                            <span style={{ fontWeight: 'bold', marginTop: 7 }}>{(this.props as any).label}</span>
                            <button type="button" className="btn btn-access-negative pull-right btn-sm" style={{ float: 'right' }} onClick={this.toggle}>
                                <i className="fas fa-eye-slash"/>
              </button>
            </div>
          </div>
          {this.props.children}
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
        return (<div className="col-xs-12 col-sm-3">
                <div className="panel panel-primary" style={{ marginBottom: 0 }}>
                    <div className="panel-heading" style={{ cursor: 'pointer' }} onClick={this.toggle}>
            {(this.props as any).title}
          </div>
                    {!this.state.collapsed && <div className="panel-body">{this.props.children}</div>}
        </div>
      </div>);
  }
}
