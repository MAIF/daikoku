import React, { useState, useEffect } from 'react';
import { Help } from './Help';
import Select from 'react-select';
import { Spinner } from '../utils';

const LazyForm = React.lazy(() => import('./Form'));

const ArrayForm = (props) => {
  const possibleValues = props.value.map((v) => v[props.selector]);
  const [selectedSelector, setSelectedSelector] = useState(possibleValues[0]);
  const [selectedValue, setSelectedValue] = useState(props.value[0]);

  useEffect(() => {
    const value = props.value.find((v) => v[props.selector] === selectedSelector);
    setSelectedValue(value);
  }, [selectedSelector]);

  useEffect(() => {
    onChange(selectedValue);
  }, [selectedValue]);

  useEffect(() => {
    const value = props.value.find((v) => v[props.selector] === selectedSelector);
    setSelectedValue(value);
  }, [props.value]);

  const onChange = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const updated = [...props.value.filter((v) => v[props.selector] !== selectedSelector), e];
    props.onChange(updated);
  };

  if (props.hide) {
    return null;
  }

  return (
    <div className="form-group row">
      <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
        {props.label} <Help text={props.help} />
      </label>
      <Select
        className="col-11"
        value={{ label: selectedSelector, value: selectedSelector }}
        options={possibleValues.map((v) => ({ label: v, value: v }))}
        onChange={(e) => setSelectedSelector(e.value)}
        classNamePrefix="reactSelect"
      />
      <div className="col-sm-10">
        {(props.prefix || props.suffix) && (
          <div className="input-group">
            {props.prefix && <div className="input-group-addon">{props.prefix}</div>}
            <React.Suspense fallback={<Spinner />}>
              <LazyForm
                flow={props.flow}
                schema={props.schema}
                value={selectedValue}
                onChange={onChange}
              />
            </React.Suspense>
            {props.suffix && <div className="input-group-addon">{props.suffix}</div>}
          </div>
        )}
        {!(props.prefix || props.suffix) && (
          <React.Suspense fallback={<Spinner />}>
            <LazyForm
              flow={props.flow}
              schema={props.schema}
              value={selectedValue}
              onChange={(e) => setSelectedValue(e)}
            />
          </React.Suspense>
        )}
      </div>
    </div>
  );
};
export default ArrayForm;
