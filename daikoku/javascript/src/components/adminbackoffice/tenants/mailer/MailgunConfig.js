import React from 'react';

import { Spinner } from '../../../utils';
import { t } from '../../../../locales';
import { MailTemplateButton } from './MailTemplateButton';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export function MailgunConfig({ currentLanguage, value, onChange }) {
  const formFlow = ['domain', 'eu', 'key', 'fromTitle', 'fromEmail', 'template'];

  const formSchema = {
    domain: {
      type: 'string',
      props: {
        label: t('Mailgun domain', currentLanguage),
      },
    },
    eu: {
      type: 'bool',
      props: {
        label: t('European server', currentLanguage),
      },
    },
    key: {
      type: 'string',
      props: {
        label: t('Mailgun key', currentLanguage),
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
