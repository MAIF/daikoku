import { constraints, format, type } from '@maif/react-forms';
import { useContext } from 'react';
import { UseMutationResult } from 'react-query';

import { I18nContext } from '../../../../core';
import { IMailerSettings, ITenantFull } from '../../../../types';
import { MultiStepForm } from '../../../utils';

export const MailForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translate } = useContext(I18nContext)

  const basicMailSchema = {
    fromTitle: {
      type: type.string,
      label: translate('Email title'),
    },
    fromEmail: {
      type: type.string,
      label: translate('Email from'),
      constraints: [
        constraints.email(translate('constraints.matches.email'))
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
        label: translate('Mailer type'),
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
              label: translate('smtp_client.host'),
            },
            port: {
              type: type.number,
              label: translate('smtp_client.port'),
            },
            ...basicMailSchema,
          };
        case 'mailgun':
          return {
            domain: {
              type: type.string,
              label: translate('Mailgun domain'),
            },
            eu: {
              type: type.bool,
              label: translate('European server'),
            },
            key: {
              type: type.string,
              label: translate('Mailgun key'),
            },
            ...basicMailSchema
          }
        case 'mailjet':
          return {
            apiKeyPublic: {
              type: type.string,
              label: translate('Mailjet apikey public'),
            },
            apiKeyPrivate: {
              type: type.string,
              label: translate('Mailjet apikey private'),
            },
            ...basicMailSchema
          }
        case 'sendgrid':
          return {
            apiKey: {
              type: type.string,
              label: translate('send_grid.api_key'),
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
        previous: translate('Previous'),
        skip: translate('Skip'),
        next: translate('Next'),
        save: translate('Save'),
      }} />
  )
}