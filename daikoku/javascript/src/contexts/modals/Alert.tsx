import { useContext, useEffect } from "react";
import isFunction from 'lodash/isFunction';
import isString from 'lodash/isString';

import { I18nContext } from "../i18n-context";
import { AlertProps } from "./types";

export const Alert = (props: AlertProps) => {
  const { translate } = useContext(I18nContext);

  const defaultButton = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      props.close();
    }
  };

  useEffect(() => {
    document.body.addEventListener('keydown', defaultButton);
    return document.body.removeEventListener('keydown', defaultButton);
  }, []);

  const res = isFunction(props.message) ? props.message(props.close) : props.message;

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title" id="modal-title">{props.title ? props.title : translate('Alert')}</h5>
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
        <button type="button" className="btn btn-outline-info" onClick={props.close}>
          {props?.closeMessage || translate('Close')}
        </button>
      </div>
    </div>
  );
}