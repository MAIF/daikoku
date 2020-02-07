import React, { Component } from 'react';
import { connect } from 'react-redux';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { Can, manage, daikoku, Spinner } from '../../utils';
import { t, Translation } from '../../../locales';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

class TenantOtoroshiComponent extends Component {
  state = {
    otoroshi: null,
    create: false,
  };

  formSchema = {
    _id: { type: 'string', disabled: true, props: { label: t('Id', this.props.currentLanguage), placeholder: '---' } },
    url: {
      type: 'string',
      props: { label: t('Otoroshi Url', this.props.currentLanguage), placeholder: 'https://otoroshi-api.foo.bar' },
    },
    host: {
      type: 'string',
      props: { label: t('Otoroshi Host', this.props.currentLanguage), placeholder: 'otoroshi-api.foo.bar' },
    },
    clientId: {
      type: 'string',
      props: { label: t('Otoroshi client id', this.props.currentLanguage) },
    },
    clientSecret: {
      type: 'string',
      props: { label: t('Otoroshi client secret', this.props.currentLanguage) },
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
    window.confirm(t('otoroshi.settings.delete.confirm', this.props.currentLanguage, false, 'Are you sure you want to delete those otoroshi settings ?'))
      .then(ok => {
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
              {!this.state.create && <h1><Translation i18nkey="Otoroshi settings" language={this.props.currentLanguage}>Otoroshi settings</Translation></h1>}
              {this.state.create && <h1><Translation i18nkey="New otoroshi settings" language={this.props.currentLanguage}>New otoroshi settings</Translation></h1>}
            </div>
            <div className="row">
              {this.state.otoroshi && (
                <React.Suspense fallback={<Spinner />}>
                  <LazyForm
                    flow={this.formFlow}
                    schema={this.formSchema}
                    value={this.state.otoroshi}
                    onChange={otoroshi => this.setState({ otoroshi })}
                    style={{ marginBottom: 20, paddingTop: 20 }}
                  />
                </React.Suspense>
              )}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <a
                className="btn btn-outline-primary"
                href="#"
                onClick={() => this.props.history.goBack()}>
                <i className="fas fa-chevron-left" /> 
                <Translation i18nkey="Back" language={this.props.currentLanguage}>Back</Translation>
              </a>
              {!this.state.create && (
                <button
                  style={{ marginLeft: 5 }}
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={this.delete}>
                  <i className="fas fa-trash" /> 
                  <Translation i18nkey="Delete" language={this.props.currentLanguage}>Delete</Translation>
                </button>
              )}
              <button
                style={{ marginLeft: 5 }}
                type="button"
                className="btn btn-outline-success"
                onClick={this.save}>
                {!this.state.create && (
                  <span>
                    <i className="fas fa-save" /> 
                    <Translation i18nkey="Save" language={this.props.currentLanguage}>Save</Translation>
                  </span>
                )}
                {this.state.create && (
                  <span>
                    <Translation i18nkey="Create" language={this.props.currentLanguage}>Create</Translation>
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
