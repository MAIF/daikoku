import React, { useState, useEffect } from 'react';

import { t } from '../../../locales';
import { TextInput, BooleanInput, ObjectInput } from '../../inputs';

export const TeamApiSwagger = ({ value, onChange, currentLanguage }) => {
  const [lastContent, setLastContent] = useState(undefined);
  let unsubscribe = () => {};

  useEffect(() => {
    if (value.swagger.content) {
      initSwaggerEditor(value.swagger.content);
    } else {
      killSwaggerEditor();
    }

    return () => {
      killSwaggerEditor();
    };
  }, [value]);

  const initSwaggerEditor = (content) => {
    console.log('init swagger editor');
    window.editor = SwaggerEditorBundle({  // eslint-disable-line no-undef
      dom_id: '#swagger-editor',
      layout: 'StandaloneLayout',
      presets: [SwaggerEditorStandalonePreset], // eslint-disable-line no-undef
      showExtensions: false,
      swagger2GeneratorUrl: 'https://generator.swagger.io/api/swagger.json',
      oas3GeneratorUrl: 'https://generator3.swagger.io/openapi.json',
      swagger2ConverterUrl: 'https://converter.swagger.io/api/convert',
      spec: content,
    });
    window.editor.specActions.updateSpec(content);
    setLastContent(content);
    unsubscribe = window.editor.getStore().subscribe(() => {
      const ctt = window.editor.specSelectors.specStr();
      if (ctt !== lastContent) {
        updateStateFromSwaggerEditor();
        setLastContent(ctt);
      }
    });
  };

  const updateStateFromSwaggerEditor = () => {
    console.log('updateStateFromSwaggerEditor');
    const content = window.editor.specSelectors.specStr();
    onChange({ ...value, swagger: { ...value.swagger, content } });
  };

  const killSwaggerEditor = () => {
    console.log('killSwaggerEditor');
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
          label={t('URL', currentLanguage)}
          placeholder="The url of the swagger file"
          value={swagger.url}
          onChange={(url) => onChange({ ...value, swagger: { ...value.swagger, url } })}
        />
      )}
      {!swagger.content && (
        <ObjectInput
          label={t('Headers', currentLanguage)}
          value={swagger.headers}
          onChange={(headers) => onChange({ ...value, swagger: { ...value.swagger, headers } })}
        />
      )}
      <BooleanInput
        label={t('Use swagger content', currentLanguage)}
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
