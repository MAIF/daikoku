import React, { Component } from 'react';

import { Spinner } from '../../../utils';
import { t } from '../../../../locales';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export class SmtpClientConfig extends Component {
  formFlow = ['host', 'port', 'fromTitle', 'fromEmail', 'template'];

  formSchema = {
    host: {
      type: 'string',
      props: {
        label: t('smtp_client.host', this.props.currentLanguage),
      },
    },
    port: {
      type: 'string',
      props: {
        label: t('smtp_client.port', this.props.currentLanguage),
      },
    },
    fromTitle: {
      type: 'string',
      props: {
        label: t('Email title', this.props.currentLanguage),
      },
    },
    fromEmail: {
      type: 'string',
      props: {
        label: t('Email from', this.props.currentLanguage),
      },
    },
    template: {
      type: 'markdown',
      props: {
        label: t('Mail template', this.props.currentLanguage),
        help: t('mail.template.help', this.props.currentLanguage),
      },
    },
  };

  render() {
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          currentLanguage={this.props.currentLanguage}
          value={this.props.value}
          onChange={this.props.onChange}
          flow={this.formFlow}
          schema={this.formSchema}
          style={{ marginTop: 50 }}
        />
      </React.Suspense>
    );
  }
}
