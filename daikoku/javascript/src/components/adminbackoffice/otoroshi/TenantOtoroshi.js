import React, { Component } from 'react';
import { connect } from 'react-redux';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { Can, manage, daikoku, Spinner } from '../../utils';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

class TenantOtoroshiComponent extends Component {
  state = {
    otoroshi: null,
    create: false,
  };

  formSchema = {
    _id: { type: 'string', disabled: true, props: { label: 'Id', placeholder: '---' } },
    url: {
      type: 'string',
      props: { label: 'Otoroshi Url', placeholder: 'https://otoroshi-api.foo.bar' },
    },
    host: {
      type: 'string',
      props: { label: 'Otoroshi Host', placeholder: 'otoroshi-api.foo.bar' },
    },
    clientId: {
      type: 'string',
      props: { label: 'Otoroshi client id' },
    },
    clientSecret: {
      type: 'string',
      props: { label: 'Otoroshi client secret' },
    },
  };

  formFlow = ['_id', 'url', 'host', 'clientId', 'clientSecret'];

  isTeamAdmin = () => {
    if (this.props.connectedUser.isDaikokuAdmin) {
      return true;
    }
  };

  teamIdFromReduxStore() {
    // TODO: the current team is still needed here !
    return this.props.currentTeam._id; // this.props.match.params.teamId || '--';
  }

  componentDidMount() {
    if (this.props.location && this.props.location.state && this.props.location.state.newSettings) {
      this.setState({ otoroshi: this.props.location.state.newSettings, create: true });
    } else {
      Services.oneOtoroshi(this.props.match.params.otoroshiId).then(otoroshi =>
        this.setState({ otoroshi })
      );
    }
  }

  save = () => {
    if (this.state.create) {
      Services.createOtoroshiSettings(this.state.otoroshi).then(() => {
        this.setState({ create: false });
      });
    } else {
      Services.saveOtoroshiSettings(this.state.otoroshi);
    }
  };

  delete = () => {
    window.confirm('Are you sure you want to delete those otoroshi settings ?').then(ok => {
      if (ok) {
        Services.deleteOtoroshiSettings(this.state.otoroshi._id);
      }
    });
  };

  render() {
    return (
      <UserBackOffice tab="Otoroshi" isLoading={!this.state.otoroshi}>
        {this.state.otoroshi && (
          <Can I={manage} a={daikoku} dispatchError>
            <div className="row">
              {!this.state.create && <h1>Otoroshi settings</h1>}
              {this.state.create && <h1>New otoroshi settings</h1>}
            </div>
            <div className="row">
              {this.state.otoroshi && (
                <React.Suspense fallback={<Spinner />}>
                  <LazyForm
                    flow={this.formFlow}
                    schema={this.formSchema}
                    value={this.state.otoroshi}
                    onChange={otoroshi => this.setState({ otoroshi })}
                  />
                </React.Suspense>
              )}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <a
                className="btn btn-outline-primary"
                href="#"
                onClick={() => this.props.history.goBack()}>
                <i className="fas fa-chevron-left" /> Back
              </a>
              {!this.state.create && (
                <button
                  style={{ marginLeft: 5 }}
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={this.delete}>
                  <i className="fas fa-trash" /> Delete
                </button>
              )}
              <button
                style={{ marginLeft: 5 }}
                type="button"
                className="btn btn-outline-success"
                onClick={this.save}>
                {!this.state.create && (
                  <span>
                    <i className="fas fa-save" /> Save
                  </span>
                )}
                {this.state.create && (
                  <span>
                    <i className="fas fa-save" /> Create
                  </span>
                )}
              </button>
            </div>
          </Can>
        )}
      </UserBackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const TenantOtoroshi = connect(mapStateToProps)(TenantOtoroshiComponent);
