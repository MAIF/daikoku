import { useContext, useEffect, useRef, useState } from "react";
import { I18nContext } from "../i18n-context";
import { PromptProps } from "./types";

export const Prompt = (props: PromptProps) => {
  const { translate } = useContext(I18nContext);

  const [text, setText] = useState(props.value || '');
  const [displayRequiredLabel, setDisplayRequiredLabel] = useState(false);

  const  inputRef = useRef<HTMLInputElement>(null);

  const defaultButton = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      props.ok(text);
    }
  };

  useEffect(() => {
    document.body.addEventListener('keydown', defaultButton);
    if (inputRef.current) {
      inputRef.current.focus();
    }

    return () => document.body.removeEventListener('keydown', defaultButton);
  }, []);

  useEffect(() => {
    if (displayRequiredLabel) {
      setDisplayRequiredLabel(false)
    }
  }, [text])
  

  const handleOK = () => {
    if (!props.required || !!text) {
      props.ok(text)
    } else {
      setDisplayRequiredLabel(true)
    }
  }

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title" id="modal-title">{props.title || translate('Confirm')}</h5>
        <button type="button" className="btn-close" onClick={props.cancel} />
      </div>
      <div className="modal-body">
        <div className="modal-description">
          <p>{props.message}</p>
          <input
            type={props.isPassword ? 'password' : 'text'}
            className="form-control"
            aria-invalid={displayRequiredLabel}
            required={props.required}
            value={text}
            placeholder={props.placeholder || ''}
            ref={inputRef}
            onChange={(e) => setText(e.target.value)} />
        </div>
        {displayRequiredLabel && <span className="color-danger">{translate('constraints.required.value')}</span>}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={props.cancel}>
          {props.cancelLabel || translate('Cancel')}
        </button>
        <button type="button" className="btn btn-outline-success" onClick={() => handleOK()}>
          {props.okLabel || translate('Ok')}
        </button>
      </div>
    </div>
  );
}