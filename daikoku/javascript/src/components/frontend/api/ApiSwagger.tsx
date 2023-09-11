import { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { SwaggerUIBundle } from 'swagger-ui-dist';

import { ModalContext } from '../../../contexts';
import { I18nContext } from '../../../core';
import { IState, IStateContext, ISwagger, ITesting } from '../../../types';

import 'swagger-ui-dist/swagger-ui.css';


type ApiSwaggerProps = {
  testing?: ITesting,
  swagger?: ISwagger,
  swaggerUrl: string,
  callUrl: string,
  _id: string
}
export function ApiSwagger(props: ApiSwaggerProps) {

  const { tenant, connectedUser } = useSelector<IState, IStateContext>(s => s.context)

  const { translate } = useContext(I18nContext);
  const { alert, openLoginOrRegisterModal } = useContext(ModalContext);

  const [state, setState] = useState<{ error?: string, info?: string }>({});

  const params = useParams();

  useEffect(() => {
    if (!!props.testing?.enabled) {
      fetch(`${props.swaggerUrl}.json`)
        .then((res) => {
          if (res.status > 300) {
            setState({
              ...state,
              error: translate('api_swagger.failed_to_retrieve_swagger'),
            });
          } else {
            drawSwaggerUi();
          }
          setTimeout(() => {
            [...document.querySelectorAll<HTMLElement>('.scheme-container')].map((i) => (i.style.display = 'none'));
            [...document.querySelectorAll<HTMLElement>('.information-container')].map((i) => (i.style.display = 'none'));
            handleAuthorize(false);
          }, 500);
        });
    } else {
      setState({ ...state, info: translate('api_swagger.try_it_error') })
    };
  }, []);

  const drawSwaggerUi = () => {
    if (props.swagger) {
      window.ui = SwaggerUIBundle({
        // TODO: this current team is actually needed by the api
        url: props.swaggerUrl,
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
            url: props.callUrl,
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
    if (props.testing?.auth.name === 'ApiKey') {
      // window.ui.preauthorizeApiKey('api_key', 'hello');
      // console.log('ApiKey', props.testing.name, props.testing.username)
      // window.ui.preauthorizeApiKey(props.testing.name, props.testing.username);
      window.ui.preauthorizeApiKey(props.testing.name, 'fake-' + props._id);
    } else if (props.testing?.auth.name === 'Basic') {
      // window.ui.preauthorizeBasic('api_key', 'user', 'pass');
      // console.log('Baisc', props.testing.name, props.testing.username, props.testing.password)
      // window.ui.preauthorizeBasic(props.testing.name, props.testing.username, props.testing.password);
      window.ui.preauthorizeBasic(props.testing.name, 'fake-' + props._id, 'fake-' + props._id);
    } else {
      if (canCreate) {
        alert({ message: 'Unknown authentication type' });
      } else {
        console.log('Unknown authentication type');
      }
    }
  };

  if (connectedUser.isGuest && tenant.apiReferenceHideForGuest)
    openLoginOrRegisterModal({
      tenant,
      showOnlyMessage: true,
      message: translate('api_swagger.guest_user')
    })

  // const api = props.api;
  if (!props._id) return <div>{translate({ key: 'api_data.missing', replacements: ['Swagger'] })}</div>;

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
        <div id="swagger-ui" style={{ width: '100%' }} />
      </div>
    );
}
