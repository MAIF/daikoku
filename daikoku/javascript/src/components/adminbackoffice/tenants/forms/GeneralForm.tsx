import { useContext } from 'react';
import { constraints, Form, format, type } from '@maif/react-forms';
import { UseMutationResult, useQuery } from '@tanstack/react-query';

import * as Services from '../../../../services';

import { I18nContext } from '../../../../core';
import { ITenant, ITenantFull, Language } from '../../../../types';
import { Spinner } from '../../../utils';



export const GeneralForm = (props: { tenant: ITenant, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translateMethod, languages } = useContext(I18nContext)

  const { isLoading, data } = useQuery(['tenant'], () => Services.oneTenant(props.tenant._id))

  const schema = {
    name: {
      type: type.string,
      label: translateMethod('Name'),
      constraints: [
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
    robotTxt: {
      type: type.string,
      format: format.text,
      label: translateMethod('Robot.txt.label'),
    }
  };

  if (isLoading) {
    return (
      <Spinner />
    )
  }

  return (
    <Form
      schema={schema}
      onSubmit={(d) => props.updateTenant.mutateAsync(d)}
      value={data}
    />
  )
}