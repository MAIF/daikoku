import { Form, Schema, constraints, format, type } from "@maif/react-forms";
import { useContext } from "react";

import { I18nContext } from "../../../../contexts/i18n-context";
import { ITenantFull } from "../../../../types";
import { UseMutationResult } from "@tanstack/react-query";

type UpdateFormProps = {
  tenant: ITenantFull
  updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown>
}
export const DisplayForm = (props: UpdateFormProps) => {
  const { translate } = useContext(I18nContext);

  const schema: Schema = {
    display: {
      type: type.string,
      format: format.buttonsSelect,
      options: [
        {value: 'environment', label: translate('display.environment.label')},
        {value: 'default', label: translate('display.default.label')},
      ],
      label: translate('environment-mode.is-private.label'),
      help: translate('environment-mode.is-private.help')
    },
    //TODO: draw a custom component with is default flag
    environments: {
      type: type.string,
      array: true,
      label: translate('environment-mode.environments.label'),
      help: translate('environment-mode.environments.help'),
      visible: ({ rawValues }) => rawValues.isPrivate,
      constraints: [
        constraints.required('constraints.required.value')
      ]
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