import React, { useContext } from 'react';
import { I18nContext } from '../../../../core';

import { Spinner } from '../../../utils';
// @ts-expect-error TS(6142): Module './MailTemplateButton' was resolved to '/Us... Remove this comment to see the full error message
import { MailTemplateButton } from './MailTemplateButton';

// @ts-expect-error TS(6142): Module '../../../inputs/Form' was resolved to '/Us... Remove this comment to see the full error message
const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export function SendGridConfig({
  value,
  onChange,
  ...props
}: any) {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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
