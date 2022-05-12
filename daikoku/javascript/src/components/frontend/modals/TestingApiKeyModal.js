import React, { useContext, useState, useEffect } from 'react';
import Select, { components } from 'react-select';

import { Help } from '../../inputs';
import { Spinner } from '../../utils';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

const OtoroshiServicesAndGroupSelector = (props) => {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState(undefined);
  const [services, setServices] = useState(undefined);
  const [disabled, setDisabled] = useState(true);
  const [value, setValue] = useState(undefined);

  const { Translation } = useContext(I18nContext);

  useEffect(() => {
    Promise.all([
      Services.getOtoroshiGroupsAsTeamAdmin(props.teamId, props._found.otoroshiSettings),
      Services.getOtoroshiServicesAsTeamAdmin(props.teamId, props._found.otoroshiSettings),
    ])
      .then(([groups, services]) => {
        if (!groups.error)
          setGroups(groups.map((g) => ({ label: g.name, value: g.id, type: 'group' })));
        else setGroups([]);
        if (!services.error)
          setServices(services.map((g) => ({ label: g.name, value: g.id, type: 'service' })));
        else setServices([]);
      })
      .catch(() => {
        setGroups([]);
        setServices([]);
      });
  }, [props._found.otoroshiSettings]);

  useEffect(() => {
    if (groups && services) {
      setLoading(false);
    }
  }, [services, groups]);

  useEffect(() => {
    if (!!groups && !!services && !!props._found.authorizedEntities) {
      setValue(
        [
          ...props._found.authorizedEntities.groups.map((authGroup) =>
            groups.find((g) => g.value === authGroup)
          ),
          ...props._found.authorizedEntities.services.map((authService) =>
            services.find((g) => g.value === authService)
          ),
        ].filter((f) => f)
      );
    }
  }, [props._found, groups, services]);

  useEffect(() => {
    const otoroshiSettings = props._found.otoroshiSettings;
    setDisabled(!otoroshiSettings);
  }, [props._found.otoroshiSettings, loading]);

  const onChange = (v) => {
    if (!v) {
      props.onChange(null);
      setValue(undefined);
    } else {
      const value = v.reduce(
        (acc, entitie) => {
          switch (entitie.type) {
            case 'group':
              return {
                ...acc,
                groups: [...acc.groups, groups.find((g) => g.value === entitie.value).value],
              };
            case 'service':
              return {
                ...acc,
                services: [...acc.services, services.find((s) => s.value === entitie.value).value],
              };
          }
        },
        { groups: [], services: [] }
      );
      setValue([
        ...value.groups.map((authGroup) => groups.find((g) => g.value === authGroup)),
        ...value.services.map((authService) => services.find((g) => g.value === authService)),
      ]);
      props.onChange(value);
    }
  };

  return (
    <div className="mb-3 row">
      <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
        <Help text={props.help} label={props.label} />
      </label>
      <div className="col-sm-10 d-flex flex-column">
        <Select
          id={`input-${props.label}`}
          isMulti
          name={`${props.label}-search`}
          isLoading={loading}
          isDisabled={disabled && !loading}
          placeholder={props.placeholder}
          components={(props) => <components.Group {...props} />}
          options={[
            { label: 'Service groups', options: groups },
            { label: 'Services', options: services },
          ]}
          value={value}
          onChange={onChange}
          classNamePrefix="reactSelect"
          className="reactSelect"
        />
        <div className="col-12 d-flex flex-row mt-1">
          <div className="d-flex flex-column flex-grow-1">
            <strong className="font-italic">
              <Translation i18nkey="Authorized Groups">Authorized Groups</Translation>
            </strong>
            {!!value &&
              value
                .filter((x) => x.type === 'group')
                .map((g, idx) => (
                  <span className="font-italic" key={idx}>
                    {g.label}
                  </span>
                ))}
          </div>
          <div className="d-flex flex-column flex-grow-1">
            <strong className="font-italic">
              <Translation i18nkey="Authorized Services">Authorized Services</Translation>
            </strong>
            {!!value &&
              value
                .filter((x) => x.type === 'service')
                .map((g, idx) => (
                  <span className="font-italic" key={idx}>
                    {g.label}
                  </span>
                ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const TestingApiKeyModal = (props) => {
  const [config, setConfig] = useState({ ...props.config });

  const { translateMethod, Translation } = useContext(I18nContext);

  const otoroshiFlow = ['otoroshiSettings', 'authorizedEntities'];
  const otoroshiForm = (_found) => {
    if (!_found || !_found.otoroshiSettings) {
      return {
        otoroshiSettings: {
          type: 'select',
          props: {
            label: translateMethod('Otoroshi instance'),
            possibleValues: props.otoroshiSettings.map((s) => ({ //FIXME: get from url => plus de prop.otosettings
              label: s.url,
              value: s._id,
            })),
          },
        },
        authorizedEntities: {
          type: 'select',
          disabled: true,
          props: {
            label: translateMethod('Authorized entities'),
          },
        },
      };
    }
    const form = {
      otoroshiSettings: {
        type: 'select',
        props: {
          label: translateMethod('Otoroshi instance'),
          possibleValues: props.otoroshiSettings.map((s) => ({ //FIXME: get from url => plus de prop.otosettings
            label: s.url,
            value: s._id,
          })),
        },
      },
      authorizedEntities: {
        type: OtoroshiServicesAndGroupSelector,
        props: {
          label: translateMethod('Authorized entities'),
          _found,
          teamId: props.teamId,
          placeholder: translateMethod('Authorized.entities.placeholder'),
          help: translateMethod('authorized.entities.help'),
        },
      },
    };
    return form;
  };

  const apiKeyAction = () => {
    if (!props.config.otoroshiSettings) {
      generateApiKey();
    } else {
      updateApiKey();
    }
  };

  const generateApiKey = () => {
    Services.createTestingApiKey(props.teamId, { ...config, ...props.metadata }).then((apikey) => {
      props.closeModal();
      props.onChange(apikey, { ...config, ...props.metadata });
    });
  };

  const updateApiKey = () => {
    Services.updateTestingApiKey(props.teamId, { ...config, ...props.metadata }).then((apikey) => {
      props.closeModal();
      props.onChange(apikey, { ...config, ...props.metadata });
    });
  };

  return (
    <div className="modal-content" style={{ fontWeight: 'normal' }}>
      <div className="modal-header">
        <h5 className="modal-title">{props.title}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={props.closeModal} />
      </div>
      <div className="modal-body">
        <React.Suspense fallback={<Spinner />}>
          <LazyForm
            flow={otoroshiFlow}
            schema={otoroshiForm(config)}
            value={config}
            onChange={(c) => setConfig({ ...config, ...c })}
          />
        </React.Suspense>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => props.closeModal()}>
          <Translation i18nkey="Cancel">Cancel</Translation>
        </button>
        <button
          type="button"
          className="btn btn-outline-success"
          onClick={apiKeyAction}
          disabled={!config.otoroshiSettings && !config.authorizedEntities ? 'disabled' : undefined}
        >
          <Translation i18nkey={props.update ? 'Update' : 'Create'}>
            {props.update ? 'Update' : 'Create'}
          </Translation>
        </button>
      </div>
    </div>
  );
};
