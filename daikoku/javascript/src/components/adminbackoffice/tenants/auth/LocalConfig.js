import React, { Component } from 'react';
import { t } from '../../../../locales';
import { Spinner } from '../../../utils';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export class LocalConfig extends Component {
  formFlow = ['sessionMaxAge'];

  formSchema = {
    sessionMaxAge: {
      type: 'number',
      props: {
        suffix: t('Second', this.props.currentLanguage, true),
        label: t('Session max. age', this.props.currentLanguage),
      },
    },
  };

  componentDidMount() {
    if (this.props.rawValue.authProvider === 'Local') {
      this.props.onChange({
        sessionMaxAge: this.props.value.sessionMaxAge || 86400,
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
