import { Form, FormRef, Schema, constraints, format, type } from '@maif/react-forms';
import { nanoid } from 'nanoid';
import { MutableRefObject, useContext } from 'react';

import { I18nContext, ModalContext } from '../../../contexts';
import * as Services from '../../../services';
import { IApi, ITeamSimple, ITesting, ITestingConfig, IUsagePlan, IWithTesting, isUsagePlan } from '../../../types';
import { Option } from '../../utils';

interface TeamApiTestingProps<T extends IWithTesting> {
  currentTeam: ITeamSimple;
  value: T
  save: (s: T) => void
  reference?: MutableRefObject<FormRef | undefined>
  // metadata: object,
  plan?: IUsagePlan,
  api?: IApi
  _id: string
}

export const TeamApiTesting = <T extends IWithTesting>(props: TeamApiTestingProps<T>) => {
  const testing = props.value.testing;
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
          metadata: {},
        };

    openSubMetadataModal({
      save: (metadata) => {
        openTestingApikeyModal({
          metadata,
          teamId: props.currentTeam._id,
          config: newConfig,
          update: !!testing?.config && !!testing.config.otoroshiSettings,
          title: translate('Otoroshi settings'),
          value: props.value,
          onChange: (apiKey, config) => {
            props.save({
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
      api: props._id,
      plan: isUsagePlan(props.value) ? props.value._id : undefined,
      description: <div>Description</div>,
      noClose: true
    });
  };

  const deleteOtoroshiKey = () => {
    confirm({ message: translate('otoroshi.testing.delete.confirm') })
      .then((ok) => {
        if (ok)
          Services.deleteTestingApiKey(props.currentTeam._id, {
            otoroshiSettings: testing!.config!.otoroshiSettings,
            authorizedEntities: testing!.config!.authorizedEntities,
            clientId: testing!.username,
          })
            .then(() => props.save({
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

  const schema: Schema = {
    url: {
      type: type.string,
      label: translate('api.testing.url.label'),
      constraints: [
        constraints.required()
      ]
    },
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
        { label: translate('API key'), value: 'ApiKey' },
        { label: translate('Basic auth.'), value: 'Basic' },
      ],
    },
    name: {
      type: type.string,
      label: translate('Auth. name'),
      constraints: [],
    },
    username: {
      type: type.string,
      label: ({ rawValues }) => rawValues.auth === 'Basic' ? translate('Client Id') : translate('API key'),
      constraints: [],
    },
    password: {
      type: type.string,
      format: format.password,
      label: translate('Client secret'),
      constraints: [],
      visible: ({ rawValues }) => rawValues.auth === 'Basic'
    },
  };

  return (
    <div className="d-flex gap-3">
      <Form
        className='col-6'
        ref={props.reference}
        schema={schema}
        onSubmit={(testing) => props.save({ ...props.value, testing })}
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
            <p className='alert alert-info'>
              {translate("otoroshi.test.key.modal.description.1")}
              <ol>
                <li>{translate("otoroshi.test.key.modal.description.2")}</li>
                <li>{translate("otoroshi.test.key.modal.description.3")}</li>
              </ol>
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
            <p className='alert alert-warning'>
              {translate("otoroshi.test.key.modal.description.4")}
            </p>
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
