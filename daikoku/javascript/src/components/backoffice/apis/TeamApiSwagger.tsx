import { constraints, Form, format, Schema, type } from '@maif/react-forms';
import { useContext, useState } from 'react';

import { I18nContext } from '../../../contexts';
import { ISwagger, IWithSwagger } from '../../../types';

interface TeamApiSwaggerProps<T extends IWithSwagger> {
  value: T
  save: (s: T) => void
}

export const TeamApiSwagger = <T extends IWithSwagger>({
  value,
  save
}: TeamApiSwaggerProps<T>) => {
  const [specificationType, setSpecificationType] = useState(value.swagger?.specificationType || "openapi")

  const { translate } = useContext(I18nContext);
  const swagger = value.swagger;

  const typeSchema = {
    type: {
      type: type.string,
      format: format.buttonsSelect,
      label: translate('swagger.specificationtype.selector.label'),
      options: [
        { label: translate('swagger.openapi.label'), value: 'openapi' },
        { label: translate('swagger.asyncapi.label'), value: 'asyncapi' },
      ],
      constraints: [
        constraints.required()
      ]
    }
  }

  const getSchema = (spectype: string): Schema => {
    switch (spectype) {
      case 'openapi':
        return ({
          useContent: {
            type: type.bool,
            label: translate('swagger.use.openapi.content'),
            defaultValue: !!swagger?.content,
          },
          url: {
            type: type.string,
            label: translate('URL'),
            deps: ['useContent'],
            visible: ({ rawValues }: any) => !rawValues.useContent,
            constraints: [
              constraints.matches(
                /^(https?:\/\/|\/)(\w+([^\w|^\s])?)([^\s]+$)|(^\.?\/[^\s]*$)/gm,
                translate({ key: 'constraints.format.url', replacements: [translate('Url')] })
              ),
            ],
          },
          headers: {
            type: type.object,
            label: translate('Headers'),
            deps: ['useContent'],
            visible: ({ rawValues }: any) => !rawValues.useContent,
          },
          content: {
            type: type.string,
            format: format.code,
            label: translate('swagger.openapi.content.label'),
            deps: ['useContent'],
            visible: ({ rawValues }: any) => rawValues.useContent
          },
          additionalConf: {
            type: type.object,
            format: format.code,
            label: translate("swagger.additional.conf.label"),
            help: translate('swagger.additional.conf.help')
          },
        })
      case 'asyncapi':
        return ({
          useContent: {
            type: type.bool,
            label: translate('swagger.use.asyncapi.content'),
            defaultValue: !!swagger?.content,
          },
          url: {
            type: type.string,
            label: translate('URL'),
            deps: ['useContent'],
            visible: ({ rawValues }: any) => !rawValues.useContent,
            constraints: [
              constraints.matches(
                /^(https?:\/\/|\/)(\w+([^\w|^\s])?)([^\s]+$)|(^\.?\/[^\s]*$)/gm,
                translate({ key: 'constraints.format.url', replacements: [translate('Url')] })
              ),
            ],
          },
          headers: {
            type: type.object,
            label: translate('Headers'),
            deps: ['useContent'],
            visible: ({ rawValues }: any) => !rawValues.useContent,
          },
          content: {
            type: type.string,
            format: format.code,
            label: translate('swagger.asyncapi.content.label'),
            deps: ['useContent'],
            visible: ({ rawValues }: any) => rawValues.useContent,
          },
        })
      default:
        return ({})
    }
  }

  const schema: Schema = getSchema(specificationType)

  return (
    <div>
      <Form
        schema={typeSchema}
        onSubmit={(data) => setSpecificationType(data.type)}
        options={{
          autosubmit: true,
          actions: {
            submit: {
              display: false
            }
          }
        }}
        value={{ type: specificationType }}
      />
      <Form<ISwagger>
        schema={schema}
        value={value.swagger}
        onSubmit={data => save({...value, swagger: {...data, specificationType}})}
      />
    </div>
  )
};
