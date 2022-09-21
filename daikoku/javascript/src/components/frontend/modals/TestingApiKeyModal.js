import React, { useContext, useRef } from 'react';
import { Form, type, format, constraints } from '@maif/react-forms';

import { Spinner } from '../../utils';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';
import { useSelector } from 'react-redux';

export const TestingApiKeyModal = (props) => {
  const formRef = useRef();

  const tenant = useSelector((s) => s.context.tenant);

  const { translateMethod, Translation } = useContext(I18nContext);

  const schema = {
    otoroshiSettings: {
      type: type.string,
      format: format.select,
      label: translateMethod('Otoroshi instance'),
      optionsFrom: Services.allSimpleOtoroshis(tenant._id),
      transformer: (o) => ({
        label: o.url,
        value: o._id,
      }),
      constraints: [
        constraints.required(translateMethod('constraints.required.otoroshi.settings')),
      ],
    },
    authorizedEntities: {
      type: type.object,
      format: format.form,
      deps: ['otoroshiSettings'],
      disabled: ({ rawValues }) => {
        return !rawValues.otoroshiSettings;
      },
      label: translateMethod('Authorized entities'),
      help: translateMethod('authorized.entities.help'),
      schema: {
        groups: {
          type: type.string,
          format: format.select,
          isMulti: true,
          deps: ['otoroshiSettings'],
          disabled: ({ rawValues }) => !rawValues.otoroshiSettings,
          optionsFrom: ({ rawValues }) => {
            if (!rawValues.otoroshiSettings) {
              return Promise.resolve([]);
            }
            return Services.getOtoroshiGroupsAsTeamAdmin(props.teamId, rawValues.otoroshiSettings);
          },
          transformer: (g) => ({ label: g.name, value: g.id }),
        },
        services: {
          type: type.string,
          format: format.select,
          isMulti: true,
          disabled: ({ rawValues }) => !rawValues.otoroshiSettings,
          optionsFrom: ({ rawValues }) => {
            if (!rawValues.otoroshiSettings) {
              return Promise.resolve([]);
            }
            return Services.getOtoroshiServicesAsTeamAdmin(
              props.teamId,
              rawValues.otoroshiSettings
            );
          },
          transformer: (g) => ({ label: g.name, value: g.id }),
        },
      },
      constraints: [
        constraints.required(translateMethod('constraints.required.authorizedEntities')),
        constraints.test(
          'test',
          translateMethod('constraint.min.authorizedEntities'),
          (v) => v.services.length || v.groups.length
        ),
      ],
    },
  };

  const apiKeyAction = (c) => {
    if (!props.config.otoroshiSettings) {
      generateApiKey(c);
    } else {
      updateApiKey(constraints);
    }
  };

  const generateApiKey = (updatedConfig) => {
    Services.createTestingApiKey(props.teamId, { ...updatedConfig, ...props.metadata }).then(
      (apikey) => {
        props.closeModal();
        props.onChange(apikey, { ...updatedConfig, ...props.metadata });
      }
    );
  };

  const updateApiKey = (updatedConfig) => {
    Services.updateTestingApiKey(props.teamId, { ...updatedConfig, ...props.metadata }).then(
      (apikey) => {
        props.closeModal();
        props.onChange(apikey, { ...updatedConfig, ...props.metadata });
      }
    );
  };

  return (
    <div className="modal-content" style={{ fontWeight: 'normal' }}>
      <div className="modal-header">
        <h5 className="modal-title">{props.title}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={props.closeModal} />
      </div>
      <div className="modal-body">
        <React.Suspense fallback={<Spinner />}>
          <Form
            ref={formRef}
            schema={schema}
            value={props.config}
            onSubmit={apiKeyAction}
            footer={() => null}
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
          onClick={() => formRef.current.handleSubmit()}
        >
          <Translation i18nkey={props.update ? 'Update' : 'Create'}>
            {props.update ? 'Update' : 'Create'}
          </Translation>
        </button>
      </div>
    </div>
  );
};
