import React, { useEffect, useState } from 'react';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import isFunction from 'lodash/isFunction';
import isString from 'lodash/isString';

import { OPEN_MODAL } from '../../core/modal';

type AlertProps = {
    close: (...args: any[]) => any;
    message?: ((...args: any[]) => any) | string;
    title?: string;
    linkOpt?: any;
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

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal show" style={{ display: 'block' }} tabIndex="-1" role="dialog">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="modal-dialog modal-lg" role="document">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="modal-content">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="modal-header">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <h5 className="modal-title">{props.title ? props.title : 'Alert'}</h5>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button type="button" className="btn-close" onClick={props.close}/>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="modal-body">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="modal-description">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {isString(res) && <p>{res}</p>}
                {!isString(res) && !isFunction(res) && res}
                {!isString(res) && isFunction(res) && res(props.close)}
              </div>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="modal-footer">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {props.linkOpt && (<a href={props.linkOpt.to} className="btn btn-secondary" onClick={props.close}>
                  {props.linkOpt.title}
                </a>)}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button type="button" className="btn btn-outline-primary" onClick={props.close}>
                {(props as any).closeMessage ? (props as any).closeMessage : 'Close'}
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-backdrop show"/>
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal show" style={{ display: 'block' }} tabIndex="-1" role="dialog">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="modal-dialog modal-lg" role="document">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="modal-content">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="modal-header">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <h5 className="modal-title">Confirm</h5>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button type="button" className="btn-close" onClick={props.cancel} />
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="modal-body">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="modal-description">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <p>{props.message}</p>
              </div>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="modal-footer">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button type="button" className="btn btn-outline-danger" onClick={props.cancel}>
                Cancel
              </button>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button type="button" className="btn btn-outline-success" onClick={props.ok}>
                Ok
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-backdrop show" />
    </div>
  );
}

type PromptProps = {
    value?: string;
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

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal show" style={{ display: 'block' }} tabIndex="-1" role="dialog">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="modal-dialog modal-lg" role="document">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="modal-content">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="modal-header">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <h5 className="modal-title">{(props as any).title || 'Confirm'}</h5>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button type="button" className="btn-close" onClick={props.cancel}/>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="modal-body">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="modal-description">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <p>{props.message}</p>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <input type={(props as any).isPassword ? 'password' : 'text'} className="form-control" value={text} placeholder={(props as any).placeholder || ''} ref={(r) => (ref = r)} onChange={(e) => setText(e.target.value)}/>
              </div>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="modal-footer">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button type="button" className="btn btn-outline-danger" onClick={props.cancel}>
                Cancel
              </button>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button type="button" className="btn btn-outline-success" onClick={() => props.ok(text)}>
                Ok
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-backdrop show"/>
    </div>);
}

export function registerAlert(store: any) {
  (window as any).oldAlert = window.alert;
  if (!document.getElementById('daikoku-alerts-container')) {
    const div = document.createElement('div');
    div.setAttribute('id', 'daikoku-alerts-container');
    document.body.appendChild(div);
  }
  // @ts-expect-error TS(2322): Type '(message: any, title: any, linkOpt: any, clo... Remove this comment to see the full error message
  window.alert = (message: any, title: any, linkOpt: any, closeMessage: any) => {
    return new Promise((success) => {
      ReactDOM.render(
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Provider store={store}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Alert
            message={message}
            title={title}
            linkOpt={linkOpt}
            // @ts-expect-error TS(2322): Type '{ message: any; title: any; linkOpt: any; cl... Remove this comment to see the full error message
            closeMessage={closeMessage}
            close={() => {
              ReactDOM.unmountComponentAtNode(document.getElementById('daikoku-alerts-container'));
              // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
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
  (window as any).oldConfirm = window.confirm;
  if (!document.getElementById('daikoku-alerts-container')) {
    const div = document.createElement('div');
    div.setAttribute('id', 'daikoku-alerts-container');
    document.body.appendChild(div);
  }
  // @ts-expect-error TS(2322): Type '(message: string | undefined) => Promise<unk... Remove this comment to see the full error message
  window.confirm = (message) => {
    return new Promise((success) => {
      ReactDOM.render(
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Provider store={store}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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

export function registerPrompt(store: any) {
  // @ts-expect-error TS(2551): Property 'prompot' does not exist on type 'Window ... Remove this comment to see the full error message
  (window as any).oldPrompt = window.prompot;
  if (!document.getElementById('daikoku-alerts-container')) {
    const div = document.createElement('div');
    div.setAttribute('id', 'daikoku-alerts-container');
    document.body.appendChild(div);
  }
  // @ts-expect-error TS(2322): Type '(message: any, value: any, isPassword: any, ... Remove this comment to see the full error message
  window.prompt = (message: any, value: any, isPassword: any, title: any, placeholder: any) => {
    return new Promise((success) => {
      ReactDOM.render(
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Provider store={store}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Prompt
            // @ts-expect-error TS(2322): Type '{ isPassword: boolean; message: any; value: ... Remove this comment to see the full error message
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

export function registerContact(store: any) {
  (window as any).contact = (modalProps: any) => store.dispatch({
    type: OPEN_MODAL,
    modalProps,
    modalType: 'contactModal',
});
}
