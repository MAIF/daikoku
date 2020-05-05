import React, { Component } from 'react';
import faker from 'faker';

import { Spinner } from '../../utils';
import * as Services from '../../../services';
import { t, Translation } from '../../../locales';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

class GenerateApiKeyModal extends Component {
  state = {
    tenant: null,
    config: this.props.config,
  };

  otoroshiFlow = () => {
    return ['otoroshiSettings', 'serviceGroup'];
  };

  otoroshiForm = (_found) => {
    if (!_found.otoroshiSettings) {
      return {
        otoroshiSettings: {
          type: 'select',
          props: {
            label: t('Otoroshi instance', this.props.currentLanguage),
            possibleValues: this.props.otoroshiSettings.map((s) => ({
              label: s.url,
              value: s._id,
            })),
          },
        },
        serviceGroup: {
          type: 'select',
          disabled: true,
          props: {
            label: t('Otoroshi instance', this.props.currentLanguage),
          },
        },
      };
    }
    const form = {
      otoroshiSettings: {
        type: 'select',
        props: {
          label: t('Otoroshi instance', this.props.currentLanguage),
          possibleValues: this.props.otoroshiSettings.map((s) => ({
            label: s.url,
            value: s._id,
          })),
        },
      },
      serviceGroup: {
        type: 'select',
        props: {
          label: t('Service group', this.props.currentLanguage),
          valuesFrom: `/api/teams/${this.props.teamId}/tenant/otoroshis/${_found.otoroshiSettings}/groups`,
          transformer: (s) => ({ label: s.name, value: s.id }),
        },
      },
    };
    return form;
  };

  generateApiKey = () => {
    Services.createTestingApiKey(this.props.teamId, this.state.config).then((apikey) => {
      this.props.changeValue('username', apikey.clientId);
      this.props.changeValue('password', apikey.clientSecret);
      // this.props.changeValue('auth', 'Basic');
      this.props.close();
    });
  };

  render() {
    const config = this.state.config;
    return (
      <div style={{ fontWeight: 'normal' }}>
        <React.Suspense fallback={<Spinner />}>
          <LazyForm
            flow={this.otoroshiFlow()}
            schema={this.otoroshiForm(config)}
            value={config}
            onChange={(config) => this.setState({ config })}
          />
        </React.Suspense>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-start',
          }}>
          <p>
            <Translation
              i18nkey="otoroshi.test.key.modal.description"
              language={this.props.currentLanguage}>
              In order to make everything work, you'll have to add a tags match (OneTageIn /
              AllTagIn) in your service descriptor in the 'Api Keys Constraints' section. Make sure
              this service descriptor is the right one for testing and not a production system.
            </Translation>
          </p>
          <p>
            <Translation
              i18nkey="otoroshi.test.key.modal.tag.name"
              language={this.props.currentLanguage}>
              The tag you need to add is the following
            </Translation>
          </p>
          <div
            style={{
              padding: 10,
              borderRadius: 5,
              color: 'white',
              backgroundColor: 'rgb(73, 73, 72)',
              width: '100%',
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'center',
            }}>
            {config.tag}
          </div>
          <p>
            <Translation
              i18nkey="otoroshi.test.key.modal.apikey.name"
              language={this.props.currentLanguage}>
              the name of the apikey will be
            </Translation>
          </p>
          <div
            style={{
              padding: 10,
              borderRadius: 5,
              color: 'white',
              backgroundColor: 'rgb(73, 73, 72)',
              width: '100%',
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'center',
            }}>
            {config.clientName}
          </div>
        </div>
        {!!config.otoroshiSettings && !!config.serviceGroup && (
          <button type="button" className="btn btn-success" onClick={this.generateApiKey}>
            <i className="fas fa-key mr-1" />
            <Translation i18nkey="Generate" language={this.props.currentLanguage}>
              Generate
            </Translation>
          </button>
        )}
        {!config.otoroshiSettings && !config.serviceGroup && (
          <button type="button" className="btn btn-success" disabled>
            <i className="fas fa-key mr-1" />
            <Translation i18nkey="Generate" language={this.props.currentLanguage}>
              Generate
            </Translation>
          </button>
        )}
      </div>
    );
  }
}

class GenerateApiKey extends Component {
  showGenerateApiKeyModal = () => {
    const random = faker.random.alphaNumeric(16);
    const config = {
      otoroshiSettings: null,
      serviceGroup: null,
      clientName: `testing-purpose-only-apikey-for-${this.props.apiName()}`,
      api: this.props.api(),
      tag: `daikoku_testing_${random}`,
    };
    window.alert(
      (close) => (
        <GenerateApiKeyModal
          currentLanguage={this.props.currentLanguage}
          changeValue={this.props.changeValue}
          close={close}
          teamId={this.props.teamId()}
          config={config}
          otoroshiSettings={this.props.otoroshiSettings}
        />
      ),
      t('Generate an apikey for testing', this.props.currentLanguage)
    );
  };

  render() {
    return (
      <div className="form-group row">
        <label className="col-xs-12 col-sm-2 col-form-label" />
        <div className="col-sm-10">
          <button
            type="button"
            className="btn btn-outline-success"
            onClick={() => this.showGenerateApiKeyModal()}>
            <i className="fas fa-key mr-1" />
            <Translation
              i18nkey="otoroshi.test.key.generator.button"
              language={this.props.currentLanguage}>
              Generate a dedicated testing key in Otoroshi
            </Translation>
          </button>
        </div>
      </div>
    );
  }
}

export class TeamApiTesting extends Component {
  formSchema = {
    enabled: {
      type: 'bool',
      props: { label: t('Enabled', this.props.currentLanguage) },
    },
    name: {
      type: 'string',
      props: {
        label: t('Auth. name', this.props.currentLanguage),
        placeholder: t('The auth. name in api swagger', this.props.currentLanguage),
      },
    },
    username: {
      type: 'string',
      props: {
        label: t('Client Id', this.props.currentLanguage),
        placeholder: t('The apikey client id', this.props.currentLanguage),
      },
    },
    password: {
      type: 'string',
      visible: () => this.props.value.testing.auth === 'Basic',
      props: {
        label: t('Client secret', this.props.currentLanguage),
        placeholder: t('The apikey client secret', this.props.currentLanguage),
        type: 'password',
      },
    },
    auth: {
      type: 'select',
      props: {
        label: t('Auth. type', this.props.currentLanguage),
        possibleValues: [
          { label: 'ApiKey', value: 'ApiKey' },
          { label: 'Basic', value: 'Basic' },
        ],
      },
    },
    generateApiKey: {
      type: GenerateApiKey,
      props: {
        teamId: () => this.props.teamId,
        apiName: () => this.props.value.name,
        api: () => this.props.value.id || this.props.value._id,
        changeValue: this.props.changeValue,
        currentLanguage: this.props.currentLanguage,
        otoroshiSettings: this.props.otoroshiSettings,
      },
    },
  };

  formFlow = ['enabled', 'name', 'username', 'password', 'auth', 'generateApiKey'];

  render() {
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          flow={this.formFlow}
          schema={this.formSchema}
          value={this.props.value.testing}
          onChange={(testing) => this.props.onChange({ ...this.props.value, testing })}
        />
      </React.Suspense>
    );
  }
}
