import React, { Component } from 'react';
import { t } from '../../../../locales';
import { Spinner } from '../../../utils';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export class OtoroshiConfig extends Component {
  formFlow = ['sessionMaxAge', 'claimSecret', 'claimHeaderName'];

  formSchema = {
    sessionMaxAge: {
      type: 'number',
      props: {
        suffix: t('Second', this.props.currentLanguage, true),
        label: t('Session max. age', this.props.currentLanguage),
      },
    },
    claimHeaderName: {
      type: 'string',
      props: {
        label: t('Claim header name', this.props.currentLanguage),
      },
    },
    claimSecret: {
      type: 'string',
      props: {
        label: t('Claim Secret', this.props.currentLanguage),
      },
    },
  };

  componentDidMount() {
    if (this.props.rawValue.authProvider === 'Otoroshi') {
      this.props.onChange({
        sessionMaxAge: this.props.value.sessionMaxAge || 86400,
        claimSecret: this.props.value.claimSecret || 'secret',
        claimHeaderName: this.props.value.claimHeaderName || 'Otoroshi-Claim',
      });
    }
  }

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
