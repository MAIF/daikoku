import React, { Component } from 'react';

export class ShowApiSecret extends Component {
  state = {
    show: false,
  };

  toggle = () => {
    this.setState({ show: !this.state.show });
  };

  render() {
    if (this.state.show) {
      return (
        <div
          style={{
            width: '100%',
            whiteSpace: 'initial',
          }}>
          <span style={{ marginRight: 5, wordBreak: 'break-all' }}>{this.props.secret}</span>
          <button onClick={this.toggle} type="button" className="btn btn-sm btn-access-negative">
            <i className="fas fa-eye-slash" /> Hide
          </button>
        </div>
      );
    }
    return (
      <div
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
        ************{' '}
        {this.props.secret && (
          <button onClick={this.toggle} type="button" className="btn btn-sm btn-access-negative">
            <i className="fas fa-eye" /> Show
          </button>
        )}
      </div>
    );
  }
}
