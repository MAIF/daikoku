import React, { Component } from 'react';
import { LoginOrRegisterModal } from '..';
import { t } from '../../../locales';

export class ApiRedoc extends Component {
  state = {
    error: undefined,
  };

  componentDidMount() {
    const { tenant, connectedUser } = this.props;
    const showSwagger = !(connectedUser.isGuest && tenant.apiReferenceHideForGuest);

    if (showSwagger) {
      const url = `${window.location.origin}/api/teams/${this.props.teamId}/apis/${this.props.api._id}/swagger.json?version=${this.props.match.params.versionId}`;

      fetch(url).then((res) => {
        if (res.status > 300)
          this.setState({
            error: t('api_redoc.failed_to_retrieve_doc', this.props.currentLanguage),
          });
        else {
          // eslint-disable-next-line no-undef
          Redoc.init(
            url,
            {
              scrollYOffset: 50,
              hideHostname: true,
              suppressWarnings: true,
            },
            document.getElementById('redoc-container')
          );
        }
      });
    } else this.setState({ error: t('api_redoc.guest_user', this.props.currentLanguage) });
  }

  render() {
    const { tenant, connectedUser } = this.props;

    if (connectedUser.isGuest && tenant.apiReferenceHideForGuest)
      return (
        <LoginOrRegisterModal
          {...this.props}
          showOnlyMessage={true}
          asFlatFormat
          message={t('api_redoc.guest_user', this.props.currentLanguage)}
        />
      );

    if (this.state.error)
      return (
        <div className="d-flex justify-content-center w-100">
          <span className="alert alert-danger text-center">{this.state.error}</span>
        </div>
      );

    const api = this.props.api;
    if (!api || !api.swagger)
      return (
        <div>
          {t('api_data.missing', this.props.currentLanguage, false, undefined, ['Api reference'])}
        </div>
      );

    return <div id="redoc-container" />;
  }
}
