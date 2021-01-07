import React, { useEffect } from 'react';
import faker from 'faker';
import _ from 'lodash';

import { Option, useStateWithPromise } from '../../utils';
import * as Services from '../../../services';
import { t, Translation } from '../../../locales';
import { BooleanInput, TextInput, SelectInput } from '../../inputs';

export const TeamApiTesting = (props) => {
  const [enabled, setEnabled] = useStateWithPromise(props.value.testing.enabled);
  const [authName, setAuthName] = useStateWithPromise(props.value.testing.name);
  const [clientId, setClientId] = useStateWithPromise(props.value.testing.username);
  const [clientSecret, setClientSecret] = useStateWithPromise(props.value.testing.password);
  const [authType, setAuthType] = useStateWithPromise(props.value.testing.auth);
  const [config, setConfig] = useStateWithPromise(props.value.testing.config);

  useEffect(() => {
    const testing = {
      enabled,
      name: authName,
      auth: authType,
      username: clientId,
      password: clientSecret,
      config,
    };

    if (!_.isEqual(testing, props.value.testing)) {
      props.onChange({ ...props.value, testing });
    }
  }, [enabled, authName, clientId, clientSecret, authType, config]);

  const handleOtoroshiUsage = () => {
    const random = faker.random.alphaNumeric(16);
    const newConfig =
      config && config.otoroshiSettings
        ? config
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
          update: config && config.otoroshiSettings,
          title: t('Otoroshi settings', props.currentLanguage),
          onChange: (apiKey, config) => {
            Promise.all([
              setConfig(config),
              setAuthName('Otoroshi auth'),
              setAuthType('Basic'),
              setClientId(apiKey.clientId),
              setClientSecret(apiKey.clientSecret),
              setEnabled(true),
            ])
              .then(() => {
                props.save(); //FIXME: sometime it does'nt call
              })
              .catch((e) => console.error({ e }));
          },
        }),
      config,
      api: props.value._id,
      currentLanguage: props.currentLanguage,
      description: <div>Description</div>,
    });
  };

  const deleteOtoroshiKey = () => {
    window
      .confirm(
        t(
          'otoroshi.testing.delete.confirm',
          props.currentLanguage,
          false,
          'Are you sure you want to delete these testing settings ?'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.deleteTestingApiKey(props.team._id, {
            otoroshiSettings: props.value.testing.config.otoroshiSettings,
            serviceGroup: props.value.testing.config.serviceGroup,
            clientId: props.value.testing.username,
          }).then(() => {
            Promise.all([
              setConfig(undefined),
              setEnabled(false),
              setAuthName(undefined),
              setAuthType('Basic'),
              setClientId(undefined),
              setClientSecret(undefined),
            ]).then(() => props.save());
          });
        }
      });
  };

  const otoKeyExists = Option(props.value.testing)
    .map((t) => t.config)
    .exists((c) => c.otoroshiSettings);
  return (
    <div className="d-flex">
      <form className="col-6 section pt-2 pr-2">
        <BooleanInput
          value={enabled}
          label={t('Enabled', props.currentLanguage)}
          onChange={(v) => setEnabled(v)}
        />
        <SelectInput
          clearable={false}
          value={{ label: authType, value: authType }}
          placeholder={t('Select a auth type', props.currentLanguage)}
          label={t('Auth. type', props.currentLanguage)}
          possibleValues={[
            { label: 'ApiKey', value: 'ApiKey' },
            { label: 'Basic', value: 'Basic' },
          ]}
          onChange={(value) => setAuthType(value)}
          classNamePrefix="reactSelect"
          className="reactSelect"
        />
        <TextInput
          value={authName}
          label={t('Auth. name', props.currentLanguage)}
          onChange={(v) => setAuthName(v)}
        />
        <TextInput
          value={clientId}
          label={t('Client Id', props.currentLanguage)}
          onChange={(v) => setClientId(v)}
        />
        <TextInput
          value={clientSecret}
          label={t('Client secret', props.currentLanguage)}
          type="password"
          onChange={(v) => setClientSecret(v)}
        />
      </form>
      {!otoKeyExists && (
        <div className="col-6 d-flex justify-content-center align-items-center">
          <button className="btn btn-outline-success" onClick={handleOtoroshiUsage}>
            <Translation i18nkey="testing.key.creation" language={props.currentLanguage}>
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
              <Translation
                i18nkey="otoroshi.test.key.modal.description"
                language={props.currentLanguage}>
                In order to make everything work, you'll have to add a tags match (OneTageIn /
                AllTagIn) in your service descriptor in the 'Api Keys Constraints' section. Make
                sure this service descriptor is the right one for testing and not a production
                system.
              </Translation>
            </p>
            <p>
              <Translation
                i18nkey="otoroshi.test.key.modal.tag.name"
                language={props.currentLanguage}>
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
              {props.value.testing.config.tag}
            </div>
          </div>
          <div className="d-flex justify-content-center align-items-center flex-grow-1">
            <button className="btn btn-outline-danger" onClick={deleteOtoroshiKey}>
              <Translation i18nkey="Delete Testing ApiKey" language={props.currentLanguage}>
                Delete Testing ApiKey
              </Translation>
            </button>
            <button className="btn btn-outline-success ml-1" onClick={handleOtoroshiUsage}>
              <Translation i18nkey="Update Testing ApiKey" language={props.currentLanguage}>
                Update Testing ApiKey
              </Translation>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
