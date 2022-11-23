import React, { useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import isFunction from 'lodash/isFunction';
import isString from 'lodash/isString';
import { I18nContext } from "../core";

type TModalContext = {
  alert: (p: AlertModalProps) => Promise<void>,
  confirm: (p: ConfirmModalProps) => Promise<boolean>,
  prompt: (p: PromptModalProps) => Promise<string | undefined >,
}
export type ConfirmModalProps = {
  message: JSX.Element | string | ((ok: () => void, cancel: () => void) => JSX.Element | string)
  title?: string
  okLabel?: string
  cancelLabel?: string
}

export type ConfirmProps = ConfirmModalProps & {
  cancel: () => void;
  ok: () => void;
};

export type PromptModalProps = {
  isPassword?: boolean;
  title?: string;
  value?: string;
  placeholder?: string;
  message?: string;
  cancelLabel?: string
  okLabel?: string
}
export type PromptProps = PromptModalProps & {
  ok: (value: string) => void;
  cancel: () => void;
};

export type AlertModalProps = {
  message: JSX.Element | string | ((close: () => void) => JSX.Element | string);
  title?: string;
  closeMessage?: string
}

export type AlertProps = AlertModalProps & {
  close: () => void;
};


const init: TModalContext = {
  alert: () => Promise.resolve(),
  confirm: () => Promise.resolve(true),
  prompt: () => Promise.resolve("toto"),
}

export const ModalContext = React.createContext<TModalContext>(init);

export const ModalProvider = (props: { children: JSX.Element | Array<JSX.Element> }) => {
  const { open, close, modal, modalContent } = useModal();

  const alert = (props: AlertModalProps) => new Promise<void>((success) => {
    open(<Alert
      {...props}
      close={() => {
        close();
        success();
      }}

    />)
  })

  const confirm = (props: ConfirmModalProps) => new Promise<boolean>((success) => {
    open(<Confirm
      {...props}
      ok={() => {
        success(true);
        close();
      }}
      cancel={() => {
        success(false);
        close();
      }}
    />)
  })

  const prompt = (props: PromptModalProps) => new Promise<string | undefined>((success) => {
    open(<Prompt
      {...props}
      ok={(inputValue) => {
        success(inputValue);
        close();
      }}
      cancel={() => {
        success(undefined);
        close();
      }}
    />)
  });

  return (
    <ModalContext.Provider value={{
      alert,
      confirm,
      prompt
    }}>
      <Modal modal={modal} modalContent={modalContent} />
      {props.children}
    </ModalContext.Provider>
  )
}

// ######### Helpers ###############

const Modal = ({ modal, modalContent }) => {

  if (!modal) {
    return null;
  }

  return createPortal(
    modalContent,
    document.getElementById("portal-root")!
  );
};

const useModal = () => {
  let [modal, setModal] = useState(false);
  let [modalContent, setModalContent] = useState<JSX.Element>();

  const open = (content: JSX.Element) => {
    setModal(true)
    setModalContent(content)
  };
  const close = () => {
    setModal(false)
    setModalContent(undefined)
  };

  return { modal, modalContent, setModalContent, open, close };
};


// ########## MODAL #################

const Alert = (props: AlertProps) => {
  const { translate } = useContext(I18nContext);

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
              <h5 className="modal-title">{props.title ? props.title : translate('Alert')}</h5>
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
              <button type="button" className="btn btn-outline-primary" onClick={props.close}>
                {props?.closeMessage || translate('Close')}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </div>);
}

const Confirm = (props: ConfirmProps) => {
  const { translate } = useContext(I18nContext);

  const defaultButton = (e: any) => {
    if (e.keyCode === 13) {
      props.ok();
    }
  };
  useEffect(() => {
    document.body.addEventListener('keydown', defaultButton);

    return () => document.body.removeEventListener('keydown', defaultButton);
  }, []);

  const res = isFunction(props.message) ? props.message(props.ok, props.cancel) : props.message;

  return (
    <div>
      <div className="modal show" style={{ display: 'block' }} tabIndex={-1} role="dialog">
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{props.title || translate("Confirm")}</h5>
              <button type="button" className="btn-close" onClick={props.cancel} />
            </div>
            <div className="modal-body">
              <div className="modal-description">
                {isString(res) && <p>{res}</p>}
                {!isString(res) && !isFunction(res) && res}
                {!isString(res) && isFunction(res) && res(props.ok, props.cancel)}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-danger" onClick={props.cancel}>
                {props.cancelLabel || translate('Cancel')}
              </button>
              <button type="button" className="btn btn-outline-success" onClick={props.ok}>
                {props.okLabel || translate('Ok')}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </div>
  );
}

const Prompt = (props: PromptProps) => {
  const { translate } = useContext(I18nContext);

  const [text, setText] = useState(props.value || '');

  let ref: any;

  const defaultButton = (e: KeyboardEvent) => {
    if (e.code === "Enter") {
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
            <h5 className="modal-title">{props.title || translate('Confirm')}</h5>
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
                onChange={(e) => setText(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-danger" onClick={props.cancel}>
              {props.cancelLabel || translate('Cancel')}
            </button>
            <button type="button" className="btn btn-outline-success" onClick={() => props.ok(text)}>
              {props.okLabel || translate('Ok')}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div className="modal-backdrop show" />
  </div>);
}