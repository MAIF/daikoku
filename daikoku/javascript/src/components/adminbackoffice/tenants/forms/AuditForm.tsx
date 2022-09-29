import React, { useContext, useState, useEffect, useRef } from 'react';
import { Form, format, type, constraints, FormRef } from '@maif/react-forms';

import * as Services from '../../../../services';

import { ITenant, ITenantFull, Language } from '../../../../types';
import { I18nContext } from '../../../../core';
import { UseMutationResult, useQuery } from '@tanstack/react-query';
import { Spinner } from '../../../utils';

export const AuditForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translateMethod } = useContext(I18nContext)

  const ref = useRef<FormRef>()


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
              onChange: (v) => console.debug({v})
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
            keystore: {
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
          help: translateMethod('alerting.help')
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

  return (
    <Form
      schema={schema}
      onSubmit={(updatedTenant) => {
        console.debug({t: ref.current?.methods.getValues()})
        const kafkaConfig = updatedTenant.auditTrailConfig.kafkaConfig && updatedTenant.auditTrailConfig.kafkaConfig.servers.length ? updatedTenant.auditTrailConfig.kafkaConfig : undefined;
        const elasticConfigs = updatedTenant.auditTrailConfig.elasticConfigs && updatedTenant.auditTrailConfig.elasticConfigs.clusterUri ? updatedTenant.auditTrailConfig.elasticConfigs : undefined;

        props.updateTenant.mutateAsync({...updatedTenant, auditTrailConfig: {...updatedTenant.auditTrailConfig, kafkaConfig, elasticConfigs}})
      }}
      ref={ref}
      value={props.tenant}
      options={{
        actions: {
          submit: {
            label: translateMethod('Save')
          }
        }
      }}
    />
  )
}