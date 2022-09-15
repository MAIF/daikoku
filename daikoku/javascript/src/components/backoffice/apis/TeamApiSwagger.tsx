import React, { useEffect, useContext } from 'react';
//@ts-ignore
import SwaggerEditor, { plugins } from 'swagger-editor';
import { Form, type, format, constraints } from '@maif/react-forms';

import { I18nContext } from '../../../core';

import 'swagger-editor/dist/swagger-editor.css';

const defaultSwaggerContent = {
  swagger: '2.0',
  info: {
    description: 'description',
    version: '1.0.0',
    title: 'title',
    termsOfService: 'terms',
    contact: {
      email: 'email@eamil.to',
    },
    license: {
      name: 'Apache 2.0',
      url: 'http://www.apache.org/licenses/LICENSE-2.0.html',
    },
  },
  host: 'localhost',
  schemes: ['https', 'http'],
  paths: {
    '/': {
      get: {
        summary: 'Add a new pet to the store',
        responses: {
          405: {
            description: 'Invalid input',
          },
        },
      },
    },
  },
};

const SwaggerEditorInput = ({
  setValue,
  rawValues,
  value,
  error,
  onChange
}: any) => {
  let unsubscribe: any;

  useEffect(() => {
    initSwaggerEditor(value);

    return () => {
      killSwaggerEditor();
    };
  }, []);

  const initSwaggerEditor = (content: any) => {
    //@ts-ignore //FIXME typing monkey patch ???
    window.editor = SwaggerEditor({
      // eslint-disable-line no-undef
      dom_id: '#swagger-editor',
      layout: 'EditorLayout',
      plugins,
      swagger2GeneratorUrl: 'https://generator.swagger.io/api/swagger.json',
      oas3GeneratorUrl: 'https://generator3.swagger.io/openapi.json',
      swagger2ConverterUrl: 'https://converter.swagger.io/api/convert',
      spec: content || JSON.stringify(defaultSwaggerContent, null, 2),
    });
    //@ts-ignore //FIXME typing monkey patch ???
    window.editor.specActions.updateSpec(content || JSON.stringify(defaultSwaggerContent, null, 2));
    //@ts-ignore //FIXME typing monkey patch ???
    unsubscribe = window.editor.getStore().subscribe(() => {
      //@ts-ignore //FIXME typing monkey patch ???
      const c = window.editor.specSelectors.specStr();
      onChange(c);
    });
  };

  const killSwaggerEditor = () => {
    if (unsubscribe) {
      unsubscribe();
    }
    (window as any).editor = null;
    localStorage.removeItem('swagger-editor-content');
  };

  return <div id="swagger-editor" style={{ height: window.outerHeight - 60 - 58 }} />;
};

export const TeamApiSwagger = ({
  value,
  onChange,
  reference
}: any) => {
  const { translateMethod } = useContext(I18nContext);
  const swagger = value.swagger;

  const schema = {
    url: {
      type: type.string,
      label: translateMethod('URL'),
      deps: ['useContent'],
      visible: ({ rawValues }: any) => !rawValues.useContent,
      constraints: [
        constraints.matches(
          /^(https?:\/\/|\/)(\w+([^\w|^\s])?)([^\s]+$)|(^\.?\/[^\s]*$)/gm,
          translateMethod('constraints.format.url', false, '', translateMethod('Url'))
        ),
      ],
    },
    headers: {
      type: type.object,
      label: translateMethod('Headers'),
      deps:['useContent'],
      visible: ({rawValues}: any) => !rawValues.useContent,
    },
    useContent: {
      type: type.bool,
      label: translateMethod('Use swagger content'),
      defaultValue: !!swagger.content,
    },
    content: {
      type: type.string,
      format: format.code,
      label: 'swagger-content',
      deps: ['useContent'],
      visible: ({ rawValues }: any) => rawValues.useContent,
      render: (v: any) => SwaggerEditorInput(v),
    },
  };

  return (
    <Form
      ref={reference}
      schema={schema}
      onSubmit={(swagger) => {
        onChange({ ...value, swagger });
      }}
      value={value.swagger}
      footer={() => <></>}
    />
  );
};
