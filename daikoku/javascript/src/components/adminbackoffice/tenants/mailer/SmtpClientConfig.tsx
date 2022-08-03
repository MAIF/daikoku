import React, { useContext } from 'react';

import { Spinner } from '../../../utils';
// @ts-expect-error TS(6142): Module './MailTemplateButton' was resolved to '/Us... Remove this comment to see the full error message
import { MailTemplateButton } from './MailTemplateButton';
// @ts-expect-error TS(6142): Module '../../../../locales/i18n-context' was reso... Remove this comment to see the full error message
import { I18nContext } from '../../../../locales/i18n-context';

// @ts-expect-error TS(6142): Module '../../../inputs/Form' was resolved to '/Us... Remove this comment to see the full error message
const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export function SmtpClientConfig({
  value,
  onChange,
  ...props
}: any) {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      type: () => <MailTemplateButton {...props} />,
    },
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <React.Suspense fallback={<Spinner />}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <LazyForm
        value={value}
        onChange={onChange}
        flow={formFlow}
        schema={formSchema}
        // @ts-expect-error TS(2322): Type '{ value: any; onChange: any; flow: string[];... Remove this comment to see the full error message
        style={{ marginTop: 50 }}
      />
    </React.Suspense>
  );
}
