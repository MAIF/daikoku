import React, { useEffect, useState } from 'react';
import classNames from 'classnames';

type Props = {
  className?: string;
  onSwitch: (...args: any[]) => any;
  checked?: boolean;
  disabled?: boolean;
  ariaLabel?: string
};

// export function _SwitchButton(props: Props) {
//   const [loading, setLoading] = useState(false);

//   let switchRef: any;

//   useEffect(() => {
//     if (loading) {
//       const action = props.onSwitch(switchRef.checked);
//       if (action instanceof Promise) {
//         Promise.resolve(action).then(() => setLoading(false));
//       } else {
//         setLoading(false);
//       }
//     }
//   }, [loading]);

//   const notifySwitch = () => {
//       setLoading(true);
    
//   };

//   const { label } = props;
//   const id = label ? label.replace(/\s/gi, '') : nanoid();
//   return (
//     <div
//       className={classNames('switch-button d-flex justify-content-center ', {
//         'switch--loading': loading,
//         'switch--loaded': !loading,
//         'switch--disabled': props.disabled,
//       })}
//     >
//       <label className="switch--item" htmlFor={id}>
//         {label && <div className="switch__label">{label}</div>}
//         <input
//           type="checkbox"
//           id={id}
//           ref={(ref) => (switchRef = ref)}
//           checked={props.checked}
//           style={{ display: 'none' }}
//           onChange={() => notifySwitch()}
//           disabled={props.disabled}
//         />
//         <span className="slider round" />
//       </label>
//     </div>
//   );
// }

export const SwitchButton = (props: Props) => {
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(props.checked)

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLoading(true)

    const checked = event.target.checked;
    const action = props.onSwitch(checked);

    if (action instanceof Promise) {
      Promise.resolve(action)
        .then(() => {
          setLoading(false)
          setActive(checked)
        });
    } else {
      setLoading(false)
      setActive(checked)
    }
  }

  return (
    <div className={classNames("switch-button-container", props.className, { loading, active, disabled: props.disabled })}>
      <label className="switch-button"
        role="switch"
        aria-checked={active}
        aria-label={props.ariaLabel}
        tabIndex={props.disabled ? -1 : 0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !props.disabled) {
            e.preventDefault();
            handleInputChange({
              target: { checked: !active }
            } as React.ChangeEvent<HTMLInputElement>)
          }
        }}>
        <input type="checkbox"
          onChange={handleInputChange}
          checked={active}
          disabled={props.disabled}
          aria-hidden="true"
          tabIndex={-1} />
        <span className="slider round"></span>
      </label>
    </div>
  )
}
