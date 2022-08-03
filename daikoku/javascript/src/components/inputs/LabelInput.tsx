import React, { useEffect, useState } from 'react';
import { Help } from './Help';

export function LabelInput(props) {
  const [value, setValue] = useState(props.value);

  const identity = (v) => v;

  useEffect(() => {
    const transform = props.transform || identity;
    if (props.from) {
      props.from().then((value) => setValue({ value: transform(value) }));
    }
  }, []);

  return (
    <div className="mb-3 row">
      <label className="col-sm-2 control-label mb-2">
        {props.label} <Help text={props.help} />
      </label>
      <div className="col-sm-10">
        <span className="form-control">{value}</span>
      </div>
    </div>
  );
}
