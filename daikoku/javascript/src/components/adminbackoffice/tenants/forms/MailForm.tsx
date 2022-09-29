import React, { useContext } from 'react';
import { constraints, Flow, format, type } from '@maif/react-forms';
import { useMutation, UseMutationResult, useQuery } from '@tanstack/react-query';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../../services';
import { I18nContext } from '../../../../core';
import { IMailerSettings, ITenant, ITenantFull } from '../../../../types';
import { MultiStepForm, Spinner } from '../../../utils';
import { update } from 'xstate/lib/actionTypes';

export const MailForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translateMethod } = useContext(I18nContext)

  const basicMailSchema = {
    fromTitle: {
      type: type.string,
      label: translateMethod('Email title'),
    },
    fromEmail: {
      type: type.string,
      label: translateMethod('Email from'),
      constraints: [
        constraints.email(translateMethod('constraints.matches.email'))
      ]
    },
  }

  const steps = [{
    id: 'type',
    label: 'Mail provider',
    schema: {
      type: {
        type: type.string,
        format: format.buttonsSelect,
        label: translateMethod('Mailer type'),
        options: [
          { label: 'Console', value: 'console' },
          { label: 'SMTP Client', value: 'smtpClient' },
          { label: 'Mailgun', value: 'mailgun' },
          { label: 'Mailjet', value: 'mailjet' },
          { label: 'Sendgrid', value: 'sendgrid' },
        ],
        constraints: [
          constraints.required()
        ]
      }
    },
  }, {
    id: 'params',
    label: 'config',
    flow: (data) => {
      switch (data.type) {
        case 'console':
          return ['fromTitle', 'fromEmail'];
        case 'smtpClient':
          return ['host', 'port', 'fromTitle', 'fromEmail']
        case 'mailgun':
          return ['domain', 'eu', 'key', 'fromTitle', 'fromEmail']
        case 'mailjet':
          return ['apiKeyPublic', 'apiKeyPrivate', 'fromTitle', 'fromEmail']
        case 'sendgrid':
          return ['apiKey', 'fromTitle', 'fromEmail']
      }
    },
    schema: (data) => {
      switch (data.type) {
        case 'console':
          return basicMailSchema;
        case 'smtpClient':
          return {
            host: {
              type: type.string,
              label: translateMethod('smtp_client.host'),
            },
            port: {
              type: type.number,
              label: translateMethod('smtp_client.port'),
            },
            ...basicMailSchema,
          };
        case 'mailgun':
          return {
            domain: {
              type: type.string,
              label: translateMethod('Mailgun domain'),
            },
            eu: {
              type: type.bool,
              label: translateMethod('European server'),
            },
            key: {
              type: type.string,
              label: translateMethod('Mailgun key'),
            },
            ...basicMailSchema
          }
        case 'mailjet':
          return {
            apiKeyPublic: {
              type: type.string,
              label: translateMethod('Mailjet apikey public'),
            },
            apiKeyPrivate: {
              type: type.string,
              label: translateMethod('Mailjet apikey private'),
            },
            ...basicMailSchema
          }
        case 'sendgrid':
          return {
            apiKey: {
              type: type.string,
              label: translateMethod('send_grid.api_key'),
            },
            ...basicMailSchema
          }
      }
    }
  }]

  return (
    <MultiStepForm<IMailerSettings>
      value={props.tenant?.mailerSettings}
      steps={steps}
      initial={props.tenant?.mailerSettings ? "params" : "type"}
      creation={false}
      save={(d: IMailerSettings) => props.updateTenant.mutateAsync({...props.tenant, mailerSettings: d} as ITenantFull)}
      labels={{
        previous: translateMethod('Previous'),
        skip: translateMethod('Skip'),
        next: translateMethod('Next'),
        save: translateMethod('Save'),
      }} />
  )
}