import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import _ from 'lodash';

import { closeModal, OPEN_MODAL } from '../../core/modal';
import { t } from '../../locales';

class Alert extends Component {
  defaultButton = (e) => {
    if (e.keyCode === 13) {
      this.props.close();
    }
  };
  componentDidMount() {
    document.body.addEventListener('keydown', this.defaultButton);
  }
  componentWillUnmount() {
    document.body.removeEventListener('keydown', this.defaultButton);
  }
  render() {
    const res = _.isFunction(this.props.message)
      ? this.props.message(this.props.close)
      : this.props.message;
    return (
      <div>
        <div className="modal show" style={{ display: 'block' }} tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{this.props.title ? this.props.title : 'Alert'}</h5>
                <button type="button" className="close" onClick={this.props.close}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="modal-description">
                  {_.isString(res) && <p>{res}</p>}
                  {!_.isString(res) && !_.isFunction(res) && res}
                  {!_.isString(res) && _.isFunction(res) && res(this.props.close)}
                </div>
              </div>
              <div className="modal-footer">
                {this.props.linkOpt && (
                  <a
                    href={this.props.linkOpt.to}
                    className="btn btn-secondary"
                    onClick={this.props.close}>
                    {this.props.linkOpt.title}
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={this.props.close}>
                  {this.props.closeMessage ? this.props.closeMessage : t('Close', this.props.currentLanguage, null, 'Close')}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-backdrop show" />
      </div>
    );
  }
}

Alert.propTypes = {
  close: PropTypes.func.isRequired,
  message: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  title: PropTypes.string,
  linkOpt: PropTypes.object,
};

class Confirm extends Component {
  defaultButton = (e) => {
    if (e.keyCode === 13) {
      this.props.ok();
    }
  };
  componentDidMount() {
    document.body.addEventListener('keydown', this.defaultButton);
  }
  componentWillUnmount() {
    document.body.removeEventListener('keydown', this.defaultButton);
  }
  render() {
    return (
      <div>
        <div className="modal show" style={{ display: 'block' }} tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirm</h5>
                <button type="button" className="close" onClick={this.props.cancel}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="modal-description">
                  <p>{this.props.message}</p>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={this.props.cancel}>
                  Cancel
                </button>
                <button type="button" className="btn btn-outline-success" onClick={this.props.ok}>
                  Ok
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-backdrop show" />
      </div>
    );
  }
}

Confirm.propTypes = {
  cancel: PropTypes.func.isRequired,
  ok: PropTypes.func.isRequired,
  message: PropTypes.string,
};

class Prompt extends Component {
  state = {
    text: this.props.value || '',
  };
  defaultButton = (e) => {
    if (e.keyCode === 13) {
      this.props.ok(this.state.text);
    }
  };
  componentDidMount() {
    document.body.addEventListener('keydown', this.defaultButton);
    if (this.ref) {
      this.ref.focus();
    }
  }
  componentWillUnmount() {
    document.body.removeEventListener('keydown', this.defaultButton);
  }
  render() {
    return (
      <div>
        <div className="modal show" style={{ display: 'block' }} tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{this.props.title || "Confirm"}</h5>
                <button type="button" className="close" onClick={this.props.cancel}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="modal-description">
                  <p>{this.props.message}</p>
                  <input
                    type={this.props.isPassword ? 'password' : 'text'}
                    className="form-control"
                    value={this.state.text}
                    placeholder={this.props.placeholder || ""}
                    ref={(r) => (this.ref = r)}
                    onChange={(e) => this.setState({ text: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={this.props.cancel}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-outline-success"
                  onClick={() => this.props.ok(this.state.text)}>
                  Ok
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-backdrop show" />
      </div>
    );
  }
}

Prompt.propTypes = {
  value: PropTypes.string,
  ok: PropTypes.func.isRequired,
  cancel: PropTypes.func.isRequired,
  message: PropTypes.string,
};

export function registerAlert(store) {
  window.oldAlert = window.alert;
  if (!document.getElementById('daikoku-alerts-container')) {
    const div = document.createElement('div');
    div.setAttribute('id', 'daikoku-alerts-container');
    document.body.appendChild(div);
  }
  window.alert = (message, title, linkOpt, closeMessage, currentLanguage) => {
    return new Promise((success) => {
      ReactDOM.render(
        <Provider store={store}>
          <Alert
            message={message}
            title={title}
            linkOpt={linkOpt}
            closeMessage={closeMessage}
            currentLanguage={currentLanguage}
            close={() => {
              ReactDOM.unmountComponentAtNode(document.getElementById('daikoku-alerts-container'));
              success();
            }}
          />
        </Provider>,
        document.getElementById('daikoku-alerts-container')
      );
    });
  };
}

export function registerConfirm(store) {
  window.oldConfirm = window.confirm;
  if (!document.getElementById('daikoku-alerts-container')) {
    const div = document.createElement('div');
    div.setAttribute('id', 'daikoku-alerts-container');
    document.body.appendChild(div);
  }
  window.confirm = (message) => {
    return new Promise((success) => {
      ReactDOM.render(
        <Provider store={store}>
          <Confirm
            message={message}
            ok={() => {
              success(true);
              ReactDOM.unmountComponentAtNode(document.getElementById('daikoku-alerts-container'));
            }}
            cancel={() => {
              success(false);
              ReactDOM.unmountComponentAtNode(document.getElementById('daikoku-alerts-container'));
            }}
          />
        </Provider>,
        document.getElementById('daikoku-alerts-container')
      );
    });
  };
}

export function registerPrompt(store) {
  window.oldPrompt = window.prompot;
  if (!document.getElementById('daikoku-alerts-container')) {
    const div = document.createElement('div');
    div.setAttribute('id', 'daikoku-alerts-container');
    document.body.appendChild(div);
  }
  window.prompt = (message, value, isPassword, title, placeholder) => {
    return new Promise((success) => {
      ReactDOM.render(
        <Provider store={store}>
          <Prompt
            isPassword={!!isPassword}
            message={message}
            value={value}
            title={title}
            placeholder={placeholder}
            ok={(inputValue) => {
              success(inputValue);
              ReactDOM.unmountComponentAtNode(document.getElementById('daikoku-alerts-container'));
            }}
            cancel={() => {
              success(null);
              ReactDOM.unmountComponentAtNode(document.getElementById('daikoku-alerts-container'));
            }}
          />
        </Provider>,
        document.getElementById('daikoku-alerts-container')
      );
    });
  };
}

export function registerContact(store) {
  window.contact = (modalProps) =>
    store.dispatch({
      type: OPEN_MODAL,
      modalProps,
      modalType: 'contactModal',
    });
}
