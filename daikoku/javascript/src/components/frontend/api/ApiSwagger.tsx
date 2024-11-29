import { useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SwaggerUIBundle } from 'swagger-ui-dist';
import More from 'react-feather/dist/icons/more-vertical';
import { toast } from 'sonner';



import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import { IApi, ISwagger, ITeamSimple, ITesting, IWithSwagger, IWithTesting } from '../../../types';
import { Can, manage, api as API } from '../../utils';

import 'swagger-ui-dist/swagger-ui.css';
import { Form, format, type } from '@maif/react-forms';
import { TeamApiSwagger, TeamApiTesting } from '../../backoffice';


type ApiSwaggerProps<T extends IWithTesting> = {
  testing?: ITesting,
  swagger?: ISwagger,
  swaggerUrl: string,
  callUrl: string,
  _id: string
  ownerTeam: ITeamSimple
  entity: T
  save: (d: T) => Promise<any>
}
export function ApiSwagger<T extends IWithTesting>(props: ApiSwaggerProps<T>) {

  const { tenant, connectedUser } = useContext(GlobalContext)

  const { translate } = useContext(I18nContext);
  const { alert, openLoginOrRegisterModal, openRightPanel, closeRightPanel } = useContext(ModalContext);


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

  const openApiDocForm = () => openRightPanel({
    title: translate('update.api.details.panel.title'),
    content: <div>
      <TeamApiSwagger value={props.entity} save={d => props.save(d).then(closeRightPanel)} />
    </div>
  })
  //FIXME: teamAPiTesting does not work on right panel right now
  const openTestingForm = () => openRightPanel({
    title: "Update api",
    content:
      <TeamApiTesting currentTeam={props.ownerTeam} value={props.entity} save={d => props.save(d).then(closeRightPanel)} />
  })

  return (
    <div className="d-flex justify-content-center w-100">
      <Can I={manage} a={API} team={props.ownerTeam}>
        <More
          className="a-fake"
          aria-label={translate('update.api.testing.btn.label')}
          data-bs-toggle="dropdown"
          aria-expanded="false"
          id={`${props.entity._id}-dropdownMenuButton`}
          style={{ position: "absolute", right: 0 }} />

        <div className="dropdown-menu" aria-labelledby={`${props.entity._id}-dropdownMenuButton`}>
          {!props.swagger && <span
            onClick={() => openApiDocForm()}
            className="dropdown-item cursor-pointer"
          >
            {translate('update.api.openapi.btn.label')}
          </span>}
          {props.swagger && <span
            onClick={openTestingForm}
            className="dropdown-item cursor-pointer"
          >
            {translate('update.api.testing.btn.label')}
          </span>}
          {props.entity.testing && <div className="dropdown-divider" />}
          {props.entity.testing && <span
            onClick={() => props.save({...props.entity, testing: null})}
            className="dropdown-item cursor-pointer btn-outline-danger"
          >
            {translate('update.api.testing.delete.btn.label')}
          </span>}
        </div>
      </Can>
      {!props.swagger && (
        <div className={`alert alert-info col-6 text-center mx-auto`} role='alert'>
          <div>{translate('update.api.openapi.not.found.alert')}</div>
          <button className="btn btn-outline-info" onClick={openApiDocForm}>{translate('update.api.openapi.btn.label')}</button>
        </div>
      )}
      {props.swagger && !props.testing && (
        <div className={`alert alert-info col-6 text-center mx-auto`} role='alert'>
          <div>{translate('update.api.testing.not.found.alert')}</div>
          <button className="btn btn-outline-info" onClick={openTestingForm}>{translate('update.api.testing.btn.label')}</button>
        </div>
      )}
      {props.swagger && props.testing && <div id="swagger-ui" style={{ width: '100%' }} />}
    </div>
  );
}
