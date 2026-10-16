import { useContext, useEffect } from "react";
import isFunction from 'lodash/isFunction';
import isString from 'lodash/isString';

import { I18nContext } from "../i18n-context";
import { ConfirmProps } from "./types";

export const Confirm = (props: ConfirmProps) => {
  const { translate } = useContext(I18nContext);

  const defaultButton = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && props.defaultCancel) {
      e.preventDefault();
      props.cancel();
      return;
    }
    if (e.key === 'Enter') {
      if (props.defaultCancel) {
        if (e.target instanceof HTMLElement && e.target.closest('button')) return;
        e.preventDefault();
        props.cancel();
      } else {
        props.ok();
      }
    }
  };

  useEffect(() => {
    document.body.addEventListener('keydown', defaultButton);

    return () => document.body.removeEventListener('keydown', defaultButton);
  }, []);

  const res = isFunction(props.message) ? props.message(props.ok, props.cancel) : props.message;

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title" id="modal-title">{props.title || translate("Confirm")}</h5>
        <button type="button" className="btn-close" aria-label={translate('Close')} onClick={props.cancel} />
      </div>
      <div className="modal-body">
        <div className="modal-description">
          {isString(res) && <p>{res}</p>}
          {!isString(res) && !isFunction(res) && res}
          {!isString(res) && isFunction(res) && res(props.ok, props.cancel)}
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn --secondary" autoFocus={props.defaultCancel} onClick={props.cancel}>
          {props.cancelLabel || translate('Cancel')}
        </button>
        <button type="button" className="btn --primary" onClick={props.ok}>
          {props.okLabel || translate('Ok')}
        </button>
      </div>
    </div>
  );
}