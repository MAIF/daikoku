import React, { useContext, useEffect } from 'react';
import { I18nContext } from '../../../../core';
import { Spinner } from '../../../utils';

// @ts-expect-error TS(6142): Module '../../../inputs/Form' was resolved to '/Us... Remove this comment to see the full error message
const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export function LocalConfig(props: any) {
  const formFlow = ['sessionMaxAge'];

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const formSchema = {
    sessionMaxAge: {
      type: 'number',
      props: {
        suffix: translateMethod('Second', true),
        label: translateMethod('Session max. age'),
      },
    },
  };

  useEffect(() => {
    if (props.rawValue.authProvider === 'Local') {
      props.onChange({
        sessionMaxAge: props.value.sessionMaxAge || 86400,
      });
    }
  }, []);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <React.Suspense fallback={<Spinner />}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <LazyForm
        value={props.value}
        onChange={props.onChange}
        flow={formFlow}
        schema={formSchema}
        // @ts-expect-error TS(2322): Type '{ value: any; onChange: any; flow: string[];... Remove this comment to see the full error message
        style={{ marginTop: 50 }}
      />
    </React.Suspense>
  );
}
