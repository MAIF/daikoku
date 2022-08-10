import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import isFunction from 'lodash/isFunction';
import isString from 'lodash/isString';

import { OPEN_MODAL } from '../../core/modal';

type AlertProps = {
  close: (...args: any[]) => any;
  message?: ((...args: any[]) => any) | string;
  title?: string;
  linkOpt?: { title: string, to: string };
  closeMessage?: string
};

function Alert(props: AlertProps) {
  const defaultButton = (e: any) => {
    if (e.keyCode === 13) {
      props.close();
    }
  };

  useEffect(() => {
    document.body.addEventListener('keydown', defaultButton);
    return document.body.removeEventListener('keydown', defaultButton);
  }, []);

  const res = isFunction(props.message) ? props.message(props.close) : props.message;

  return (
    <div>
      <div className="modal show" style={{ display: 'block' }} tabIndex={-1} role="dialog">
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{props.title ? props.title : 'Alert'}</h5>
              <button type="button" className="btn-close" onClick={props.close} />
            </div>
            <div className="modal-body">
              <div className="modal-description">
                {isString(res) && <p>{res}</p>}
                {!isString(res) && !isFunction(res) && res}
                {!isString(res) && isFunction(res) && res(props.close)}
              </div>
            </div>
            <div className="modal-footer">
              {props.linkOpt && (<a href={props.linkOpt.to} className="btn btn-secondary" onClick={props.close}>
                {props.linkOpt.title}
              </a>)}
              <button type="button" className="btn btn-outline-primary" onClick={props.close}>
                {props?.closeMessage || 'Close'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </div>);
}

type ConfirmProps = {
  cancel: (...args: any[]) => any;
  ok: (...args: any[]) => any;
  message?: string;
};

function Confirm(props: ConfirmProps) {
  const defaultButton = (e: any) => {
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
      <div className="modal show" style={{ display: 'block' }} tabIndex={-1} role="dialog">
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

type PromptProps = {
  isPassword: boolean;
  title: string;
  value?: string;
  placeholder?: string;
  ok: (...args: any[]) => any;
  cancel: (...args: any[]) => any;
  message?: string;
};

function Prompt(props: PromptProps) {
  const [text, setText] = useState(props.value || '');

  let ref: any;

  const defaultButton = (e: any) => {
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

  return (<div>
    <div className="modal show" style={{ display: 'block' }} tabIndex={-1} role="dialog">
      <div className="modal-dialog modal-lg" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{(props as any).title || 'Confirm'}</h5>
            <button type="button" className="btn-close" onClick={props.cancel} />
          </div>
          <div className="modal-body">
            <div className="modal-description">
              <p>{props.message}</p>
              <input type={(props as any).isPassword ? 'password' : 'text'} className="form-control" value={text} placeholder={(props as any).placeholder || ''} ref={(r) => (ref = r)} onChange={(e) => setText(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-danger" onClick={props.cancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-outline-success" onClick={() => props.ok(text)}>
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
    <div className="modal-backdrop show" />
  </div>);
}

export function registerAlert(store: any) {
  //@ts-ignore //FIXME when monkey-patch & ts will be compatible

  window.oldAlert = window.alert;
  if (!document.getElementById('daikoku-alerts-container')) {
    const div = document.createElement('div');
    div.setAttribute('id', 'daikoku-alerts-container');
    document.body.appendChild(div);
  }
  //@ts-ignore
  window.alert = (message: string, title: string, linkOpt: any, closeMessage: string) => {
    return new Promise<void>((success) => {
      ReactDOM.render(
        <Provider store={store}>
          <Alert
            message={message}
            title={title}
            linkOpt={linkOpt}
            closeMessage={closeMessage}
            close={() => {
              ReactDOM.unmountComponentAtNode(document.getElementById('daikoku-alerts-container') as Element);
              success();
            }}
          />
        </Provider>,
        document.getElementById('daikoku-alerts-container')
      );
    });
  };
}

export function registerConfirm(store: any) {
  //@ts-ignore //FIXME when monkey-patch & ts will be compatible
  window.oldConfirm = window.confirm;
  if (!document.getElementById('daikoku-alerts-container')) {
    const div = document.createElement('div');
    div.setAttribute('id', 'daikoku-alerts-container');
    document.body.appendChild(div);
  }
  //@ts-ignore
  window.confirm = (message) => {
    return new Promise((success) => {
      ReactDOM.render(
        <Provider store={store}>
          <Confirm
            message={message}
            ok={() => {
              success(true);
              ReactDOM.unmountComponentAtNode(document.getElementById('daikoku-alerts-container') as Element);
            }}
            cancel={() => {
              success(false);
              ReactDOM.unmountComponentAtNode(document.getElementById('daikoku-alerts-container') as Element);
            }}
          />
        </Provider>,
        document.getElementById('daikoku-alerts-container')
      );
    });
  };
}

export function registerPrompt(store: any) {
  //@ts-ignore //FIXME when monkey-patch & ts will be compatible
  window.oldPrompt = window.prompt;
  if (!document.getElementById('daikoku-alerts-container')) {
    const div = document.createElement('div');
    div.setAttribute('id', 'daikoku-alerts-container');
    document.body.appendChild(div);
  }

  //@ts-ignore
  window.prompt = (message: string, value: string, isPassword: boolean, title: string, placeholder?: string) => {
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
              ReactDOM.unmountComponentAtNode(document.getElementById('daikoku-alerts-container') as Element);
            }}
            cancel={() => {
              success(null);
              ReactDOM.unmountComponentAtNode(document.getElementById('daikoku-alerts-container') as Element);
            }}
          />
        </Provider>,
        document.getElementById('daikoku-alerts-container')
      );
    });
  };
}

export function registerContact(store: any) {
  (window as any).contact = (modalProps: any) => store.dispatch({
    type: OPEN_MODAL,
    modalProps,
    modalType: 'contactModal',
  });
}
