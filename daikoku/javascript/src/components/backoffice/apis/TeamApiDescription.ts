import React, { Suspense } from 'react';
import { type, format } from '@maif/react-forms';

export const teamApiDescriptionForm = (translate: any) => {
  const schema = {
    description: {
      type: type.string,
      format: format.markdown,
      label: translate('Description'),
    },
  };
  const flow = ['description'];
  return { schema, flow };
};
