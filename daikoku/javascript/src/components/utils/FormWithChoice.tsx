import { Form, Schema, format, type } from "@maif/react-forms"
import { useState } from "react"

type Props = {
  selectorName: string,
  defaultSelector: string,
  schemas: Array<{ key: string, schema: Schema }>
  autoSubmit?: boolean
  onsubmit: any,
  value?: any
}

export const FormWithChoice = (props: Props) => {
  const [selector, setSelector] = useState((props.value || {})[props.selectorName] || props.defaultSelector)

  const getSubSchema = () => {
    return props.schemas.find(s => s.key === selector)?.schema
  }

  return (
    <div>
      <Form
        schema={{
          type: {
            type: type.string,
            label: null,
            format: format.buttonsSelect,
            options: props.schemas.map(s => s.key),
            defaultValue: selector
          }
        }}
        onSubmit={d => setSelector(d.type)}
        options={{
          autosubmit: true,
          actions: {
            submit: {
              display: false
            }
          }
        }}
        value={(props.value || {})[props.selectorName]}
      />

      <Form
        schema={getSubSchema()!}
        onSubmit={data => props.onsubmit({ ...data, [props.selectorName]: selector })}
        options={{ autosubmit: !!props.autoSubmit, actions: { submit: { display: !props.autoSubmit } } }}
        value={props.value}
      />
    </div>
  )
}