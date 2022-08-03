import React, { useContext } from 'react';

import { Spinner } from '../../../utils';
// @ts-expect-error TS(6142): Module './MailTemplateButton' was resolved to '/Us... Remove this comment to see the full error message
import { MailTemplateButton } from './MailTemplateButton';
import { I18nContext } from '../../../../core';

// @ts-expect-error TS(6142): Module '../../../inputs/Form' was resolved to '/Us... Remove this comment to see the full error message
const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export function MailgunConfig({
  value,
  onChange,
  ...props
}: any) {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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
