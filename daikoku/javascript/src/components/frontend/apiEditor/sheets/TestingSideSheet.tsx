import { constraints, Form, format, FormRef, Schema, type } from '@maif/react-forms';
import { nanoid } from 'nanoid';
import { RefObject, useContext, useRef, useState } from 'react';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import { IOtoroshiApiKey, isApi, isError, ITeamSimple, ITesting, ITestingConfig, IWithTesting } from '../../../../types';
import { ChoiceChips } from '../../../inputs';
import { InfoCallout, SideSheet, SideSheetActions } from '../../../utils';

export const withoutGeneratedKey = (testing?: ITesting): ITesting | undefined =>
  testing?.config?.otoroshiSettings
    ? { ...testing, name: undefined, username: undefined, password: undefined, config: undefined }
    : testing;

type KeyView = {
  config: ITestingConfig;
  update: boolean;
  replaces?: ITesting;
};

type TestingSideSheetProps<T extends IWithTesting> = {
  entity: T;
  entityId: string;
  ownerTeam: ITeamSimple;
  save: (entity: T) => Promise<unknown>;
  onClose: () => void;
};

export const TestingSideSheet = <T extends IWithTesting>(props: TestingSideSheetProps<T>) => {
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  const formRef = useRef<FormRef | undefined>(undefined);
  const keyFormRef = useRef<FormRef | undefined>(undefined);

  const [keyView, setKeyView] = useState<KeyView>();
  const [draft, setDraft] = useState<ITesting>();
  const [created, setCreated] = useState<ITesting>();
  const [replaced, setReplaced] = useState<ITesting>();
  const [keyUpdate, setKeyUpdate] = useState<ITestingConfig>();
  const [pending, setPending] = useState(false);

  const shown = draft ?? props.entity.testing;
  const generated = !!shown?.config?.otoroshiSettings;
  const hasSavedKey = generated || !!shown?.username;

  const entityName = (props.entity as any).customName || (props.entity as any).name || props.entity._id;

  const toTesting = (values: any): ITesting => ({
    url: values.url,
    enabled: !!values.enabled,
    allowSubscriberKeys: !!values.allowSubscriberKeys,
    auth: values.auth ?? 'Basic',
    name: values.name,
    username: values.username,
    password: values.password,
    config: shown?.config,
  });

  const deleteOtoroshiKey = (old: ITesting) =>
    Services.deleteTestingApiKey(props.ownerTeam._id, {
      otoroshiSettings: old.config?.otoroshiSettings,
      clientId: old.username,
    });

  const keyBody = (config: ITestingConfig) =>
    ({
      ...config,
      entity: { type: isApi(props.entity) ? 'api' : 'plan', _id: props.entity._id, name: entityName },
    }) as ITestingConfig;

  const persist = (updated: ITesting) =>
    props
      .save({ ...props.entity, testing: updated })
      .then(() => (replaced ? deleteOtoroshiKey(replaced) : undefined))
      .then(props.onClose);

  const saveTesting = (updated: ITesting) => {
    if (!keyUpdate) {
      return persist(updated);
    }

    return Services.updateTestingApiKey(props.ownerTeam._id, keyBody(keyUpdate)).then((response) => {
      if (isError(response)) {
        toast.error(response.error);
        return;
      }

      return persist(updated);
    });
  };

  const close = () => {
    if (created) {
      deleteOtoroshiKey(created);
    }
    props.onClose();
  };

  const openKeyView = (view: KeyView) => {
    setDraft(toTesting(formRef.current?.methods.data() ?? shown ?? {}));
    setKeyView(view);
  };

  const newKeyConfig = (): ITestingConfig => ({
    clientName: `testing-purpose-only-apikey-for-${entityName}`,
    api: props.entity._id,
    tag: `daikoku_testing_${nanoid(16)}`,
    customMetadata: {},
  });

  const generateKey = () => openKeyView({ config: newKeyConfig(), update: false, replaces: generated ? shown : undefined });

  const deleteKey = () =>
    confirm({ message: translate('otoroshi.testing.delete.confirm') }).then((ok) => {
      if (!ok || !shown) {
        return;
      }

      return deleteOtoroshiKey(shown).then((response) => {
        if (isError(response)) {
          toast.error(response.error);
          return;
        }

        const current = toTesting(formRef.current?.methods.data() ?? shown);
        const cleared = { ...current, name: undefined, username: undefined, password: undefined, config: undefined };

        setKeyUpdate(undefined);

        if (created) {
          setCreated(undefined);
          setDraft(cleared);
          return;
        }

        return persist(cleared);
      });
    });

  const saveKey = (config: ITestingConfig) => {
    if (keyView!.update) {
      setKeyUpdate(config);
      setDraft({ ...toTesting(draft ?? {}), config });
      setKeyView(undefined);
      return;
    }

    setPending(true);
    Services.createTestingApiKey(props.ownerTeam._id, keyBody(config))
      .then((apiKey: IOtoroshiApiKey | { error: string }) => {
        if (isError(apiKey)) {
          toast.error(apiKey.error);
          return;
        }

        const next: ITesting = {
          ...toTesting(draft ?? {}),
          auth: 'Basic',
          name: 'Otoroshi auth',
          username: apiKey.clientId,
          password: apiKey.clientSecret,
          config,
        };

        if (created) {
          deleteOtoroshiKey(created);
        } else if (keyView!.replaces) {
          setReplaced(keyView!.replaces);
        }

        setCreated(next);
        setKeyUpdate(undefined);
        setDraft(next);
        setKeyView(undefined);
      })
      .finally(() => setPending(false));
  };

  const keyFields = ({ rawValues }: { rawValues: any }) =>
    !!rawValues.enabled && (hasSavedKey || rawValues.keySource === 'declare');

  const schema: Schema = {
    enabled: {
      type: type.bool,
      label: translate('Enabled'),
      defaultValue: false,
    },
    enabledInfo: {
      type: type.string,
      label: null,
      render: () => <InfoCallout>{translate('testing.enabled.help')}</InfoCallout>,
    },
    url: {
      type: type.string,
      label: translate('api.testing.url.label'),
      visible: ({ rawValues }) => !!rawValues.enabled,
      constraints: [constraints.when('enabled', (enabled) => !!enabled, [constraints.required()])],
    },
    allowSubscriberKeys: {
      type: type.bool,
      label: translate('testing.subscriber.keys.label'),
      visible: ({ rawValues }) => !!rawValues.enabled,
      defaultValue: false,
    },
    allowSubscriberKeysInfo: {
      type: type.string,
      label: null,
      visible: ({ rawValues }) => !!rawValues.enabled,
      render: () => <InfoCallout variant="warning">{translate('testing.subscriber.keys.help')}</InfoCallout>,
    },
    keySource: {
      type: type.string,
      label: null,
      visible: ({ rawValues }) => !!rawValues.enabled && !hasSavedKey,
      render: ({ value, onChange }) => (
        <ChoiceChips
          label={translate('testing.key.source.label')}
          options={[
            { value: 'generate', label: translate('testing.key.source.generate') },
            { value: 'declare', label: translate('testing.key.source.declare') },
          ]}
          value={value}
          onChange={(source) => onChange?.(source)}
        />
      ),
    },
    generateAction: {
      type: type.string,
      label: null,
      visible: ({ rawValues }) => !!rawValues.enabled && !hasSavedKey && rawValues.keySource === 'generate',
      render: () => (
        <button type="button" className="btn --secondary" onClick={generateKey}>
          {translate('testing.key.configure')}
        </button>
      ),
    },
    auth: {
      type: type.string,
      label: null,
      visible: keyFields,
      render: ({ value, onChange }) => (
        <ChoiceChips
          label={translate('Auth. type')}
          options={[
            { label: translate('API key'), value: 'ApiKey' },
            { label: translate('Basic auth.'), value: 'Basic' },
          ]}
          value={value ?? 'Basic'}
          disabled={generated}
          onChange={(auth) => onChange?.(auth)}
        />
      ),
    },
    name: {
      type: type.string,
      label: translate('Auth. name'),
      visible: keyFields,
      disabled: generated,
    },
    username: {
      type: type.string,
      label: ({ rawValues }) => (rawValues.auth === 'ApiKey' ? translate('API key') : translate('Client Id')),
      visible: keyFields,
      disabled: generated,
    },
    password: {
      type: type.string,
      format: format.password,
      label: translate('Client secret'),
      visible: ({ rawValues }) => keyFields({ rawValues }) && rawValues.auth !== 'ApiKey',
      disabled: generated,
    },
  };

  const keyActionsEntry: Schema = {
    keyActions: {
      type: type.string,
      label: null,
      visible: ({ rawValues }) => !!rawValues.enabled && hasSavedKey,
      render: () => (
        <div className="d-flex flex-column gap-3">
          {generated && (
            <InfoCallout title={translate('testing.key.generated.title')}>
              <p className="mb-1">{translate('otoroshi.test.key.modal.description.1')}</p>
              <ol className="mb-1">
                <li>{translate('otoroshi.test.key.modal.description.2')}</li>
                <li>
                  {translate('otoroshi.test.key.modal.description.3')} <code>{shown?.config?.tag}</code>
                </li>
              </ol>
              <p className="mb-0">{translate('otoroshi.test.key.modal.description.4')}</p>
            </InfoCallout>
          )}
          <div className="d-flex flex-wrap gap-2">
            {generated && !created && (
              <button
                type="button"
                className="btn --secondary"
                onClick={() => openKeyView({ config: shown!.config!, update: true })}
              >
                {translate('Update Testing ApiKey')}
              </button>
            )}
            {generated && (
              <button type="button" className="btn --secondary" onClick={deleteKey}>
                {translate('Delete Testing ApiKey')}
              </button>
            )}
            <button type="button" className="btn --secondary" onClick={generateKey}>
              {translate('testing.key.regenerate')}
            </button>
          </div>
        </div>
      ),
    },
  };

  return (
    <SideSheet
      title={translate(keyView ? 'testing.key.sheet.title' : 'update.api.testing.btn.label')}
      size="wide"
      onClose={close}
      onBack={keyView ? () => setKeyView(undefined) : undefined}
      isDirty={() => !!keyView || !!created || !!keyUpdate || !!formRef.current?.methods.formState.isDirty}
      footer={(requestClose) =>
        keyView ? (
          <SideSheetActions
            onCancel={() => setKeyView(undefined)}
            onSave={() => keyFormRef.current?.handleSubmit()}
            saveLabel={translate(keyView.update ? 'Update' : 'Create')}
            saveDisabled={pending}
          />
        ) : (
          <SideSheetActions
            onCancel={requestClose}
            onSave={() => formRef.current?.handleSubmit()}
          />
        )
      }
    >
      {keyView ? (
        <TestingKeyForm
          formRef={keyFormRef}
          teamId={props.ownerTeam._id}
          value={keyView.config}
          onSubmit={saveKey}
        />
      ) : (
        <Form
          ref={formRef}
          schema={{ ...schema, ...keyActionsEntry }}
          flow={[
            'enabled',
            'enabledInfo',
            'url',
            'allowSubscriberKeys',
            'allowSubscriberKeysInfo',
            'keySource',
            'generateAction',
            'keyActions',
            'auth',
            'name',
            'username',
            'password',
          ]}
          value={shown}
          onSubmit={(values) => saveTesting(toTesting(values))}
          footer={() => <></>}
        />
      )}
    </SideSheet>
  );
};

type TestingKeyFormProps = {
  formRef: RefObject<FormRef | undefined>;
  teamId: string;
  value: ITestingConfig;
  onSubmit: (config: ITestingConfig) => void;
};

const TestingKeyForm = (props: TestingKeyFormProps) => {
  const { translate } = useContext(I18nContext);
  const { tenant } = useContext(GlobalContext);

  const otoroshiEntities = (
    load: (teamId: string, otoroshiId: string) => Promise<any>
  ) => ({
    type: type.string,
    format: format.select,
    isMulti: true,
    deps: ['otoroshiSettings'],
    optionsFrom: ({ rawValues }: any) =>
      rawValues.otoroshiSettings ? load(props.teamId, rawValues.otoroshiSettings) : Promise.resolve([]),
    transformer: (entity: any) => ({ label: entity.name, value: entity.id }),
  });

  const schema: Schema = {
    otoroshiSettings: {
      type: type.string,
      format: format.select,
      label: translate('Otoroshi instance'),
      optionsFrom: () => Services.allSimpleOtoroshis(tenant._id).then((r) => (isError(r) ? [] : r)),
      transformer: (o: any) => ({ label: o.url, value: o._id }),
      constraints: [constraints.required(translate('constraints.required.otoroshi.settings'))],
    },
    authorizedEntities: {
      type: type.object,
      format: format.form,
      label: translate('Authorized entities'),
      help: translate('authorized.entities.help'),
      schema: {
        groups: otoroshiEntities(Services.getOtoroshiGroupsAsTeamAdmin),
        services: otoroshiEntities(Services.getOtoroshiServicesAsTeamAdmin),
        routes: otoroshiEntities(Services.getOtoroshiRoutesAsTeamAdmin),
      },
      constraints: [
        constraints.required(translate('constraints.required.authorizedEntities')),
        constraints.test(
          'test',
          translate('constraint.min.authorizedEntities'),
          (v) => v?.services?.length || v?.groups?.length || v?.routes?.length
        ),
      ],
    },
    customMetadata: {
      type: type.object,
      label: translate('Metadata'),
    },
    customMaxPerSecond: {
      type: type.number,
      label: translate('Max. requests per second'),
    },
    customMaxPerDay: {
      type: type.number,
      label: translate('Max. requests per day'),
    },
    customMaxPerMonth: {
      type: type.number,
      label: translate('Max. requests per month'),
    },
    customReadOnly: {
      type: type.bool,
      label: translate('Read only apikey'),
    },
  };

  return (
    <Form
      ref={props.formRef}
      schema={schema}
      value={props.value}
      onSubmit={props.onSubmit}
      footer={() => <></>}
    />
  );
};
