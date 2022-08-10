import React, { useContext, useState, useEffect } from 'react';
import { Form, format, type, constraints } from '@maif/react-forms';

import * as Services from '../../../../services';

import { ITenant, ITenantFull } from '../../../../types';
import { I18nContext } from '../../../../core';
import { useQuery } from '@tanstack/react-query';



export const GeneralForm = (props: { tenant: ITenant }) => {
  const { translateMethod, languages } = useContext(I18nContext)
  const [fullTenant, setFullTenant] = useState<ITenantFull>();

  const { isLoading, data } = useQuery(['tenant'], () => Services.oneTenant(props.tenant._id))

  useEffect(() => {
    Services.oneTenant(props.tenant._id)
      .then(setFullTenant)
  }, [props.tenant._id])

  const schema = {
    enabled: {
      type: type.bool,
      label: translateMethod('Enabled'),
    },
    name: {
      type: type.string,
      label: translateMethod('Name'),
    },
    domain: {
      type: type.string,
      label: translateMethod('Domain name'),
    },
    defaultLanguage: {
      type: type.string,
      format: format.buttonsSelect,
      label: translateMethod('Default language'),
      options: languages,
    },
    contact: {
      type: type.string,
      format: format.email,
      label: translateMethod('Contact'),
    },
  }

  if (isLoading) {
    return (
      <div>loading</div>
    )
  }

  return (
    <Form
      schema={schema}
      onSubmit={console.debug}
      value={fullTenant}
    />
  )
}