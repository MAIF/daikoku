import React, { useEffect, useContext } from 'react';
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

const SwaggerEditorInput = ({ setValue, rawValues, value, error, onChange }) => {
  let unsubscribe;

  useEffect(() => {
    initSwaggerEditor(value);

    return () => {
      killSwaggerEditor();
    };
  }, []);

  const initSwaggerEditor = (content) => {
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
    window.editor.specActions.updateSpec(content || JSON.stringify(defaultSwaggerContent, null, 2));
    unsubscribe = window.editor.getStore().subscribe(() => {
      const content = window.editor.specSelectors.specStr();
      onChange(content);
    });
  };

  const killSwaggerEditor = () => {
    if (unsubscribe) {
      unsubscribe();
    }
    window.editor = null;
    localStorage.removeItem('swagger-editor-content');
  };

  return <div id="swagger-editor" style={{ height: window.outerHeight - 60 - 58 }} />;
};

export const TeamApiSwagger = ({ value, onChange, reference }) => {
  const { translateMethod } = useContext(I18nContext);
  const swagger = value.swagger;

  const schema = {
    url: {
      type: type.string,
      label: translateMethod('URL'),
      visible: {
        ref: 'useContent',
        test: (v) => !v,
      },
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
      visible: {
        ref: 'useContent',
        test: (v) => !v,
      },
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
      visible: {
        ref: 'useContent',
        test: (v) => !!v,
      },
      render: (v) => SwaggerEditorInput(v),
    },
  };

  return (
    <Form
      ref={reference}
      schema={schema}
      onSubmit={(swagger) => {
        console.debug({swagger})
        onChange({ ...value, swagger })
      }}
      value={value.swagger}
      footer={() => null}
    />
  );
};
