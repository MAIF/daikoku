import { useContext } from 'react';
import { Form, Schema, type } from '@maif/react-forms';
import { UseMutationResult } from '@tanstack/react-query';

import { I18nContext } from '../../../../contexts';
import { Display, ITenant, ITenantFull } from '../../../../types';
import { ModalContext } from '../../../../contexts';
import { SubscriptionProcessEditor } from '../../../backoffice/apis/SubscriptionProcessEditor';

export const SecurityForm = (props: {
  tenant?: ITenantFull;
  updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown>;
}) => {
  const { translate } = useContext(I18nContext);
  const { alert, openRightPanel } = useContext(ModalContext);

  const schema: Schema = {
    isPrivate: {
      type: type.bool,
      label: translate('Private tenant'),
    },
    creationSecurity: {
      type: type.bool,
      label: translate('API creation security'),
      help: translate('creation.security.help'),
    },
    subscriptionSecurity: {
      type: type.bool,
      label: translate('subscription security'),
      help: translate('subscription.security.help'),
    },
    aggregationApiKeysSecurity: {
      type: type.bool,
      label: translate('aggregation api keys security'),
      onChange: (value) => {
        const security = (value as { value: any }).value;
        if (security) {
          alert({
            message: translate('aggregation.api_key.security.notification'),
          });
        }
      },
    },
    environmentAggregationApiKeysSecurity: {
      type: type.bool,
      label: translate('aggregation api keys security for environment mode'),
      help: translate('aggregation.environment.api_key.security.notification'),
      deps: ['aggregationApiKeysSecurity'],
      visible: ({ rawValues }) => rawValues.aggregationApiKeysSecurity && rawValues.display === Display.environment
    },
    apiReferenceHideForGuest: {
      type: type.bool,
      label: translate('API reference visibility'),
      help: translate('api.reference.visibility.help'),
    }
  }

  // const editProcess = () => openRightPanel({
  //       title: translate("api.pricings.subscription.process.panel.title"),
  //       content: <SubscriptionProcessEditor
  //         savePlan={plan => Promise.resolve(props.savePlan(plan))}
  //         plan={props.plan}
  //         team={props.ownerTeam}
  //         tenant={props.tenant as ITenant}
  //       />
  //     })

  return (
    <div>
      <Form
        schema={schema}
        onSubmit={(updatedTenant) =>
          props.updateTenant.mutateAsync(updatedTenant)
        }
        value={props.tenant}
        options={{
          actions: {
            submit: { label: translate('Save') },
          },
        }}
      />
      {/* <button className='btn btn-outline-success' onClick={() => ope}>setup account process</button> */}
    </div>
  );
};
