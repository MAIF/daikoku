import React, { Suspense } from 'react';
import { type, format } from '@maif/react-forms';

export const teamApiDescriptionForm = (translateMethod) => {
  const schema = {
    description: {
      type: type.string,
      format: format.markdown,
      label: translateMethod('Description'),
    },
  };
  const flow = ['description'];
  return { schema, flow };
};
