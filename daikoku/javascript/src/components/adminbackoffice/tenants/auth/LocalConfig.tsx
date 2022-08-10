import React, { useContext, useEffect } from 'react';
import { I18nContext } from '../../../../core';
import { Spinner } from '../../../utils';


export function LocalConfig(props: any) {
  const formFlow = ['sessionMaxAge'];

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
    <div>no more lazy form </div>
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
