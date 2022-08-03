import React from 'react';
import ReactToolTip from 'react-tooltip';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'uuid... Remove this comment to see the full error message
import { v4 as uuid } from 'uuid';

export const BeautifulTitle = ({
  title,
  children,
  place,
  ...props
}: any) => {
  const id = uuid();
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <ReactToolTip html={true} place={place || 'bottom'} id={id} />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <span {...props} data-html={true} data-tip={title} data-for={id}>
        {children}
      </span>
    </>
  );
};
