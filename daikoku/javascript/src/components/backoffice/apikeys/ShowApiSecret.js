import React, { useState } from 'react';

export function ShowApiSecret(props) {
  const [show, setShow] = useState(false);

  const toggle = () => {
    setShow(!show);
  };

  if (show) {
    return (
      <div
        style={{
          width: '100%',
          whiteSpace: 'initial',
        }}
      >
        <span style={{ marginRight: 5, wordBreak: 'break-all' }}>{props.secret}</span>
        <button onClick={toggle} type="button" className="btn btn-sm btn-access-negative">
          <i className="fas fa-eye-slash" /> Hide
        </button>
      </div>
    );
  }
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      ************{' '}
      {props.secret && (
        <button onClick={toggle} type="button" className="btn btn-sm btn-access-negative">
          <i className="fas fa-eye" /> Show
        </button>
      )}
    </div>
  );
}
