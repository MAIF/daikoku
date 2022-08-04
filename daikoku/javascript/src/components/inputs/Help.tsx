import React from 'react';

import { BeautifulTitle } from '../utils';

export const Help = ({
  label,
  text,
  place
}: any) => {
  if (label && text) {
    return (
            <BeautifulTitle place={place} title={text}>
                {label} <i className="fas fa-question-circle ms-1" />
      </BeautifulTitle>
    );
  } else if (!label && text) {
    return (
            <BeautifulTitle place={place} title={text}>
                <i className="fas fa-question-circle ms-1" />
      </BeautifulTitle>
    );
  }
  return label || null;
};
