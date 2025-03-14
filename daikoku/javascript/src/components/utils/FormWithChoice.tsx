import { Form, Schema, format, type } from "@maif/react-forms"
import { PropsWithChildren, useState } from "react"
import classNames from 'classnames';
import EyeOff from 'react-feather/dist/icons/eye-off.js';
import Eye from 'react-feather/dist/icons/eye.js';

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

type CollapseProps = {
  collapsed?: boolean,
  errored: boolean,
  label: React.ReactNode,
}
export const Collapse = (props: PropsWithChildren<CollapseProps>) => {
  const [collapsed, setCollapsed] = useState(props.collapsed)

  const toggle = (e: any) => {
    if (e) e.stopPropagation()
    setCollapsed(!collapsed)
  };

  return (
    <div>
      <hr className={classNames({ ['mrf-collapse_error']: props.errored })} />
      <div className='mrf-cursor_pointer mrf-flex mrf-jc_between' onClick={toggle}>
        <span className={classNames('mrf-collapse_label', { ['mrf-collapse_error']: props.errored })}>{props.label}</span>
        <button
          type="button"
          className={classNames('mrf-btn', 'mrf-btn_sm', 'mrf-ml_5', { ['mrf-collapse_error']: props.errored })}
          onClick={toggle}>
          {!!collapsed && <Eye size={16} />}
          {!collapsed && <EyeOff size={16} />}
        </button>
      </div>
      <div className={classNames('mrf-ml_10', {
        ['d-none']: !!collapsed,
      })}>
        {props.children}
      </div>
    </div>
  );
}