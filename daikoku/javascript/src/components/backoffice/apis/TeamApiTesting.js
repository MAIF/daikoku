import React, { useContext } from 'react';
import { Form, type, format, constraints } from '@maif/react-forms';
import faker from 'faker';
import _, { flow } from 'lodash';
import { useSelector } from 'react-redux';

import { Option } from '../../utils';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';

export const TeamApiTesting = (props) => {
  const testing = props.value.testing;
  const team = useSelector((s) => s.context.currentTeam);
  const { translateMethod, Translation } = useContext(I18nContext);

  console.debug({props})

  const handleOtoroshiUsage = () => {
    const random = faker.random.alphaNumeric(16);
    const newConfig =
      testing.config && testing.config.otoroshiSettings
        ? testing.config
        : {
            otoroshiSettings: null,
            authorizedEntities: null,
            clientName: `testing-purpose-only-apikey-for-${props.value.name}`,
            api: props.value._id,
            tag: `daikoku_testing_${random}`,
            metadata: props.metadata,
          };

    props.openSubMetadataModal({
      save: (metadata) =>
        props.openTestingApiKeyModal({
          metadata,
          otoroshiSettings: props.otoroshiSettings,
          teamId: team._id,
          config: newConfig,
          update: testing.config && testing.config.otoroshiSettings,
          title: translateMethod('Otoroshi settings'),
          onChange: (apiKey, config) => {
            props.onChange({
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
      api: props.value,
      description: <div>Description</div>,
    });
  };

  const deleteOtoroshiKey = () => {
    window.confirm(translateMethod('otoroshi.testing.delete.confirm')).then((ok) => {
      if (ok)
        Services.deleteTestingApiKey(props.team._id, {
          otoroshiSettings: testing.config.otoroshiSettings,
          authorizedEntities: testing.config.authorizedEntities,
          clientId: testing.username,
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

  const schema = {
    enabled: {
      type: type.bool,
      label: translateMethod('Enabled'),
      defaultValue: false,
    },
    auth: {
      type: type.string,
      format: format.buttonsSelect,
      label: translateMethod('Auth. type'),
      options: [
        { label: 'ApiKey', value: 'ApiKey' },
        { label: 'Basic', value: 'Basic' },
      ],
    },
    name: {
      type: type.string,
      label: translateMethod('Auth. name'),
      constraints: [
      ],
    },
    username: {
      type: type.string,
      label: translateMethod('Client Id'),
      constraints: [
      ],
    },
    password: {
      type: type.string,
      format: format.password,
      label: translateMethod('Client secret'),
      constraints: [
      ],
    },
  };

  return (
    <div className="d-flex">
      <Form
        ref={props.reference}
        schema={schema}
        onSubmit={(testing) => props.onChange({ ...props.value, testing })}
        value={props.value.testing}
        footer={() => null}
      />
      {!otoKeyExists && (
        <div className="col-6 d-flex justify-content-center align-items-center">
          <button className="btn btn-outline-success" onClick={handleOtoroshiUsage}>
            <Translation i18nkey="testing.key.creation">
              Use Otoroshi to create testing ApiKey
            </Translation>
          </button>
        </div>
      )}
      {!!otoKeyExists && (
        <div className="d-flex flex-column pt-2 pe-2">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'flex-start',
            }}
          >
            <p>
              <Translation i18nkey="otoroshi.test.key.modal.description">
                In order to make everything work, you'll have to add a tags match (OneTageIn /
                AllTagIn) in your service descriptor in the 'Api Keys Constraints' section. Make
                sure this service descriptor is the right one for testing and not a production
                system.
              </Translation>
            </p>
            <p>
              <Translation i18nkey="otoroshi.test.key.modal.tag.name">
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
              }}
            >
              {testing.config.tag}
            </div>
          </div>
          <div className="d-flex justify-content-center align-items-center flex-grow-1">
            <button className="btn btn-outline-danger" onClick={deleteOtoroshiKey}>
              <Translation i18nkey="Delete Testing ApiKey">Delete Testing ApiKey</Translation>
            </button>
            <button className="btn btn-outline-success ms-1" onClick={handleOtoroshiUsage}>
              <Translation i18nkey="Update Testing ApiKey">Update Testing ApiKey</Translation>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
