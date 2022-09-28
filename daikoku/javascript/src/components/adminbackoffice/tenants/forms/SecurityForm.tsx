import { Form, Schema, type } from '@maif/react-forms';
import { UseMutationResult, useQuery } from '@tanstack/react-query';
import { useContext } from 'react';


import { I18nContext } from '../../../../core';
import * as Services from '../../../../services';
import { ITenant, ITenantFull } from '../../../../types';
import { Spinner } from '../../../utils';

export const SecurityForm = (props: { tenant: ITenant, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translateMethod } = useContext(I18nContext)
  const { isLoading, data } = useQuery(['tenant'], () => Services.oneTenant(props.tenant._id))

  const schema: Schema = {
    isPrivate: {
      type: type.bool,
      label: translateMethod('Private tenant')
    },
    creationSecurity: {
      type: type.bool,
      label: translateMethod('API creation security'),
      help: translateMethod('creation.security.help'),
    },
    subscriptionSecurity: {
      type: type.bool,
      label: translateMethod('subscription security'),
      help: translateMethod('subscription.security.help'),
    },
    aggregationApiKeysSecurity: {
      type: type.bool,
      label: translateMethod('aggregation api keys security'),
      onChange: (value) => {
        const security = (value as {value: any}).value
        console.debug({value})
        if (security) {
          window.alert(translateMethod('aggregation.api_key.security.notification'));
        }
      }
    },
    apiReferenceHideForGuest: {
      type: type.bool,
      label: translateMethod('API reference visibility'),
      help: translateMethod('api.reference.visibility.help'),
    },
    hideTeamsPage: {
      type: type.bool,
      label: translateMethod('Hide teams page'),
      help: translateMethod('hide.teams.page.help'),
    },
  }

  if (isLoading) {
    return (
      <Spinner />
    )
  }

  return (
    <Form
      schema={schema}
      onSubmit={(updatedTenant) => props.updateTenant.mutateAsync(updatedTenant)}
      value={data}
    />
  )

}