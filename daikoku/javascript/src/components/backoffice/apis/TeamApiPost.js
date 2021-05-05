import React, { Suspense } from 'react';
import { toastr } from 'react-redux-toastr';
import { Spinner } from '../..';
import { t } from '../../../locales';
import * as Services from '../../../services/index';

const LazyForm = React.lazy(() => import('../../../components/inputs/Form'));

export class TeamApiIssues extends React.Component {
  state = {
    selected: null,
    issues: []
  };

  flow = [];

  schema = {

  };

  render() {
    const { issues, selected } = this.state;
    return (
      <div>
        <React.Suspense fallback={<Spinner />}>
          <LazyForm
            flow={this.flow}
            schema={this.schema}
            value={selected}
            onChange={(selected) => this.setState({ selected })}
          />
        </React.Suspense>
      </div>
    );
  }
}
