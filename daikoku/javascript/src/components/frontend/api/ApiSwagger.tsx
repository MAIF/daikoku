import React, { useState, useContext, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SwaggerUIBundle } from 'swagger-ui-dist';

import 'swagger-ui-dist/swagger-ui.css';
import { LoginOrRegisterModal } from '../..';
import { I18nContext } from '../../../core';

export function ApiSwagger(props: any) {
  const { translateMethod } = useContext(I18nContext);

  const [state, setState] = useState<{ error?: string, info?: string }>({});

  const params = useParams();

  useEffect(() => {
    if (props.api.testing.enabled)
      fetch(
        `/api/teams/${params.teamId}/apis/${params.apiId}/${params.versionId}/swagger.json`
      ).then((res) => {
        if (res.status > 300) {
          setState({
            ...state,
            error: translateMethod('api_swagger.failed_to_retrieve_swagger'),
          });
        } else {
          drawSwaggerUi();
        }
        setTimeout(() => {
          [...document.querySelectorAll('.scheme-container')].map((i) => ((i as any).style.display = 'none'));
          [...document.querySelectorAll('.information-container')].map((i) => ((i as any).style.display = 'none'));
          handleAuthorize(false);
        }, 500);
      });
    else setState({ ...state, info: translateMethod('api_swagger.try_it_error') });
  }, []);

  const drawSwaggerUi = () => {
    if (props.api.swagger) {
      (window as any).ui = SwaggerUIBundle({
        // TODO: this current team is actually needed by the api
        url: `/api/teams/${params.teamId}/apis/${params.apiId}/${params.versionId}/swagger`,
        dom_id: '#swagger-ui',
        deepLinking: true,
        docExpansion: 'list',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        requestInterceptor: (req: any) => {
          if (req.loadSpec)
            return req;
          const body = JSON.stringify({
            credentials: req.credentials,
            url: req.url,
            method: req.method,
            body: req.body,
            headers: req.headers,
          });
          const newReq = {
            url: `/api/teams/${props.teamId}/testing/${props.api._id}/call`,
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

  const handleAuthorize = (canCreate: any) => {
    // TODO: at start, try to see if user has test key for it and use it
    //if (canCreate && props.testing.auth === "ApiKey") {
    //  // TODO: create a key dedicated for tests and use it
    //} else if (canCreate && props.testing.auth === "Basic") {
    //  // TODO: create a key dedicated for tests and use it
    //} else
    if (props.testing.auth === 'ApiKey') {
      // window.ui.preauthorizeApiKey('api_key', 'hello');
      // console.log('ApiKey', props.testing.name, props.testing.username)
      // window.ui.preauthorizeApiKey(props.testing.name, props.testing.username);
      (window as any).ui.preauthorizeApiKey(props.testing.name, 'fake-' + props.api._id);
    } else if (props.testing.auth === 'Basic') {
      // window.ui.preauthorizeBasic('api_key', 'user', 'pass');
      // console.log('Baisc', props.testing.name, props.testing.username, props.testing.password)
      // window.ui.preauthorizeBasic(props.testing.name, props.testing.username, props.testing.password);
      (window as any).ui.preauthorizeBasic(props.testing.name, 'fake-' + props.api._id, 'fake-' + props.api._id);
    } else {
      if (canCreate) {
        window.alert('Unknown authentication type');
      } else {
        console.log('Unknown authentication type');
      }
    }
  };

  const { tenant, connectedUser } = props;

  if (connectedUser.isGuest && tenant.apiReferenceHideForGuest)
    return (
      <LoginOrRegisterModal
        {...props}
        showOnlyMessage={true}
        asFlatFormat
        message={translateMethod('api_swagger.guest_user')}
      />
    );

  const api = props.api;
  if (!api) return <div>{translateMethod('api_data.missing', false, undefined, ['Swagger'])}</div>;

  if (state.error || state.info)
    return (
      <div className="d-flex justify-content-center w-100">
        <span className={`alert alert-${state.error ? 'danger' : 'info'} text-center`}>
          {state.error ? state.error : state.info}
        </span>
      </div>
    );
  else
    return (
      <div style={{ width: '100%' }}>
        {/*<button type="button" className="btn btn-success" onClick={e => handleAuthorize(true)}>Use apikey (soon)</button>*/}
        <div id="swagger-ui" style={{ width: '100%' }} />
      </div>
    );
}
