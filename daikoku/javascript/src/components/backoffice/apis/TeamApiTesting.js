import React from 'react';
import faker from 'faker';
import _ from 'lodash';

import { Option } from '../../utils';
import * as Services from '../../../services';
import { t, Translation } from '../../../locales';
import { BooleanInput, TextInput, SelectInput } from '../../inputs';

export const TeamApiTesting = (props) => {
  const testing = props.value.testing;

  const handleOtoroshiUsage = () => {
    const random = faker.random.alphaNumeric(16);
    const newConfig =
      testing.config && testing.config.otoroshiSettings
        ? testing.config
        : {
            otoroshiSettings: null,
            serviceGroup: null,
            clientName: `testing-purpose-only-apikey-for-${props.value.name}`,
            api: props.value._id,
            tag: `daikoku_testing_${random}`,
            metadata: props.metadata,
          };

    props.openSubMetadataModal({
      save: (metadata) =>
        props.openTestingApiKeyModal({
          currentLanguage: props.currentLanguage,
          metadata,
          otoroshiSettings: props.otoroshiSettings,
          teamId: props.teamId,
          config: newConfig,
          update: testing.config && testing.config.otoroshiSettings,
          title: t('Otoroshi settings', props.currentLanguage),
          onChange: (apiKey, config) => {
            props.onAction({
              ...props.value,
              testing: {
                config,
                enabled: true,
                name: 'Otoroshi auth',
                auth: 'Basic',
                username: apiKey.clientId,
                password: apiKey.clientSecret,
              },
            });
          },
        }),
      config: testing.config,
      api: props.value._id,
      currentLanguage: props.currentLanguage,
      description: <div>Description</div>,
    });
  };

  const deleteOtoroshiKey = () => {
    window.confirm(t('otoroshi.testing.delete.confirm', props.currentLanguage)).then((ok) => {
      if (ok)
        Services.deleteTestingApiKey(props.team._id, {
          otoroshiSettings: testing.config.otoroshiSettings,
          serviceGroup: testing.config.serviceGroup,
          clientId: testing.name,
        }).then(() =>
          props.onAction({
            ...props.value,
            testing: {
              config: {},
              enabled: false,
              name: undefined,
              auth: 'Basic',
              username: undefined,
              password: undefined,
            },
          })
        );
    });
  };

  const setTesting = (t) => {
    props.onChange({ ...props.value, testing: t });
  };

  const otoKeyExists = Option(props.value.testing)
    .map((t) => t.config)
    .exists((c) => c.otoroshiSettings);

  const lang = props.currentLanguage;

  return (
    <div className="d-flex">
      <form className="col-6 section pt-2 pr-2">
        <BooleanInput
          value={testing.enabled}
          label={t('Enabled', lang)}
          onChange={(enabled) => setTesting({ ...testing, enabled })}
        />
        <SelectInput
          clearable={false}
          value={{ label: testing.auth, value: testing.auth }}
          placeholder={t('Select a auth type', lang)}
          label={t('Auth. type', lang)}
          possibleValues={[
            { label: 'ApiKey', value: 'ApiKey' },
            { label: 'Basic', value: 'Basic' },
          ]}
          onChange={(auth) => setTesting({ ...testing, auth })}
          classNamePrefix="reactSelect"
          className="reactSelect"
        />
        <TextInput
          value={testing.name}
          label={t('Auth. name', lang)}
          onChange={(name) => setTesting({ ...testing, name })}
        />
        <TextInput
          value={testing.username}
          label={t('Client Id', lang)}
          onChange={(username) => setTesting({ ...testing, username })}
        />
        <TextInput
          value={testing.password}
          label={t('Client secret', lang)}
          type="password"
          onChange={(password) => setTesting({ ...testing, password })}
        />
      </form>
      {!otoKeyExists && (
        <div className="col-6 d-flex justify-content-center align-items-center">
          <button className="btn btn-outline-success" onClick={handleOtoroshiUsage}>
            <Translation i18nkey="testing.key.creation" language={lang}>
              Use Otoroshi to create testing ApiKey
            </Translation>
          </button>
        </div>
      )}
      {!!otoKeyExists && (
        <div className="d-flex flex-column pt-2 pr-2">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'flex-start',
            }}>
            <p>
              <Translation i18nkey="otoroshi.test.key.modal.description" language={lang}>
                In order to make everything work, you'll have to add a tags match (OneTageIn /
                AllTagIn) in your service descriptor in the 'Api Keys Constraints' section. Make
                sure this service descriptor is the right one for testing and not a production
                system.
              </Translation>
            </p>
            <p>
              <Translation i18nkey="otoroshi.test.key.modal.tag.name" language={lang}>
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
              {testing.config.tag}
            </div>
          </div>
          <div className="d-flex justify-content-center align-items-center flex-grow-1">
            <button className="btn btn-outline-danger" onClick={deleteOtoroshiKey}>
              <Translation i18nkey="Delete Testing ApiKey" language={lang}>
                Delete Testing ApiKey
              </Translation>
            </button>
            <button className="btn btn-outline-success ml-1" onClick={handleOtoroshiUsage}>
              <Translation i18nkey="Update Testing ApiKey" language={lang}>
                Update Testing ApiKey
              </Translation>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
