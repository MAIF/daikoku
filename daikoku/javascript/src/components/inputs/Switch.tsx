import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'uuid... Remove this comment to see the full error message
import { v4 as uuidv4 } from 'uuid';

type Props = {
    className?: string;
    label?: string;
    onSwitch?: (...args: any[]) => any;
    checked?: boolean;
    disabled?: boolean;
};

export function SwitchButton(props: Props) {
  const [loading, setLoading] = useState(false);

  let switchRef: any;

  useEffect(() => {
    if (loading) {
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      const action = props.onSwitch(switchRef.checked);
      if (action instanceof Promise) {
        Promise.resolve(action).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  }, [loading]);

  const notifySwitch = () => {
    if (props.onSwitch) {
      setLoading(true);
    }
  };

  const { label } = props;
  const id = label ? label.replace(/\s/gi, '') : uuidv4();
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div
      className={classNames('d-flex justify-content-center ', {
        'switch--loading': loading,
        'switch--loaded': !loading,
        'switch--disabled': props.disabled,
      })}
    >
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <label className="switch--item" htmlFor={id}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {label && <div className="switch__label">{label}</div>}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <input
          type="checkbox"
          id={id}
          ref={(ref) => (switchRef = ref)}
          checked={props.checked}
          style={{ display: 'none' }}
          onChange={() => notifySwitch()}
          disabled={props.disabled}
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <span className="slider round" />
      </label>
    </div>
  );
}
