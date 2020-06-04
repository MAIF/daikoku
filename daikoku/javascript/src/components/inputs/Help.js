import React from 'react';

import { BeautifulTitle } from '../utils';

export const Help = ({ label, text, place }) => {
  if (label && text) {
    return (
      <BeautifulTitle place={place} title={text}>
        {label} <i className="fas fa-question-circle ml-1" />
      </BeautifulTitle>
    );
  } else if (text) {
    return (
      <BeautifulTitle place={place} title={text}>
        <i className="fas fa-question-circle ml-1" />
      </BeautifulTitle>
    );
  }
  return label;
}
