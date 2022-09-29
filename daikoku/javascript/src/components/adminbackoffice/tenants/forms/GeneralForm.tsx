import { useContext } from 'react';
import { constraints, Form, format, type } from '@maif/react-forms';
import { UseMutationResult, useQuery } from '@tanstack/react-query';

import * as Services from '../../../../services';

import { I18nContext } from '../../../../core';
import { ITenant, ITenantFull, Language } from '../../../../types';
import { Spinner } from '../../../utils';



export const GeneralForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
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
      onSubmit={(d) => props.updateTenant.mutateAsync(d)}
      value={props.tenant}
    />
  )
}