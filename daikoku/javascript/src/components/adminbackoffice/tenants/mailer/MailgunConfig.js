import React, { Component } from 'react';
import { Spinner } from '../../../utils';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export class MailgunConfig extends Component {
  formFlow = ['domain', 'key', 'fromTitle', 'fromEmail'];

  formSchema = {
    domain: {
      type: 'string',
      props: {
        label: 'Mailgun domain',
      },
    },
    key: {
      type: 'string',
      props: {
        label: 'Mailgun key',
      },
    },
    fromTitle: {
      type: 'string',
      props: {
        label: 'Email title',
      },
    },
    fromEmail: {
      type: 'string',
      props: {
        label: 'Email from',
      },
    },
  };

  render() {
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
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
