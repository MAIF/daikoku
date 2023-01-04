import React, { useContext, useRef } from 'react';
import { Form, type, format, constraints } from '@maif/react-forms';

import { Spinner } from '../../components/utils';
import * as Services from '../../services';
import { I18nContext } from '../../core';
import { useSelector } from 'react-redux';
import { IBaseModalProps, TestingApiKeyModalProps } from './types';


export const TestingApiKeyModal = (props: TestingApiKeyModalProps & IBaseModalProps) => {
  const formRef = useRef<any>();

  const tenant = useSelector(s => (s as any).context.tenant);

  const { translate, Translation } = useContext(I18nContext);

  const schema = {
    otoroshiSettings: {
      type: type.string,
      format: format.select,
      label: translate('Otoroshi instance'),
      optionsFrom: Services.allSimpleOtoroshis(tenant._id),
      transformer: (o: any) => ({
        label: o.url,
        value: o._id
      }),
      constraints: [
        constraints.required(translate('constraints.required.otoroshi.settings'))
      ]
    },
    authorizedEntities: {
      type: type.object,
      format: format.form,
      deps: ['otoroshiSettings'],
      disabled: ({
        rawValues
      }: any) => {
        return !rawValues.otoroshiSettings
      },
      label: translate('Authorized entities'),
      help: translate('authorized.entities.help'),
      schema: {
        groups: {
          type: type.string,
          format: format.select,
          isMulti: true,
          deps: ['otoroshiSettings'],
          disabled: ({
            rawValues
          }: any) => !rawValues.otoroshiSettings,
          optionsFrom: ({
            rawValues
          }: any) => {
            if (!rawValues.otoroshiSettings) {
              return Promise.resolve([])
            }
            return Services.getOtoroshiGroupsAsTeamAdmin(props.teamId, rawValues.otoroshiSettings)
          },
          transformer: (g: any) => ({
            label: g.name,
            value: g.id
          }),
        },
        services: {
          type: type.string,
          format: format.select,
          isMulti: true,
          disabled: ({
            rawValues
          }: any) => !rawValues.otoroshiSettings,
          optionsFrom: ({
            rawValues
          }: any) => {
            if (!rawValues.otoroshiSettings) {
              return Promise.resolve([])
            }
            return Services.getOtoroshiServicesAsTeamAdmin(props.teamId, rawValues.otoroshiSettings)
          },
          transformer: (g: any) => ({
            label: g.name,
            value: g.id
          })
        }
      },
      constraints: [
        constraints.required(translate('constraints.required.authorizedEntities')),
        constraints.test('test', translate('constraint.min.authorizedEntities'), v => v.services.length || v.groups.length)
      ]
    },
  };

  const apiKeyAction = (c: any) => {
    if (!props.config.otoroshiSettings) {
      generateApiKey(c);
    } else {
      updateApiKey(constraints);
    }
  };

  const generateApiKey = (updatedConfig: any) => {
    Services.createTestingApiKey(props.teamId, { ...updatedConfig, ...props.metadata })
      .then((apikey) => {
        props.close();
        props.onChange(apikey, { ...updatedConfig, ...props.metadata });
      });
  };

  const updateApiKey = (updatedConfig: any) => {
    Services.updateTestingApiKey(props.teamId, { ...updatedConfig, ...props.metadata })
      .then((apikey) => {
        props.close();
        props.onChange(apikey, { ...updatedConfig, ...props.metadata });
      });
  };

  return (
    <div className="modal-content" style={{ fontWeight: 'normal' }}>
      <div className="modal-header">
        <h5 className="modal-title">{props.title}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={props.close} />
      </div>
      <div className="modal-body">
        <React.Suspense fallback={<Spinner />}>
          <Form
            ref={formRef}
            schema={schema}
            value={props.config}
            onSubmit={apiKeyAction}
            footer={() => <></>}
          />
        </React.Suspense>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={props.close}>
          <Translation i18nkey="Cancel">Cancel</Translation>
        </button>
        <button
          type="button"
          className="btn btn-outline-success"
          onClick={() => formRef.current?.handleSubmit()}
        >
          <Translation i18nkey={props.update ? 'Update' : 'Create'}>
            {props.update ? 'Update' : 'Create'}
          </Translation>
        </button>
      </div>
    </div>
  );
};
