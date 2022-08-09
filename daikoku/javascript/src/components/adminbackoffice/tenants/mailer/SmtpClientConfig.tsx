import React, { useContext } from 'react';

import { Spinner } from '../../../utils';
import { MailTemplateButton } from './MailTemplateButton';
import { I18nContext } from '../../../../locales/i18n-context';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export function SmtpClientConfig({
  value,
  onChange,
  ...props
}: any) {
  const { translateMethod } = useContext(I18nContext);

  const formFlow = ['host', 'port', 'fromTitle', 'fromEmail', 'template'];

  const formSchema = {
    host: {
      type: 'string',
      props: {
        label: translateMethod('smtp_client.host'),
      },
    },
    port: {
      type: 'string',
      props: {
        label: translateMethod('smtp_client.port'),
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
