import React, { Component } from 'react';

import { Spinner } from '../../../utils';
import {t} from '../../../../locales';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export class MailgunConfig extends Component {
  formFlow = ['domain', 'key', 'fromTitle', 'fromEmail', 'template'];

  formSchema = {
    domain: {
      type: 'string',
      props: {
        label: t('Mailgun domain', this.props.currentLanguage),
      },
    },
    key: {
      type: 'string',
      props: {
        label: t('Mailgun key', this.props.currentLanguage),
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
      props: { label: t('Mail template', this.props.currentLanguage) }
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
