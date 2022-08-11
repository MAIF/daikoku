import React, { useContext, useState, useEffect } from 'react';
import { Form, format, type, constraints } from '@maif/react-forms';

import * as Services from '../../../../services';

import { ITenant, Language } from '../../../../types';
import { I18nContext } from '../../../../core';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '../../../utils';

export const AuditForm = (props: { tenant: ITenant }) => {
  const { translateMethod } = useContext(I18nContext)
  const { isLoading, data } = useQuery(['tenant'], () => Services.oneTenant(props.tenant._id))


  const schema = {
    auditTrailConfig: {
      type: type.object,
      format: format.form,
      label: null,
      schema: {
        auditWebhooks: {
          type: type.object,
          format: format.form,
          array: true,
          label: translateMethod('Audit trail (Webhooks)'),
          schema: {
            url: {
              type: type.string,
              label: translateMethod('Analytics webhook URL'),
              placeholder: translateMethod('URL of the webhook target'),
            },
            headers: {
              type: type.object,
              label: translateMethod('Webhook Headers')
            },
          }
        },
        kafkaConfig: {
          type: type.object,
          format: format.form,
          label: translateMethod('Audit trail (Kafka)'),
          schema: {
            servers: {
              type: type.string,
              array: true,
              label: translateMethod('Kafka Servers'),
              placeholder: '127.0.0.1:9092',
              help: translateMethod('kafka.servers.help'),
            },
            keyPass: {
              type: type.string,
              label: translateMethod('Kafka keypass'),
              placeholder: translateMethod('Secret'),
              help: translateMethod('kafka.secret.help'),
            },
            keyStore: {
              type: type.string,
              label: translateMethod('Kafka keystore path'),
              placeholder: '/home/bas/client.keystore.jks',
              help: translateMethod('kafka.keystore.path.help'),
            },
            truststore: {
              type: type.string,
              label: translateMethod('Kafka truststore path'),
              placeholder: '/home/bas/client.truststore.jks',
              help: translateMethod('kafka.truststore.path.help'),
            },
            auditTopic: {
              type: type.string,
              label: translateMethod('Kafka audits topic'),
              placeholder: translateMethod('daikoku-audit'),
              help: translateMethod('kafka.audit.topic.help'),
            },
            hostValidation: {
              type: type.bool,
              label: translateMethod('Kafka host validation'),
              help: translateMethod('kafka.audit.hostValidation.help'),
            }
          }
        },
        elasticConfigs: {
          type: type.object,
          format: format.form,
          label: translateMethod('Audit trail (Elastic)'),
          schema: {
            clusterUri: {
              type: type.string,
              label: translateMethod('Cluster URI'),
              placeholder: translateMethod('Elastic cluster URI'),
            },
            index: {
              type: type.string,
              label: translateMethod('Index'),
              placeholder: translateMethod('Elastic index'),
            },
            type: {
              type: type.string,
              label: translateMethod('Type'),
              placeholder: translateMethod('Event type'),
            },
            user: {
              type: type.string,
              label: translateMethod('User'),
              placeholder: translateMethod('Elastic User (optional)'),
            },
            password: {
              type: type.string,
              label: translateMethod('Password'),
              placeholder: translateMethod('Elastic password (optional)'),
            },
          }
        },
        alertsEmails: {
          type: type.string,
          array: true,
          label: translateMethod('Alerting'),
          //todo: with a better version of react-form ...
          // item: {
          //   constraints:[
          //     constraints.email(translateMethod('constraints.matches.email'))
          //   ]
          // }
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