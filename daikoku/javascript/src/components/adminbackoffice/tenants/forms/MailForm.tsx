import React, { useContext } from 'react';
import { constraints, Form, format, Schema, type } from '@maif/react-forms';

import * as Services from '../../../../services';

import { useQuery } from '@tanstack/react-query';
import { I18nContext } from '../../../../core';
import { ITenant } from '../../../../types';
import { Spinner } from '../../../utils';

export const MailForm = (props: { tenant: ITenant }) => {
  const { translateMethod } = useContext(I18nContext)
  const { isLoading, data } = useQuery(['tenant'], () => Services.oneTenant(props.tenant._id))

  const schema: Schema = {
    mailerSettings: {
      type: type.object,
      format: format.form,
      label: null,
      schema: {
        type: {
          type: type.string,
          format: format.select,
          label: translateMethod('Mailer type'),
          options: [
            { label: 'Console', value: 'console' },
            { label: 'SMTP Client', value: 'smtpClient' },
            { label: 'Mailgun', value: 'mailgun' },
            { label: 'Mailjet', value: 'mailjet' },
            { label: 'Sendgrid', value: 'sendgrid' },
          ]
        },
        host: {
          type: type.string,
          label: translateMethod('smtp_client.host'),
          visible: ({ rawValues }) => rawValues.mailerSettings.type === 'smtpClient',
          deps: ['mailerSettings.type']
        },
        port: {
          type: type.number,
          label: translateMethod('smtp_client.port'),
          visible: ({ rawValues }) => rawValues.mailerSettings.type === 'smtpClient',
          deps: ['mailerSettings.type']
        },
        domain: {
          type: type.string,
          visible: ({ rawValues }) => rawValues.mailerSettings.type === 'mailgun',
          label: translateMethod('Mailgun domain'),
          deps: ['mailerSettings.type']
        },
        eu: {
          type: type.bool,
          visible: ({ rawValues }) => rawValues.mailerSettings.type === 'mailgun',
          label: translateMethod('European server'),
          deps: ['mailerSettings.type']
        },
        key: {
          type: type.string,
          visible: ({ rawValues }) => rawValues.mailerSettings.type === 'mailgun',
          label: translateMethod('Mailgun key'),
          deps: ['mailerSettings.type']
        },
        apiKeyPublic: {
          type: type.string,
          label: translateMethod('Mailjet apikey public'),
          visible: ({ rawValues }) => rawValues.mailerSettings.type === 'mailjet',
          deps: ['mailerSettings.type']
        },
        apiKeyPrivate: {
          type: type.string,
          label: translateMethod('Mailjet apikey private'),
          visible: ({ rawValues }) => rawValues.mailerSettings.type === 'mailjet',
          deps: ['mailerSettings.type']
        },
        apiKey: {
          type: type.string,
          label: translateMethod('send_grid.api_key'),
          visible: ({ rawValues }) => rawValues.mailerSettings.type === 'sendgrid',
          deps: ['mailerSettings.type']
        },
        fromTitle: {
          type: type.string,
          label: translateMethod('Email title'),
        },
        fromEmail: {
          type: type.string,
          label: translateMethod('Email from'),
          constraints:[
            constraints.email(translateMethod('constraints.matches.email'))
          ]
        },
      }
    }
  }


  if (isLoading) {
    return (
      <Spinner />
    )
  }

  return (
    <Form
      schema={schema}
      onSubmit={console.debug} //todo: clean kafka & elastic before save => null value if empty entries
      value={data}
    />
  )
}