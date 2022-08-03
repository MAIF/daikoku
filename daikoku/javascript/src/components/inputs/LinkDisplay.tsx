import React from 'react';

// @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
export const LinkDisplay = (props: any) => <div className="mb-3 row">
  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
  <label className="col-sm-2 control-label mb-2" />
  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
  <div className="col-sm-10">
    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <i className="fas fa-share" />{' '}
    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <a href={props.link} target="_blank" rel="noopener noreferrer">
      {props.link}
    </a>
  </div>
</div>;
