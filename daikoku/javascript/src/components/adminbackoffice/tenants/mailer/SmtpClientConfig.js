import React from 'react';

import { Spinner } from '../../../utils';
import { t } from '../../../../locales';
import { MailTemplateButton } from './MailTemplateButton';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export function SmtpClientConfig({ currentLanguage, value, onChange }) {
  const formFlow = ['host', 'port', 'fromTitle', 'fromEmail', 'template'];

  const formSchema = {
    host: {
      type: 'string',
      props: {
        label: t('smtp_client.host', currentLanguage),
      },
    },
    port: {
      type: 'string',
      props: {
        label: t('smtp_client.port', currentLanguage),
      },
    },
    fromTitle: {
      type: 'string',
      props: {
        label: t('Email title', currentLanguage),
      },
    },
    fromEmail: {
      type: 'string',
      props: {
        label: t('Email from', currentLanguage),
      },
    },
    template: {
      type: () => <MailTemplateButton currentLanguage={currentLanguage} />
    }
  };

  return <React.Suspense fallback={<Spinner />}>
    <LazyForm
      currentLanguage={currentLanguage}
      value={value}
      onChange={onChange}
      flow={formFlow}
      schema={formSchema}
      style={{ marginTop: 50 }}
    />
  </React.Suspense>
}
