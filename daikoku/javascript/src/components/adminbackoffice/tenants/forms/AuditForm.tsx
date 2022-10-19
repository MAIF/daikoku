import { Form, format, FormRef, type } from '@maif/react-forms';
import { useContext, useRef } from 'react';
import { UseMutationResult } from 'react-query';


import { I18nContext } from '../../../../core';
import { ITenantFull } from '../../../../types';

export const AuditForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translate } = useContext(I18nContext)

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
          label: translate('Audit trail (Webhooks)'),
          schema: {
            url: {
              type: type.string,
              label: translate('Analytics webhook URL'),
              placeholder: translate('URL of the webhook target'),
              onChange: (v) => console.debug({v}) //FIXME
            },
            headers: {
              type: type.object,
              label: translate('Webhook Headers')
            },
          }
        },
        kafkaConfig: {
          type: type.object,
          format: format.form,
          label: translate('Audit trail (Kafka)'),
          schema: {
            servers: {
              type: type.string,
              array: true,
              label: translate('Kafka Servers'),
              placeholder: '127.0.0.1:9092',
              help: translate('kafka.servers.help'),
            },
            keyPass: {
              type: type.string,
              label: translate('Kafka keypass'),
              placeholder: translate('Secret'),
              help: translate('kafka.secret.help'),
            },
            keystore: {
              type: type.string,
              label: translate('Kafka keystore path'),
              placeholder: '/home/bas/client.keystore.jks',
              help: translate('kafka.keystore.path.help'),
            },
            truststore: {
              type: type.string,
              label: translate('Kafka truststore path'),
              placeholder: '/home/bas/client.truststore.jks',
              help: translate('kafka.truststore.path.help'),
            },
            auditTopic: {
              type: type.string,
              label: translate('Kafka audits topic'),
              placeholder: translate('daikoku-audit'),
              help: translate('kafka.audit.topic.help'),
            },
            hostValidation: {
              type: type.bool,
              label: translate('Kafka host validation'),
              help: translate('kafka.audit.hostValidation.help'),
            }
          }
        },
        elasticConfigs: {
          type: type.object,
          format: format.form,
          label: translate('Audit trail (Elastic)'),
          schema: {
            clusterUri: {
              type: type.string,
              label: translate('Cluster URI'),
              placeholder: translate('Elastic cluster URI'),
            },
            index: {
              type: type.string,
              label: translate('Index'),
              placeholder: translate('Elastic index'),
            },
            type: {
              type: type.string,
              label: translate('Type'),
              placeholder: translate('Event type'),
            },
            user: {
              type: type.string,
              label: translate('User'),
              placeholder: translate('Elastic User (optional)'),
            },
            password: {
              type: type.string,
              label: translate('Password'),
              placeholder: translate('Elastic password (optional)'),
            },
          }
        },
        alertsEmails: {
          type: type.string,
          array: true,
          label: translate('Alerting'),
          help: translate('alerting.help')
          //todo: with a better version of react-form ...
          // item: {
          //   constraints:[
          //     constraints.email(translate('constraints.matches.email'))
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
        const kafkaConfig = updatedTenant.auditTrailConfig.kafkaConfig && updatedTenant.auditTrailConfig.kafkaConfig.servers.length ? updatedTenant.auditTrailConfig.kafkaConfig : undefined;
        const elasticConfigs = updatedTenant.auditTrailConfig.elasticConfigs && updatedTenant.auditTrailConfig.elasticConfigs.clusterUri ? updatedTenant.auditTrailConfig.elasticConfigs : undefined;

        props.updateTenant.mutateAsync({...updatedTenant, auditTrailConfig: {...updatedTenant.auditTrailConfig, kafkaConfig, elasticConfigs}})
      }}
      ref={ref}
      value={props.tenant}
      options={{
        actions: {
          submit: {
            label: translate('Save')
          }
        }
      }}
    />
  )
}