import React, { Component } from 'react';

import { t, Translation } from "../../../locales";
import { SingleJsonInput, TextInput, BooleanInput, ObjectInput,  } from '../../inputs';

export class TeamApiSwagger extends Component {

  componentDidMount() {
    if (!!this.props.value.swagger.content) {
      this.initSwaggerEditor(this.props.value.swagger.content);
    }
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (!this.props.value.swagger.content && !!nextProps.value.swagger.content) {
      this.initSwaggerEditor(nextProps.value.swagger.content);
    } else {
      if (!nextProps.value.swagger.content) {
        this.killSwaggerEditor();
      }
    }
  }

  initSwaggerEditor = (content) => {
    console.log('initSwaggerEditor')
    window.editor = SwaggerEditorBundle({
      dom_id: '#swagger-editor',
      layout: 'StandaloneLayout',
      presets: [
        SwaggerEditorStandalonePreset
      ],
      showExtensions: false,
      swagger2GeneratorUrl: 'https://generator.swagger.io/api/swagger.json',
      oas3GeneratorUrl: 'https://generator3.swagger.io/openapi.json',
      swagger2ConverterUrl: 'https://converter.swagger.io/api/convert',
      spec: content
    });
    this.lastContent = content;
    window.editor.specActions.updateSpec(content);
    this.unsubscribe = window.editor.getStore().subscribe(() => {
      const ctt = window.editor.specSelectors.specStr();
      if (ctt !== this.lastContent) {
        this.updateStateFromSwaggerEditor();
        this.lastContent = ctt;
      }
    });
  };

  updateStateFromSwaggerEditor = () => {
    console.log('updateStateFromSwaggerEditor')
    const spec = window.editor.specSelectors.specStr();
    const value = this.props.value;
    value.swagger.content = spec;
    this.props.onChange(value);
  }

  killSwaggerEditor = () => {
    console.log('killSwaggerEditor')
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  componentWillUnmount() {
    this.killSwaggerEditor();
  }

  render() {
    const swagger = this.props.value.swagger;
    return (
      <form>
        {!swagger.content && (
          <TextInput
            label={t("URL", this.props.currentLanguage)}
            placeholder="The url of the swagger file"
            value={swagger.url}
            help="..."
            onChange={e => {
              const value = this.props.value;
              value.swagger.url = e;
              this.props.onChange(value);
            }}
          />
        )}
        {!swagger.content && (
          <ObjectInput
            label={t("Headers", this.props.currentLanguage)}
            value={swagger.headers}
            help="..."
            onChange={e => {
              const value = this.props.value;
              value.swagger.headers = e;
              this.props.onChange(value);
            }}
          />
        )}
        <BooleanInput
          label={t("Use swagger content", this.props.currentLanguage)}
          value={!!swagger.content}
          help="..."
          onChange={e => {
            const value = this.props.value;
            if (e) {
              value.swagger.content = JSON.stringify(
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
              value.swagger.content = null;
            }
            this.props.onChange(value);
          }}
        />
        {/*!!swagger.content && (
          <div style={{ width: '100%', marginBottom: 20 }}>
            <SingleJsonInput
              height={window.innerHeight - 300 + 'px'}
              value={swagger.content}
              onChange={code => {
                const value = this.props.value;
                value.swagger.content = code;
                this.props.onChange(value);
              }}
            />
          </div>
            )*/}
        {!!swagger.content && (
          <div id="swagger-editor" style={{ height: (window.outerHeight - 60 - 58) }}></div>
        )}
      </form>
    );
  }
}
