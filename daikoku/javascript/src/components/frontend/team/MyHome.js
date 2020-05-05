import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';

import { openContactModal, updateTeamPromise } from '../../../core';
import { t, Translation } from '../../../locales';
import * as Services from '../../../services';
import { ApiList } from '../../frontend';
import { api as API, CanIDoAction, manage } from '../../utils';

class MyHomeComponent extends Component {
  state = {
    apis: [],
    teams: [],
    myTeams: [],
  };

  fetchData = () => {
    this.setState({ loading: true }, () => {
      Promise.all([Services.myVisibleApis(), Services.teams(), Services.myTeams()]).then(
        ([apis, teams, myTeams]) => {
          this.setState({ apis, teams, myTeams, loading: false });
        }
      );
    });
  };

  componentDidMount() {
    this.fetchData();
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (this.props.connectedUser._id !== nextProps.connectedUser._id) {
      this.fetchData();
    }
  }

  componentDidCatch(e) {
    console.log('MyHomeError', e);
  }

  askForApiAccess = (api, teams) => {
    return Services.askForApiAccess(teams, api._id).then(() => this.fetchData());
  };

  redirectToTeamPage = (team) => {
    this.props.history.push(`/${team._humanReadableId}`);
  };

  redirectToApiPage = (api) => {
    if (api.visibility === 'Public' || api.authorizations.some((auth) => auth.authorized)) {
      const apiOwner = this.state.teams.find((t) => t._id === api.team);
      this.props.history.push(
        `/${apiOwner ? apiOwner._humanReadableId : api.team}/${api._humanReadableId}`
      );
    }
  };

  redirectToEditPage = (api) => {
    const adminTeam = this.state.myTeams.find((team) => api.team === team._id);

    if (CanIDoAction(this.props.connectedUser, manage, API, adminTeam)) {
      this.props
        .updateTeam(adminTeam)
        .then(() =>
          this.props.history.push(
            `/${adminTeam._humanReadableId}/settings/apis/${api._humanReadableId}/infos`
          )
        );
    }
  };

  render() {
    return (
      <main role="main" className="row">
        <section className="organisation__header col-12 mb-4 p-3">
          <div className="container">
            <div className="row text-center">
              <div className="col-sm-4">
                <img
                  className="organisation__avatar"
                  src={this.props.tenant ? this.props.tenant.logo : '/assets/images/daikoku.svg'}
                  alt="avatar"
                />
              </div>
              <div className="col-sm-7 d-flex flex-column justify-content-center">
                <h1 className="jumbotron-heading">
                  {this.props.tenant.title
                    ? this.props.tenant.title
                    : t('Your APIs center', this.props.currentLanguage)}
                </h1>
                <Description
                  description={this.props.tenant.description}
                  currentLanguage={this.props.currentLanguage}
                />
              </div>
              {this.props.connectedUser.isDaikokuAdmin && (
                <div className="col-sm-1 d-flex flex-column">
                  <div>
                    <Link
                      to={`/settings/tenants/${this.props.tenant._humanReadableId}`}
                      className="tenant__settings float-right btn btn-sm btn-access-negative">
                      <i className="fas fa-cogs" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        <ApiList
          history={this.props.history}
          myTeams={this.state.myTeams}
          apis={this.state.apis}
          teams={this.state.teams}
          teamVisible={true}
          askForApiAccess={this.askForApiAccess}
          redirectToApiPage={this.redirectToApiPage}
          redirectToEditPage={this.redirectToEditPage}
          redirectToTeamPage={this.redirectToTeamPage}
          refreshTeams={() => Services.myTeams().then((myTeams) => this.setState({ myTeams }))}
          showTeam={true}
        />
      </main>
    );
  }
}

const Description = (props) => {
  if (!props.description) {
    return (
      <p className="lead">
        <Translation i18nkey="Daikoku description start" language={props.currentLanguage}>
          Daikoku is the perfect
        </Translation>
        <a href="https: //www.otoroshi.io">Otoroshi</a>
        <Translation i18nkey="Daikoku description end" language={props.currentLanguage}>
          companion to manage, document, and expose your beloved APIs to your developpers community.
          Publish a new API in a few seconds
        </Translation>
      </p>
    );
  }

  return <p className="lead">{props.description}</p>;
};

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateTeam: (team) => updateTeamPromise(team),
  openContactModal: (props) => openContactModal(props),
};

export const MyHome = connect(mapStateToProps, mapDispatchToProps)(MyHomeComponent);
