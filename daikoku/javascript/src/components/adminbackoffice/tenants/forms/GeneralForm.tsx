import { constraints, Form, format, Schema, type } from '@maif/react-forms';
import { UseMutationResult } from '@tanstack/react-query';
import { useContext } from 'react';


import { I18nContext, ModalContext } from '../../../../contexts';
import { ITenantFull, Language } from '../../../../types';



export const GeneralForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown>, createTenant: UseMutationResult<any, unknown, ITenantFull, unknown>, creation: boolean }) => {
  const { translate, languages } = useContext(I18nContext)
  const { alert } = useContext(ModalContext)

  const schema: Schema = {
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
    },
    clientNamePattern: {
      type: type.string,
      label: () => <div>{translate("tenant.edit.clientNamePattern.label")}
        <button type='button'
          className='btn btn-outline-info ms-1'
          onClick={() => alert({ 
            title: translate('tenant.edit.clientNamePattern.label'), 
            message: <div>
              <div>{translate('tenant.edit.clientNamePattern.help')}</div>
              <div>{translate('tenant.edit.clientNamePattern.help2')}</div>
              <pre>
                {JSON.stringify([
                  "user.id",
                  "user.humanReadableId",
                  "user.name",
                  "user.email",
                  "user.metadata.<value>",
                  "api.id",
                  "api.humanReadableId",
                  "api.name",
                  "api.currentVersion",
                  "plan.id",
                  "plan.customName",
                  "team.id",
                  "team.humanReadableId",
                  "team.name",
                  "team.metadata.<value>",
                  "tenant.id",
                  "tenant.humanReadableId",
                  "tenant.name",
                  "createdAt" ,
                  "createdAtMillis" ,
                ], null, 4)}
              </pre>
            </div> })}>
          <i className='fas fa-circle-question' />
        </button>
      </div>,

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