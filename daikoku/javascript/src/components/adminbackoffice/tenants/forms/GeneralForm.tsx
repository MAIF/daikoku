import { constraints, Form, format, type } from '@maif/react-forms';
import { UseMutationResult } from '@tanstack/react-query';
import { useContext } from 'react';


import { I18nContext } from '../../../../core';
import { ITenantFull, Language } from '../../../../types';



export const GeneralForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown>, createTenant: UseMutationResult<any, unknown, ITenantFull, unknown>, creation: boolean }) => {
  const { translate, languages } = useContext(I18nContext)

  const schema = {
    name: {
      type: type.string,
      label: translate('Name'),
      constraints: [
        constraints.required(translate('constraints.required.name'))
      ]
    },
    enabled: {
      type: type.bool,
      label: translate('Enabled'),
    },
    domain: {
      type: type.string,
      label: translate('Domain name'),
      constraints: [
        constraints.required(translate('constraints.required.domain'))
      ]
    },
    defaultLanguage: {
      type: type.string,
      format: format.buttonsSelect,
      label: translate('Default language'),
      defaultValue: Language.fr,
      options: languages,
    },
    contact: {
      type: type.string,
      format: format.email,
      label: translate('Contact'),
      constraints: [
        constraints.required(translate('constraints.required.email')),
        constraints.email(translate('constraints.matches.email')),
      ]
    },
    robotTxt: {
      type: type.string,
      format: format.text,
      label: translate('Robot.txt.label'),
    }
  };

  return (
    <Form
      schema={schema}
      onSubmit={(d) => props.creation ? props.createTenant.mutateAsync(d) : props.updateTenant.mutateAsync(d)}
      value={props.tenant}
      options={{
        actions: {
          submit: {
            label: props.creation ? translate('Create') : translate('Save')
          }
        }
      }}
    />
  )
}