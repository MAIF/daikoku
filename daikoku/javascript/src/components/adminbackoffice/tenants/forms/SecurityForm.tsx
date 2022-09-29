import { Form, Schema, type } from '@maif/react-forms';
import { UseMutationResult, useQuery } from '@tanstack/react-query';
import { useContext } from 'react';


import { I18nContext } from '../../../../core';
import * as Services from '../../../../services';
import { ITenant, ITenantFull } from '../../../../types';
import { Spinner } from '../../../utils';

export const SecurityForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translate } = useContext(I18nContext)

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
        const security = (value as {value: any}).value
        console.debug({value})
        if (security) {
          window.alert(translate('aggregation.api_key.security.notification'));
        }
      }
    },
    apiReferenceHideForGuest: {
      type: type.bool,
      label: translate('API reference visibility'),
      help: translate('api.reference.visibility.help'),
    },
    hideTeamsPage: {
      type: type.bool,
      label: translate('Hide teams page'),
      help: translate('hide.teams.page.help'),
    },
  }

  return (
    <Form
      schema={schema}
      onSubmit={(updatedTenant) => props.updateTenant.mutateAsync(updatedTenant)}
      value={props.tenant}
    />
  )

}