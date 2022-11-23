import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import isFunction from 'lodash/isFunction';
import isString from 'lodash/isString';

import { OPEN_MODAL } from '../../core/modal';
import { AlertModalProps } from '../../contexts';

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

export function registerContact(store: any) {
  (window as any).contact = (modalProps: any) => store.dispatch({
    type: OPEN_MODAL,
    modalProps,
    modalType: 'contactModal',
  });
}
