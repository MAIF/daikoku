import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { nanoid } from 'nanoid';

type Props = {
  className?: string;
  label?: string;
  onSwitch: (...args: any[]) => any;
  checked?: boolean;
  disabled?: boolean;
};

export function SwitchButton(props: Props) {
  const [loading, setLoading] = useState(false);

  let switchRef: any;

  useEffect(() => {
    if (loading) {
      const action = props.onSwitch(switchRef.checked);
      if (action instanceof Promise) {
        Promise.resolve(action).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  }, [loading]);

  const notifySwitch = () => {
      setLoading(true);
    
  };

  const { label } = props;
  const id = label ? label.replace(/\s/gi, '') : nanoid();
  return (
    <div
      className={classNames('d-flex justify-content-center ', {
        'switch--loading': loading,
        'switch--loaded': !loading,
        'switch--disabled': props.disabled,
      })}
    >
      <label className="switch--item" htmlFor={id}>
        {label && <div className="switch__label">{label}</div>}
        <input
          type="checkbox"
          id={id}
          ref={(ref) => (switchRef = ref)}
          checked={props.checked}
          style={{ display: 'none' }}
          onChange={() => notifySwitch()}
          disabled={props.disabled}
        />
        <span className="slider round" />
      </label>
    </div>
  );
}
