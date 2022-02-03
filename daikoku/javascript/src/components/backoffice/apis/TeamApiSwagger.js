import React, { useState, useEffect, useContext } from 'react';
import SwaggerEditor, { plugins } from 'swagger-editor';
import { Form, type, format, constraints } from "@maif/react-forms";

import { I18nContext } from '../../../core';
import { TextInput, BooleanInput, ObjectInput } from '../../inputs';

import 'swagger-editor/dist/swagger-editor.css';

const SwaggerEditorInput = ({ setValue, rawValues, value, error, onChange }) => {
  let unsubscribe;

  useEffect(() => {
    console.debug({value})
    initSwaggerEditor(value);

    return () => {
      killSwaggerEditor();
    };
  }, []);

  const initSwaggerEditor = (content) => {
    console.debug({content})
    window.editor = SwaggerEditor({
      // eslint-disable-line no-undef
      dom_id: '#swagger-editor',
      layout: 'EditorLayout',
      plugins,
      swagger2GeneratorUrl: 'https://generator.swagger.io/api/swagger.json',
      oas3GeneratorUrl: 'https://generator3.swagger.io/openapi.json',
      swagger2ConverterUrl: 'https://converter.swagger.io/api/convert',
      spec: content,
    });
    window.editor.specActions.updateSpec(content);
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

  return (
    <div id="swagger-editor" style={{height: window.outerHeight - 60 -58}}/>
  )
}


export const TeamApiSwagger = ({ value, onChange }) => {
  const { translateMethod } = useContext(I18nContext);
  const swagger = value.swagger;

  const schema = {
    url: {
      type: type.string,
      label: translateMethod('URL'),
      visible: {
        ref: 'useContent',
        test: v => !v
      },
      constraints: [
        constraints.nullable(),
        constraints.matches(
          /^(https?:\/\/|\/)(\w+([^\w|^\s])?)([^\s]+$)|(^\.?\/[^\s]*$)/mg,
          translateMethod('constraints.format.url', false, '', translateMethod('Url')))
      ]
    },
    headers: {
      type: type.object,
      label: translateMethod('Headers'),
      visible: {
        ref: 'useContent',
        test: v => !v
      },
      constraints: [
        constraints.nullable()
      ]
    },
    useContent: {
      type: type.bool,
      label: translateMethod('Use swagger content'),
      defaultValue: !!swagger.content
    },
    content: {
      type: type.string,
      format: format.code,
      label: 'swagger-content',
      visible: {
        ref: 'useContent',
        test: v => !!v
      },
      render: v => SwaggerEditorInput(v),
      constraints: [
        constraints.nullable()
      ]
    }
  }


  return (
    <Form
      schema={schema}
      options={{
        autosubmit: true
      }}
      onSubmit={swagger => onChange({ ...value, swagger })}
      value={value.swagger}
      footer={() => null}
    />
  )
};
