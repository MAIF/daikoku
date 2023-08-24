import { Form, Schema, constraints, format, type } from "@maif/react-forms";
import { useContext, useState } from "react";

import { I18nContext } from "../../../../contexts/i18n-context";
import { ITenantFull } from "../../../../types";
import { UseMutationResult } from "@tanstack/react-query";
import { tenant } from "../../../utils";
import { ModalContext } from "../../../../contexts";

type UpdateFormProps = {
  tenant: ITenantFull
  updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown>
}
export const DisplayForm = (props: UpdateFormProps) => {
  const { translate } = useContext(I18nContext);
  const { alert } = useContext(ModalContext);
  const [messageDisplayed, setMessageDisplayed] = useState(false)

  const schema: Schema = {
    display: {
      type: type.string,
      format: format.buttonsSelect,
      options: [
        { value: 'environment', label: translate('display.environment.label') },
        { value: 'default', label: translate('display.default.label') },
      ],
      label: translate('display-mode.label'),
      help: translate('display-mode.help')
    },
    //TODO: draw a custom component with is default flag
    environments: {
      type: type.string,
      array: true,
      label: translate('display-mode.environments.label'),
      visible: ({ rawValues }) => rawValues.isPrivate,
      constraints: [
        constraints.required('constraints.required.value')
      ],
      onChange: ({ value }) => {
        const diff = props.tenant.environments.filter(x => !value.map(t => t.value).includes(x));
        if (diff.length && !messageDisplayed) {
          alert({ message: translate('display-mode.environments.deletion.alert') })
            .then(() => setMessageDisplayed(true))
        }
      }
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