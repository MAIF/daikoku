import React, { Component } from 'react';

import { t } from '../../../../locales';
const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export class MailjetConfig extends Component {
  formFlow = ['apiKeyPublic', 'apiKeyPrivate', 'fromTitle', 'fromEmail', 'template'];

  formSchema = {
    apiKeyPublic: {
      type: 'string',
      props: {
        label: t('Mailjet apikey public', this.props.currentLanguage),
      },
    },
    apiKeyPrivate: {
      type: 'string',
      props: {
        label: t('Mailjet apikey private', this.props.currentLanguage),
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
        help: t('mail.template.help', this.props.currentLanguage) 
      }
    },
  };

  render() {
    return (
      <React.Suspense>
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
