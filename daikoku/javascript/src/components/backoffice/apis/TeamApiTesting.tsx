import { Form, FormRef, format, type } from '@maif/react-forms';
import { nanoid } from 'nanoid';
import { MutableRefObject, useContext } from 'react';
import { useSelector } from 'react-redux';

import { useDispatch } from 'react-redux';
import { ModalContext } from '../../../contexts';
import { I18nContext } from '../../../core';
import * as Services from '../../../services';
import { IApi, IState, ITeamSimple, ITesting, ITestingConfig, IUsagePlan, IWithTesting } from '../../../types';
import { Option } from '../../utils';

interface TeamApiTestingProps<T extends IWithTesting> {
  value: T
  onChange: (s: T) => void
  reference?: MutableRefObject<FormRef | undefined>
  metadata: object,
  plan?: IUsagePlan
}

export const TeamApiTesting = <T extends IWithTesting>(props: TeamApiTestingProps<T>) => {
  const testing = props.value.testing;
  const currentTeam = useSelector<IState, ITeamSimple>((s) => s.context.currentTeam);
  const { translate, Translation } = useContext(I18nContext);
  const { confirm, openTestingApikeyModal, openSubMetadataModal } = useContext(ModalContext);

  const handleOtoroshiUsage = () => {
    const random = nanoid(16);
    const newConfig =
      testing?.config && testing.config.otoroshiSettings
        ? testing.config
        : {
          clientName: `testing-purpose-only-apikey-for-${props.value.name || props.value.customName || props.value._id}`,
          api: props.value._id,
          tag: `daikoku_testing_${random}`,
          metadata: props.metadata,
        };

    openSubMetadataModal({
      save: (metadata) => {
        openTestingApikeyModal({
          metadata,
          teamId: currentTeam._id,
          config: newConfig,
          update: !!testing?.config && !!testing.config.otoroshiSettings,
          title: translate('Otoroshi settings'),
          value: props.value,
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
        })
      },
      config: testing?.config,
      value: props.value,
      description: <div>Description</div>,
      noClose: true
    });
  };

  const deleteOtoroshiKey = () => {
    confirm({ message: translate('otoroshi.testing.delete.confirm') })
      .then((ok) => {
        if (ok)
          Services.deleteTestingApiKey(currentTeam._id, {
            otoroshiSettings: testing!.config!.otoroshiSettings,
            authorizedEntities: testing!.config!.authorizedEntities,
            clientId: testing!.username,
          })
            .then(() => props.onChange({
              ...props.value,
              testing: {
                config: {},
                enabled: false,
                name: undefined,
                auth: 'Basic',
                username: undefined,
                password: undefined,
              },
            }));
      });
  };

  const otoKeyExists: Boolean = Option(props.value.testing)
    .map((t: ITesting) => t.config)
    .exists((c: ITestingConfig) => c.otoroshiSettings);

  const schema = {
    enabled: {
      type: type.bool,
      label: translate('Enabled'),
      defaultValue: false,
    },
    auth: {
      type: type.string,
      format: format.buttonsSelect,
      label: translate('Auth. type'),
      options: [
        { label: 'ApiKey', value: 'ApiKey' },
        { label: 'Basic', value: 'Basic' },
      ],
    },
    name: {
      type: type.string,
      label: translate('Auth. name'),
      constraints: [],
    },
    username: {
      type: type.string,
      label: translate('Client Id'),
      constraints: [],
    },
    password: {
      type: type.string,
      format: format.password,
      label: translate('Client secret'),
      constraints: [],
    },
  };

  return (
    <div className="d-flex">
      <Form
        ref={props.reference}
        schema={schema}
        onSubmit={(testing) => props.onChange({ ...props.value, testing })}
        value={props.value.testing}
        options={{
          actions: {
            submit: {
              display: !props.reference,
              label: translate('Save')
            }
          }
        }}
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
              {testing?.config?.tag || 'no tag :('}
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
