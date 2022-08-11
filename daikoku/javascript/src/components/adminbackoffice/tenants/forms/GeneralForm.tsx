import React, { useContext, useState, useEffect } from 'react';
import { Form, format, type, constraints } from '@maif/react-forms';

import * as Services from '../../../../services';

import { ITenant, Language } from '../../../../types';
import { I18nContext } from '../../../../core';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '../../../utils';



export const GeneralForm = (props: { tenant: ITenant }) => {
  const { translateMethod, languages } = useContext(I18nContext)

  const { isLoading, data } = useQuery(['tenant'], () => Services.oneTenant(props.tenant._id))

  const schema = {
    name: {
      type: type.string,
      label: translateMethod('Name'),
      constraints:[
        constraints.required(translateMethod('constraints.required.name'))
      ]
    },
    enabled: {
      type: type.bool,
      label: translateMethod('Enabled'),
    },
    domain: {
      type: type.string,
      label: translateMethod('Domain name'),
      constraints: [
        constraints.required(translateMethod('constraints.required.domain'))
      ]
    },
    defaultLanguage: {
      type: type.string,
      format: format.buttonsSelect,
      label: translateMethod('Default language'),
      defaultValue: Language.fr,
      options: languages,
    },
    contact: {
      type: type.string,
      format: format.email,
      label: translateMethod('Contact'),
      constraints: [
        constraints.required(translateMethod('constraints.required.email')),
        constraints.email(translateMethod('constraints.matches.email')),
      ]
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
      onSubmit={console.debug}
      value={data}
    />
  )
}