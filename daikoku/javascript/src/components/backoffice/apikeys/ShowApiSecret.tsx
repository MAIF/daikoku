import React, { useState } from 'react';

export function ShowApiSecret(props: any) {
  const [show, setShow] = useState(false);

  const toggle = () => {
    setShow(!show);
  };

  if (show) {
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div
        style={{
          width: '100%',
          whiteSpace: 'initial',
        }}
      >
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <span style={{ marginRight: 5, wordBreak: 'break-all' }}>{props.secret}</span>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button onClick={toggle} type="button" className="btn btn-sm btn-access-negative">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className="fas fa-eye-slash" /> Hide
        </button>
      </div>
    );
  }
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <button onClick={toggle} type="button" className="btn btn-sm btn-access-negative">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className="fas fa-eye" /> Show
        </button>
      )}
    </div>
  );
}
