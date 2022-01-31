import React, { useState, useEffect, useContext } from 'react';
import SwaggerEditor, {plugins} from 'swagger-editor';
import { I18nContext } from '../../../core';
import { TextInput, BooleanInput, ObjectInput } from '../../inputs';

import 'swagger-editor/dist/swagger-editor.css';
import { ensurePluginOrder } from 'react-table';

export const TeamApiSwagger = ({ value, onChange }) => {
  const [lastContent, setLastContent] = useState(undefined);
  let unsubscribe = () => {};

  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    if (value.swagger && value.swagger.content) {
      initSwaggerEditor(value.swagger.content);
    } else {
      killSwaggerEditor();
    }

    return () => {
      killSwaggerEditor();
    };
  }, [value]);

  const initSwaggerEditor = (content) => {
    window.editor = SwaggerEditor({
      // eslint-disable-line no-undef
      dom_id: '#swagger-editor',
      layout: 'EditorLayout',
      plugins,
      swagger2GeneratorUrl: 'https://generator.swagger.io/api/swagger.json',
      oas3GeneratorUrl: 'https://generator3.swagger.io/openapi.json',
      swagger2ConverterUrl: 'https://converter.swagger.io/api/convert',
      // spec: content,
    });
    window.editor.specActions.updateSpec(content);
    setLastContent(content);
    unsubscribe = window.editor.getStore().subscribe(() => {
      const ctt = window.editor.specSelectors.specStr();
      if (ctt !== lastContent) {
        updateStateFromSwaggerEditor();
        setLastContent(ctt);
        localStorage.removeItem('swagger-editor-content')
      }
    });
  };

  const updateStateFromSwaggerEditor = () => {
    const content = window.editor.specSelectors.specStr();
    onChange({ ...value, swagger: { ...value.swagger, content } });
  };

  const killSwaggerEditor = () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };

  const swagger = value.swagger;
  if (!swagger) {
    return null;
  }

  return (
    <form>
      {!swagger.content && (
        <TextInput
          key={'test'}
          label={translateMethod('URL')}
          placeholder="The url of the swagger file"
          value={swagger.url}
          onChange={(url) => onChange({ ...value, swagger: { ...value.swagger, url } })}
        />
      )}
      {!swagger.content && (
        <ObjectInput
          label={translateMethod('Headers')}
          value={swagger.headers}
          onChange={(headers) => onChange({ ...value, swagger: { ...value.swagger, headers } })}
        />
      )}
      <BooleanInput
        label={translateMethod('Use swagger content')}
        value={!!swagger.content}
        onChange={(e) => {
          let content;
          if (e) {
            content = JSON.stringify(
              {
                swagger: '2.0',
                info: {
                  description: '...',
                  version: '1.0.0',
                  title: '...',
                },
                host: 'api.foo.bar',
                basePath: '/',
              },
              null,
              2
            );
          } else {
            content = null;
          }
          onChange({ ...value, swagger: { ...value.swagger, content } });
        }}
      />
      {!!swagger.content && (
        <div id="swagger-editor" style={{ height: window.outerHeight - 60 - 58 }}></div>
      )}
    </form>
  );
};
