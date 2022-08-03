import React, { useState, useEffect } from 'react';
// @ts-expect-error TS(6142): Module './Help' was resolved to '/Users/qaubert/So... Remove this comment to see the full error message
import { Help } from './Help';
import Select from 'react-select';
import { Spinner } from '../utils';

// @ts-expect-error TS(6142): Module './Form' was resolved to '/Users/qaubert/So... Remove this comment to see the full error message
const LazyForm = React.lazy(() => import('./Form'));

const ArrayForm = (props: any) => {
  const possibleValues = props.value.map((v: any) => v[props.selector]);
  const [selectedSelector, setSelectedSelector] = useState(possibleValues[0]);
  const [selectedValue, setSelectedValue] = useState(props.value[0]);

  useEffect(() => {
    const value = props.value.find((v: any) => v[props.selector] === selectedSelector);
    setSelectedValue(value);
  }, [selectedSelector]);

  useEffect(() => {
    onChange(selectedValue);
  }, [selectedValue]);

  useEffect(() => {
    const value = props.value.find((v: any) => v[props.selector] === selectedSelector);
    setSelectedValue(value);
  }, [props.value]);

  const onChange = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    const updated = [...props.value.filter((v: any) => v[props.selector] !== selectedSelector), e];
    props.onChange(updated);
  };

  if (props.hide) {
    return null;
  }

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {props.label} <Help text={props.help} />
      </label>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Select
        className="col-11"
        value={{ label: selectedSelector, value: selectedSelector }}
        options={possibleValues.map((v: any) => ({
          label: v,
          value: v
        }))}
        // @ts-expect-error TS(2531): Object is possibly 'null'.
        onChange={(e) => setSelectedSelector(e.value)}
        classNamePrefix="reactSelect"
      />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-sm-10">
        {(props.prefix || props.suffix) && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="input-group">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {props.prefix && <div className="input-group-addon">{props.prefix}</div>}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <React.Suspense fallback={<Spinner />}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <LazyForm
                flow={props.flow}
                schema={props.schema}
                value={selectedValue}
                onChange={onChange}
              />
            </React.Suspense>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {props.suffix && <div className="input-group-addon">{props.suffix}</div>}
          </div>
        )}
        {!(props.prefix || props.suffix) && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <React.Suspense fallback={<Spinner />}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
