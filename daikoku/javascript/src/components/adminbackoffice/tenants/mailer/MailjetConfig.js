import React, { Component } from 'react';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export class MailjetConfig extends Component {
  formFlow = ['apiKeyPublic', 'apiKeyPrivate', 'fromTitle', 'fromEmail'];

  formSchema = {
    apiKeyPublic: {
      type: 'string',
      props: {
        label: 'Mailjet apikey public',
      },
    },
    apiKeyPrivate: {
      type: 'string',
      props: {
        label: 'Mailjet apikey private',
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
      <React.Suspense>
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
