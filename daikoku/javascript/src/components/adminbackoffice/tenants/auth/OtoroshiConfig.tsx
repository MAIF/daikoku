import React, { useContext, useEffect } from 'react';
import { I18nContext } from '../../../../core';
import { Spinner } from '../../../utils';


export function OtoroshiConfig(props: any) {
  const { translateMethod } = useContext(I18nContext);

  const formFlow = ['sessionMaxAge', 'claimSecret', 'claimHeaderName'];

  const formSchema = {
    sessionMaxAge: {
      type: 'number',
      props: {
        suffix: translateMethod('Second', true),
        label: translateMethod('Session max. age'),
      },
    },
    claimHeaderName: {
      type: 'string',
      props: {
        label: translateMethod('Claim header name'),
      },
    },
    claimSecret: {
      type: 'string',
      props: {
        label: translateMethod('Claim Secret'),
      },
    },
  };

  useEffect(() => {
    if (props.rawValue.authProvider === 'Otoroshi') {
      props.onChange({
        sessionMaxAge: props.value.sessionMaxAge || 86400,
        claimSecret: props.value.claimSecret || 'secret',
        claimHeaderName: props.value.claimHeaderName || 'Otoroshi-Claim',
      });
    }
  }, []);

  return (
    <div>no more lazy form</div>
    // <React.Suspense fallback={<Spinner />}>
    //   <LazyForm
    //     value={props.value}
    //     onChange={props.onChange}
    //     flow={formFlow}
    //     schema={formSchema}
    //     style={{ marginTop: 50 }}
    //   />
    // </React.Suspense>
  );
}
