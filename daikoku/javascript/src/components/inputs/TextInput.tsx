import React from 'react';
// @ts-expect-error TS(6142): Module './Help' was resolved to '/Users/qaubert/So... Remove this comment to see the full error message
import { Help } from './Help';

export function TextInput(props: any) {
  const onChange = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    props.onChange(e.target.value);
  };

  const isColmunFormat = props.isColmunFormat;

  if (props.hide) {
    return null;
  }
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className={`mb-3 ${isColmunFormat ? '' : 'row'}`}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <label
        htmlFor={`input-${props.label}`}
        className={isColmunFormat ? '' : 'col-xs-12 col-sm-2 col-form-label'}
      >
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Help text={props.help} label={props.label} />
      </label>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className={isColmunFormat ? '' : 'col-sm-10'}>
        {(props.prefix || props.suffix) && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="input-group">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {props.prefix && <div className="input-group-addon">{props.prefix}</div>}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input
              type={props.type || 'text'}
              className="form-control"
              disabled={props.disabled}
              id={`input-${props.label}`}
              placeholder={props.placeholder}
              value={props.value || ''}
              onChange={onChange}
            />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {props.suffix && <div className="input-group-addon">{props.suffix}</div>}
          </div>
        )}
        {!(props.prefix || props.suffix) && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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

export function TextareaInput(props: any) {
  const onChange = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    props.onChange(e.target.value);
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Help text={props.help} label={props.label} />
      </label>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-sm-10">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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

export function RangeTextInput(props: any) {
  const onChangeFrom = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    props.onChangeFrom(e.target.value);
  };
  const onChangeTo = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    props.onChangeTo(e.target.value);
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Help text={props.help} label={props.label} />
      </label>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-sm-10" style={{ display: 'flex' }}>
        {(props.prefixFrom || props.suffixFrom) && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="input-group col-sm-6">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {props.prefixFrom && <div className="input-group-addon">{props.prefixFrom}</div>}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input
              type={props.typeFrom || 'text'}
              className="form-control"
              disabled={props.disabled}
              id={`input-${props.label}`}
              placeholder={props.placeholderFrom}
              value={props.valueFrom || ''}
              onChange={onChangeFrom}
            />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {props.suffixFrom && <div className="input-group-addon">{props.suffixFrom}</div>}
          </div>
        )}
        {(props.prefixTo || props.suffixTo) && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="input-group col-sm-6">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {props.prefixTo && <div className="input-group-addon">{props.prefixTo}</div>}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input
              type={props.typeTo || 'text'}
              className="form-control"
              disabled={props.disabled}
              id={`input-${props.label}`}
              placeholder={props.placeholderTo}
              value={props.valueTo || ''}
              onChange={onChangeTo}
            />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {props.suffixTo && <div className="input-group-addon">{props.suffixTo}</div>}
          </div>
        )}
        {!(props.prefixFrom || props.suffixFrom) && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div style={{ width: '50%' }}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div style={{ width: '50%' }}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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

export function VerticalTextInput(props: any) {
  const onChange = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    props.onChange(e.target.value);
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-xs-12">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <label htmlFor={`input-${props.label}`} className="control-label mb-2">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Help text={props.help} label={props.label} />
        </label>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div>
          {(props.prefix || props.suffix) && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div className="input-group">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {props.prefix && <div className="input-group-addon">{props.prefix}</div>}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <input
                type={props.type || 'text'}
                className="form-control"
                disabled={props.disabled}
                id={`input-${props.label}`}
                placeholder={props.placeholder}
                value={props.value || ''}
                onChange={onChange}
              />
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {props.suffix && <div className="input-group-addon">{props.suffix}</div>}
            </div>
          )}
          {!(props.prefix || props.suffix) && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
