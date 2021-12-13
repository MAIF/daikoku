import React, { useContext } from 'react';
import { I18nContext } from '../../../../core';

import { Spinner } from '../../../utils';
import { MailTemplateButton } from './MailTemplateButton';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export function SendGridConfig({ value, onChange, ...props }) {
  const { translateMethod } = useContext(I18nContext);

  const formFlow = ['apikey', 'fromEmail', 'template'];

  const formSchema = {
    apikey: {
      type: 'string',
      props: {
        label: translateMethod('send_grid.api_key'),
      },
    },
    fromEmail: {
      type: 'string',
      props: {
        label: translateMethod('send_grid.from_email'),
      },
    },
    template: {
      type: () => <MailTemplateButton {...props} />,
    },
  };

  return (
    <React.Suspense fallback={<Spinner />}>
      <LazyForm
        value={value}
        onChange={onChange}
        flow={formFlow}
        schema={formSchema}
        style={{ marginTop: 50 }}
      />
    </React.Suspense>
  );
}
