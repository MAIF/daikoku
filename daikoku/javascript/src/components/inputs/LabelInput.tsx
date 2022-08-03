import React, { useEffect, useState } from 'react';
// @ts-expect-error TS(6142): Module './Help' was resolved to '/Users/qaubert/So... Remove this comment to see the full error message
import { Help } from './Help';

export function LabelInput(props: any) {
  const [value, setValue] = useState(props.value);

  const identity = (v: any) => v;

  useEffect(() => {
    const transform = props.transform || identity;
    if (props.from) {
      props.from().then((value: any) => setValue({ value: transform(value) }));
    }
  }, []);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <label className="col-sm-2 control-label mb-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {props.label} <Help text={props.help} />
      </label>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-sm-10">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <span className="form-control">{value}</span>
      </div>
    </div>
  );
}
