import React from 'react';

import { t } from '../../../../locales';
import { MailTemplateButton } from './MailTemplateButton';
const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export function MailjetConfig({ currentLanguage, value, onChange }) {
  const formFlow = ['apiKeyPublic', 'apiKeyPrivate', 'fromTitle', 'fromEmail', 'template'];

  const formSchema = {
    apiKeyPublic: {
      type: 'string',
      props: {
        label: t('Mailjet apikey public', currentLanguage),
      },
    },
    apiKeyPrivate: {
      type: 'string',
      props: {
        label: t('Mailjet apikey private', currentLanguage),
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

  return <React.Suspense>
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
