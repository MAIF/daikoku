import { useContext } from 'react';
import { Form, Schema, type } from '@maif/react-forms';
import { UseMutationResult } from '@tanstack/react-query';


import { I18nContext } from '../../../../core';
import { ITenantFull } from '../../../../types';
import { ModalContext } from '../../../../contexts';

export const SecurityForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translate } = useContext(I18nContext);
  const { alert } = useContext(ModalContext);

  const schema: Schema = {
    isPrivate: {
      type: type.bool,
      label: translate('Private tenant')
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
        const security = (value as { value: any }).value
        if (security) {
          alert({ message: translate('aggregation.api_key.security.notification') });
        }
      }
    },
    apiReferenceHideForGuest: {
      type: type.bool,
      label: translate('API reference visibility'),
      help: translate('api.reference.visibility.help'),
    },
    cmsRedirections: {
      type: type.string,
      array: true,
      label: translate('CMS Redirections Domains'),
      help: translate('cms.redirections.domains'),
    }
  }

  return (
    <Form
      schema={schema}
      onSubmit={(updatedTenant) => props.updateTenant.mutateAsync(updatedTenant)}
      value={props.tenant}
      options={{
        actions: {
          submit: { label: translate('Save') }
        }
      }}
    />
  )

}