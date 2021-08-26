import React, { useEffect, useState } from 'react';
import { PropTypes } from 'prop-types';
import classNames from 'classnames';
import { v4 as uuidv4 } from 'uuid';

export function SwitchButton(props) {
  const [loading, setLoading] = useState(false);

  let switchRef;

  useEffect(() => {
    if (loading) {
      const action = props.onSwitch(switchRef.checked);
      if (action instanceof Promise) {
        Promise.resolve(action).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  }, [loading])

  const notifySwitch = () => {
    if (props.onSwitch) {
      setLoading(true);
    }
  };

  const { label } = props;
  const id = label ? label.replace(/\s/gi, '') : uuidv4();
  return (
    <div
      className={classNames('d-flex justify-content-center ', {
        'switch--loading': loading,
        'switch--loaded': !loading,
        'switch--disabled': props.disabled,
      })}>
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

SwitchButton.propTypes = {
  className: PropTypes.string,
  label: PropTypes.string,
  onSwitch: PropTypes.func,
  checked: PropTypes.bool,
  disabled: PropTypes.bool,
};
