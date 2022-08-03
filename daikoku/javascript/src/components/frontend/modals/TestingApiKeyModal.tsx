import React, { useContext, useRef } from 'react';
import { Form, type, format, constraints } from '@maif/react-forms';

import { Spinner } from '../../utils';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';
import { useSelector } from 'react-redux';

export const TestingApiKeyModal = (props: any) => {
  const formRef = useRef();

  const tenant = useSelector(s => (s as any).context.tenant);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  const schema = {
      otoroshiSettings: {
        type: type.string,
        format: format.select,
        label: translateMethod('Otoroshi instance'),
        optionsFrom: Services.allSimpleOtoroshis(tenant._id),
        transformer: (o: any) => ({
          label: o.url,
          value: o._id
        }),
        constraints:[
          constraints.required(translateMethod('constraints.required.otoroshi.settings'))
        ]
      },
      authorizedEntities: {
        type: type.object,
        format:format.form,
        deps: ['otoroshiSettings'],
        disabled: ({
          rawValues
        }: any) => {
          return !rawValues.otoroshiSettings
        },
        label: translateMethod('Authorized entities'),
        help: translateMethod('authorized.entities.help'),
        schema: {
          groups: {
            type: type.string,
            format: format.select,
            isMulti:true,
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
          constraints.required(translateMethod('constraints.required.authorizedEntities')),
          constraints.test('test', translateMethod('constraint.min.authorizedEntities'), v => v.services.length || v.groups.length)
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
        props.closeModal();
        props.onChange(apikey, { ...updatedConfig, ...props.metadata });
      });
  };

  const updateApiKey = (updatedConfig: any) => {
    Services.updateTestingApiKey(props.teamId, { ...updatedConfig, ...props.metadata })
      .then((apikey) => {
        props.closeModal();
        props.onChange(apikey, { ...updatedConfig, ...props.metadata });
      });
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="modal-content" style={{ fontWeight: 'normal' }}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-header">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h5 className="modal-title">{props.title}</h5>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn-close" aria-label="Close" onClick={props.closeModal} />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-body">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <React.Suspense fallback={<Spinner />}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Form
            ref={formRef}
            schema={schema}
            value={props.config}
            onSubmit={apiKeyAction}
            // @ts-expect-error TS(2322): Type '() => null' is not assignable to type '(prop... Remove this comment to see the full error message
            footer={() => null}
          />
        </React.Suspense>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-footer">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-danger" onClick={() => props.closeModal()}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Cancel">Cancel</Translation>
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button
          type="button"
          className="btn btn-outline-success"
          // @ts-expect-error TS(2532): Object is possibly 'undefined'.
          onClick={() => formRef.current.handleSubmit()}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey={props.update ? 'Update' : 'Create'}>
            {props.update ? 'Update' : 'Create'}
          </Translation>
        </button>
      </div>
    </div>
  );
};
