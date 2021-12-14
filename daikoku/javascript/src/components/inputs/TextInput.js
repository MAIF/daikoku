import React from 'react';
import { Help } from './Help';

export function TextInput(props) {
  const onChange = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    props.onChange(e.target.value);
  };

  const isColmunFormat = props.isColmunFormat;

  if (props.hide) {
    return null;
  }
  return (
    <div className={`form-group ${isColmunFormat ? '' : 'row'}`}>
      <label
        htmlFor={`input-${props.label}`}
        className={isColmunFormat ? '' : 'col-xs-12 col-sm-2 col-form-label'}
      >
        <Help text={props.help} label={props.label} />
      </label>
      <div className={isColmunFormat ? '' : 'col-sm-10'}>
        {(props.prefix || props.suffix) && (
          <div className="input-group">
            {props.prefix && <div className="input-group-addon">{props.prefix}</div>}
            <input
              type={props.type || 'text'}
              className="form-control"
              disabled={props.disabled}
              id={`input-${props.label}`}
              placeholder={props.placeholder}
              value={props.value || ''}
              onChange={onChange}
            />
            {props.suffix && <div className="input-group-addon">{props.suffix}</div>}
          </div>
        )}
        {!(props.prefix || props.suffix) && (
          <input
            type={props.type || 'text'}
            className="form-control"
            disabled={props.disabled}
            id={`input-${props.label}`}
            placeholder={props.placeholder}
            value={props.value || ''}
            onChange={onChange}
          />
        )}
      </div>
    </div>
  );
}

export function TextareaInput(props) {
  const onChange = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    props.onChange(e.target.value);
  };

  return (
    <div className="form-group row">
      <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
        <Help text={props.help} label={props.label} />
      </label>
      <div className="col-sm-10">
        <textarea
          className="form-control"
          disabled={props.disabled}
          id={`input-${props.label}`}
          placeholder={props.placeholder}
          value={props.value || ''}
          onChange={onChange}
          rows={props.rows || 3}
        />
      </div>
    </div>
  );
}

export function RangeTextInput(props) {
  const onChangeFrom = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    props.onChangeFrom(e.target.value);
  };
  const onChangeTo = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    props.onChangeTo(e.target.value);
  };

  return (
    <div className="form-group row">
      <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
        <Help text={props.help} label={props.label} />
      </label>
      <div className="col-sm-10" style={{ display: 'flex' }}>
        {(props.prefixFrom || props.suffixFrom) && (
          <div className="input-group col-sm-6">
            {props.prefixFrom && <div className="input-group-addon">{props.prefixFrom}</div>}
            <input
              type={props.typeFrom || 'text'}
              className="form-control"
              disabled={props.disabled}
              id={`input-${props.label}`}
              placeholder={props.placeholderFrom}
              value={props.valueFrom || ''}
              onChange={onChangeFrom}
            />
            {props.suffixFrom && <div className="input-group-addon">{props.suffixFrom}</div>}
          </div>
        )}
        {(props.prefixTo || props.suffixTo) && (
          <div className="input-group col-sm-6">
            {props.prefixTo && <div className="input-group-addon">{props.prefixTo}</div>}
            <input
              type={props.typeTo || 'text'}
              className="form-control"
              disabled={props.disabled}
              id={`input-${props.label}`}
              placeholder={props.placeholderTo}
              value={props.valueTo || ''}
              onChange={onChangeTo}
            />
            {props.suffixTo && <div className="input-group-addon">{props.suffixTo}</div>}
          </div>
        )}
        {!(props.prefixFrom || props.suffixFrom) && (
          <div style={{ width: '50%' }}>
            <input
              type={props.typeFrom || 'text'}
              className="form-control col-sm-6"
              disabled={props.disabled}
              id={`input-${props.label}`}
              placeholder={props.placeholderFrom}
              value={props.valueFrom || ''}
              onChange={onChangeFrom}
            />
          </div>
        )}
        {!(props.prefixTo || props.suffixTo) && (
          <div style={{ width: '50%' }}>
            <input
              type={props.typeTo || 'text'}
              className="form-control col-sm-6"
              disabled={props.disabled}
              id={`input-${props.label}`}
              placeholder={props.placeholderTo}
              value={props.valueTo || ''}
              onChange={onChangeTo}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function VerticalTextInput(props) {
  const onChange = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    props.onChange(e.target.value);
  };

  return (
    <div className="form-group row">
      <div className="col-xs-12">
        <label htmlFor={`input-${props.label}`} className="control-label">
          <Help text={props.help} label={props.label} />
        </label>
        <div>
          {(props.prefix || props.suffix) && (
            <div className="input-group">
              {props.prefix && <div className="input-group-addon">{props.prefix}</div>}
              <input
                type={props.type || 'text'}
                className="form-control"
                disabled={props.disabled}
                id={`input-${props.label}`}
                placeholder={props.placeholder}
                value={props.value || ''}
                onChange={onChange}
              />
              {props.suffix && <div className="input-group-addon">{props.suffix}</div>}
            </div>
          )}
          {!(props.prefix || props.suffix) && (
            <input
              type={props.type || 'text'}
              className="form-control"
              disabled={props.disabled}
              id={`input-${props.label}`}
              placeholder={props.placeholder}
              value={props.value || ''}
              onChange={onChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
