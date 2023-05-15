import { constraints, format, type, Form } from '@maif/react-forms';
import { useContext, useState } from 'react';
import { UseMutationResult } from '@tanstack/react-query';

import { I18nContext } from '../../../../core';
import { IMailerSettings, ITenantFull } from '../../../../types';

export const MailForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translate } = useContext(I18nContext)
  const [mailerType, setMailerType] = useState(props.tenant?.mailerSettings.type || "console")

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

  const getSchema = (mailerType) => {
    if (mailerType === 'smtpClient')
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
    if (mailerType === 'mailgun')
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
    if (mailerType === 'mailjet')
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
    if (mailerType === 'sendgrid')
      return {
        apikey: {
          type: type.string,
          label: translate('send_grid.api_key'),
        },
        ...basicMailSchema
      }
    else
      return {};
  }



  const typeSchema = {
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
  }

  const schema = getSchema(mailerType)

  return (
    <div>
      <Form
        schema={typeSchema}
        onSubmit={(data) => setMailerType(data.type)}
        options={{
          autosubmit: true,
          actions: {
            submit: {
              display: false
            }
          }
        }}
        value={{ type: mailerType }}
      />
      <Form<IMailerSettings>
        schema={{...schema}}
        value={props.tenant?.mailerSettings}
        onSubmit={(data) => props.updateTenant.mutateAsync({ ...props.tenant, mailerSettings: {...data, type: mailerType} } as ITenantFull)}
      />
    </div>

  );
}