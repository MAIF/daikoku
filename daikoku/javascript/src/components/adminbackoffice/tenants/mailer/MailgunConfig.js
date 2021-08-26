import React, { useContext } from 'react';

import { Spinner } from '../../../utils';
import { MailTemplateButton } from './MailTemplateButton';
import { I18nContext } from '../../../../core';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export function MailgunConfig({ value, onChange }) {
  const { translateMethod } = useContext(I18nContext);

  const formFlow = ['domain', 'eu', 'key', 'fromTitle', 'fromEmail', 'template'];

  const formSchema = {
    domain: {
      type: 'string',
      props: {
        label: translateMethod('Mailgun domain'),
      },
    },
    eu: {
      type: 'bool',
      props: {
        label: translateMethod('European server'),
      },
    },
    key: {
      type: 'string',
      props: {
        label: translateMethod('Mailgun key'),
      },
    },
    fromTitle: {
      type: 'string',
      props: {
        label: translateMethod('Email title'),
      },
    },
    fromEmail: {
      type: 'string',
      props: {
        label: translateMethod('Email from'),
      },
    },
    template: {
      type: () => <MailTemplateButton />,
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
