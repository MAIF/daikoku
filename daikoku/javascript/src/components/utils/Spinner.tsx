import React from 'react';

// @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
export const Spinner = (props: any) => <div
  style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: props.height || props.width || 300,
  }}
>
  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
  <svg
    width={`${props.width || 142}px`}
    height={`${props.height || props.width || 142}px`}
    viewBox="0 0 100 100"
    preserveAspectRatio="xMidYMid"
    className="uil-ring-alt"
  >
    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <rect x="0" y="0" width="100" height="100" fill="none" className="bk" />
    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <circle cx="50" cy="50" r="40" stroke="#222222" fill="none" strokeLinecap="round" />
    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <circle
      cx="50"
      cy="50"
      r="40"
      stroke={props.color || '#fefefe'}
      fill="none"
      strokeLinecap="round"
    >
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <animate
        attributeName="stroke-dashoffset"
        dur="2s"
        repeatCount="indefinite"
        from="0"
        to="502"
      />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <animate
        attributeName="stroke-dasharray"
        dur="2s"
        repeatCount="indefinite"
        values="150.6 100.4;1 250;150.6 100.4"
      />
    </circle>
  </svg>
</div>;
