import React, { Component } from 'react';

import { Spinner } from '../../../utils';
import { t } from '../../../../locales';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export class SendGridConfig extends Component {
  formFlow = ['apikey', 'fromEmail', 'template'];

  formSchema = {
    apikey: {
      type: 'string',
      props: {
        label: t('send_grid.api_key', this.props.currentLanguage),
      },
    },
    fromEmail: {
      type: 'string',
      props: {
        label: t('send_grid.from_email', this.props.currentLanguage),
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
