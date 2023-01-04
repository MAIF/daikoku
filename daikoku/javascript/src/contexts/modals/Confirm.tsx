import { useContext, useEffect } from "react";
import isFunction from 'lodash/isFunction';
import isString from 'lodash/isString';

import { I18nContext } from "../i18n-context";
import { ConfirmProps } from "./types";

export const Confirm = (props: ConfirmProps) => {
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
  );
}