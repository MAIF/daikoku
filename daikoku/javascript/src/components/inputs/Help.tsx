import React from 'react';

import { BeautifulTitle } from '../utils';

export const Help = ({
  label,
  text,
  place
}: any) => {
  if (label && text) {
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <BeautifulTitle place={place} title={text}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {label} <i className="fas fa-question-circle ms-1" />
      </BeautifulTitle>
    );
  } else if (!label && text) {
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <BeautifulTitle place={place} title={text}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <i className="fas fa-question-circle ms-1" />
      </BeautifulTitle>
    );
  }
  return label || null;
};
