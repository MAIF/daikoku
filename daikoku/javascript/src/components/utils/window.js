import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import _ from 'lodash';

import { OPEN_MODAL } from '../../core/modal';

function Alert(props) {
  const defaultButton = (e) => {
    if (e.keyCode === 13) {
      props.close();
    }
  };

  useEffect(() => {
    document.body.addEventListener('keydown', defaultButton);

    return document.body.removeEventListener('keydown', defaultButton);
  }, []);

  const res = _.isFunction(props.message) ? props.message(props.close) : props.message;

  return (
    <div>
      <div className="modal show" style={{ display: 'block' }} tabIndex="-1" role="dialog">
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{props.title ? props.title : 'Alert'}</h5>
              <button type="button" className="btn-close" onClick={props.close} />
            </div>
            <div className="modal-body">
              <div className="modal-description">
                {_.isString(res) && <p>{res}</p>}
                {!_.isString(res) && !_.isFunction(res) && res}
                {!_.isString(res) && _.isFunction(res) && res(props.close)}
              </div>
            </div>
            <div className="modal-footer">
              {props.linkOpt && (
                <a href={props.linkOpt.to} className="btn btn-secondary" onClick={props.close}>
                  {props.linkOpt.title}
                </a>
              )}
              <button type="button" className="btn btn-outline-primary" onClick={props.close}>
                {props.closeMessage ? props.closeMessage : 'Close'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </div>
  );
}

Alert.propTypes = {
  close: PropTypes.func.isRequired,
  message: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  title: PropTypes.string,
  linkOpt: PropTypes.object,
};

function Confirm(props) {
  const defaultButton = (e) => {
    if (e.keyCode === 13) {
      props.ok();
    }
  };
  useEffect(() => {
    document.body.addEventListener('keydown', defaultButton);

    return () => document.body.removeEventListener('keydown', defaultButton);
  }, []);

  return (
    <div>
      <div className="modal show" style={{ display: 'block' }} tabIndex="-1" role="dialog">
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Confirm</h5>
              <button type="button" className="btn-close" onClick={props.cancel} />
            </div>
            <div className="modal-body">
              <div className="modal-description">
                <p>{props.message}</p>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-danger" onClick={props.cancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-outline-success" onClick={props.ok}>
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

Confirm.propTypes = {
  cancel: PropTypes.func.isRequired,
  ok: PropTypes.func.isRequired,
  message: PropTypes.string,
};

function Prompt(props) {
  const [text, setText] = useState(props.value || '');

  let ref;

  const defaultButton = (e) => {
    if (e.keyCode === 13) {
      props.ok(text);
    }
  };

  useEffect(() => {
    document.body.addEventListener('keydown', defaultButton);
    if (ref) {
      ref.focus();
    }

    return () => document.body.removeEventListener('keydown', defaultButton);
  }, []);

  return (
    <div>
      <div className="modal show" style={{ display: 'block' }} tabIndex="-1" role="dialog">
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{props.title || 'Confirm'}</h5>
              <button type="button" className="btn-close" onClick={props.cancel} />
            </div>
            <div className="modal-body">
              <div className="modal-description">
                <p>{props.message}</p>
                <input
                  type={props.isPassword ? 'password' : 'text'}
                  className="form-control"
                  value={text}
                  placeholder={props.placeholder || ''}
                  ref={(r) => (ref = r)}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-danger" onClick={props.cancel}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-outline-success"
                onClick={() => props.ok(text)}
              >
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
  window.alert = (message, title, linkOpt, closeMessage) => {
    return new Promise((success) => {
      ReactDOM.render(
        <Provider store={store}>
          <Alert
            message={message}
            title={title}
            linkOpt={linkOpt}
            closeMessage={closeMessage}
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
