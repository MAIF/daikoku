import { constraints, Form, format, type } from '@maif/react-forms';
import { UseMutationResult } from '@tanstack/react-query';
import { useContext, useState } from 'react';

import { toast } from "sonner";
import { I18nContext } from '../../../../contexts';
import { testMailConnection } from "../../../../services";
import { IMailerSettings, isError, ITenantFull, MailerType } from '../../../../types';
import { FeedbackButton } from '../../../utils/FeedbackButton';

export const MailForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translate } = useContext(I18nContext)
  const [mailerType, setMailerType] = useState<MailerType>(props.tenant?.mailerSettings.type || "console")

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
    testConnection: {
      type: type.string,
      label: null,
      render: ({ rawValues }) => {
        return (
          <FeedbackButton
            type='info'
            onPress={() => testMailConnection(props.tenant?._id!, mailerType, rawValues)
              .then(r => isError(r) ? Promise.reject(r) : r)
            }
            feedbackTimeout={1000}
            feedbackMessages={{
              success: translate("tenant.settings.mailer.test.connection.success.label"),
              fail: translate("tenant.settings.mailer.test.connection.failed.label")
            }}
            disabled={false}
          >{translate('tenant.settings.mailer.test.connection.button.label')}</FeedbackButton>
        )
      }
    }
  }

  const getSchema = (mailerType: MailerType) => {
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
        username: {
          type: type.string,
          label: translate('smtp_client.username'),
        },
        password: {
          type: type.string,
          format: format.password,
          label: translate('smtp_client.password'),
        },
        ...basicMailSchema,
      };
    if (mailerType === 'mailgun') {
      const { testConnection, ...basicWithoutTestButton } = basicMailSchema
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
        ...basicWithoutTestButton,
        testingEmail: {
          type: type.string,
          label: translate('tenant.settings.mailer.mailgun.test.recipient.email.label'),
        },
        testConnection
      }
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
        schema={{ ...schema }}
        value={props.tenant?.mailerSettings}
        onSubmit={(data) => {
          props.updateTenant.mutateAsync({ ...props.tenant, mailerSettings: { ...data, type: mailerType } } as ITenantFull)
        }}
      />
    </div>

  );
}