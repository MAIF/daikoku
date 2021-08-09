import React from 'react';

import { Spinner } from '../../../utils';
import { t } from '../../../../locales';
import { MailTemplateButton } from './MailTemplateButton';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export function SendGridConfig({ currentLanguage, value, onChange }) {
  const formFlow = ['apikey', 'fromEmail', 'template'];

  const formSchema = {
    apikey: {
      type: 'string',
      props: {
        label: t('send_grid.api_key', currentLanguage),
      },
    },
    fromEmail: {
      type: 'string',
      props: {
        label: t('send_grid.from_email', currentLanguage),
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
