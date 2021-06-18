import React, { Component } from 'react';
import { SwaggerUIBundle } from 'swagger-ui-dist';

import 'swagger-ui-dist/swagger-ui.css';
import { LoginOrRegisterModal } from '../..';

export class ApiSwagger extends Component {

  state = {
    error: undefined,
    info: undefined
  }

  componentDidMount() {
    if (this.props.api.testing.enabled)
      fetch(`/api/teams/${this.props.teamId}/apis/${this.props.api._id}/swagger.json`)
        .then(res => {
          if (res.status > 300)
            this.setState({ error: "Can't retrieve api reference" });
          else
            this.drawSwaggerUi();
          setTimeout(() => {
            [...document.querySelectorAll('.scheme-container')].map((i) => (i.style.display = 'none'));
            [...document.querySelectorAll('.information-container')].map(
              (i) => (i.style.display = 'none')
            );
            this.handleAuthorize(false);
          }, 500);
        })
    else
      this.setState({ info: "Try it is not enabled on this api." })
  }

  drawSwaggerUi = () => {
    if (this.props.api.swagger) {
      window.ui = SwaggerUIBundle({
        // TODO: this current team is actually needed by the api
        url: `/api/teams/${this.props.teamId}/apis/${this.props.api._id}/swagger`,
        dom_id: '#swagger-ui',
        deepLinking: true,
        docExpansion: 'list',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        requestInterceptor: (req) => {
          if (req.loadSpec) return req;
          const body = JSON.stringify({
            credentials: req.credentials,
            url: req.url,
            method: req.method,
            body: req.body,
            headers: req.headers,
          });
          const newReq = {
            url: `/api/teams/${this.props.teamId}/testing/${this.props.api._id}/call`,
            method: 'POST',
            body,
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
            },
          };
          return newReq;
        },
      });
    }
  };

  handleAuthorize = (canCreate) => {
    // TODO: at start, try to see if user has test key for it and use it
    //if (canCreate && this.props.testing.auth === "ApiKey") {
    //  // TODO: create a key dedicated for tests and use it
    //} else if (canCreate && this.props.testing.auth === "Basic") {
    //  // TODO: create a key dedicated for tests and use it
    //} else
    if (this.props.testing.auth === 'ApiKey') {
      // window.ui.preauthorizeApiKey('api_key', 'hello');
      // console.log('ApiKey', this.props.testing.name, this.props.testing.username)
      // window.ui.preauthorizeApiKey(this.props.testing.name, this.props.testing.username);
      window.ui.preauthorizeApiKey(this.props.testing.name, 'fake-' + this.props.api._id);
    } else if (this.props.testing.auth === 'Basic') {
      // window.ui.preauthorizeBasic('api_key', 'user', 'pass');
      // console.log('Baisc', this.props.testing.name, this.props.testing.username, this.props.testing.password)
      // window.ui.preauthorizeBasic(this.props.testing.name, this.props.testing.username, this.props.testing.password);
      window.ui.preauthorizeBasic(
        this.props.testing.name,
        'fake-' + this.props.api._id,
        'fake-' + this.props.api._id
      );
    } else {
      console.log(this.props);
      if (canCreate) {
        window.alert('Unknown authentication type');
      } else {
        console.log('Unknown authentication type');
      }
    }
  };

  render() {
    const { tenant, connectedUser } = this.props;

    if (connectedUser.isGuest && tenant.apiReferenceHideForGuest)
      return <LoginOrRegisterModal {...this.props}
        showOnlyMessage={true}
        message={"Try it is only available for registered users."} />

    const api = this.props.api;
    if (!api)
      return <div>
        {t('api_data.missing', this.props.currentLanguage, false, undefined, ["Swagger"])}
      </div>;

    if (this.state.error || this.state.info)
      return <div className="d-flex justify-content-center w-100">
        <span className={`alert alert-${this.state.error ? 'danger' : 'info'} text-center`}>
          {this.state.error ? this.state.error : this.state.info}
        </span>
      </div>
    else
      return (
        <div style={{ width: '100%' }}>
          {/*<button type="button" className="btn btn-success" onClick={e => this.handleAuthorize(true)}>Use apikey (soon)</button>*/}
          <div id="swagger-ui" style={{ width: '100%' }} />
        </div>
      );
  }
}
