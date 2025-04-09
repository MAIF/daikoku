import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext, useEffect, useState } from 'react';
import Select from 'react-select';
import { toast } from 'sonner';
import { SwaggerUIBundle } from 'swagger-ui-dist';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { IApi, isError, ISwagger, ITeamSimple, ITesting, IUsagePlan, IWithTesting } from '../../../types';
import { TeamApiSwagger, TeamApiTesting } from '../../backoffice';
import { api as API, Can, manage, Spinner } from '../../utils';

import 'swagger-ui-dist/swagger-ui.css';


type ApiTestProps<T extends IWithTesting> = {
  testing?: ITesting,
  swagger?: ISwagger,
  swaggerUrl: string,
  callUrl: string,
  _id: string
  ownerTeam: ITeamSimple
  entity: T
  save: (d: T) => Promise<any>
}
export function ApiTest<T extends IWithTesting>(props: ApiTestProps<T>) {

  const { tenant, connectedUser } = useContext(GlobalContext)

  const { translate } = useContext(I18nContext);
  const { alert, openLoginOrRegisterModal, openRightPanel, closeRightPanel } = useContext(ModalContext);


  const [state, setState] = useState<{ error?: string, info?: string }>({});

  const queryClient = useQueryClient();

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
  }, [props.swaggerUrl]);

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
    if (props.testing?.auth === 'ApiKey') {
      // window.ui.preauthorizeApiKey('api_key', 'hello');
      // console.log('ApiKey', props.testing.name, props.testing.username)
      // window.ui.preauthorizeApiKey(props.testing.name, props.testing.username);
      window.ui.preauthorizeApiKey(props.testing.name, 'fake-' + props._id);
    } else if (props.testing?.auth === 'Basic') {
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
    title: translate('api.home.spec.right.panel.title'),
    content: <div>
      <TeamApiSwagger value={props.entity} save={d => props.save(d).then(closeRightPanel)} />
    </div>
  })

  const openTestingForm = () => openRightPanel({
    title: "Update api",
    content:
      <TeamApiTesting
        _id={props._id}
        currentTeam={props.ownerTeam}
        value={props.entity}
        save={d => props.save(d)
          .then(() => closeRightPanel())} />
  })

  return (
    <div className="d-flex justify-content-center w-10 p-3" style={{ position: 'relative' }}>
      <Can I={manage} a={API} team={props.ownerTeam}>
        {/* <div className="mb-2 d-flex justify-content-end"> */}
        <button
          className="btn btn-sm btn-outline-primary px-3"
          aria-label={translate('update.api.testing.btn.label')}
          data-bs-toggle="dropdown"
          aria-expanded="false"
          id={`${props.entity._id}-dropdownMenuButton`}
          style={{ position: 'absolute', right: 0, zIndex: 100 }}>
          {translate('api.home.config.api.test.btn.label')}
        </button>
        {/* </div> */}

        <div className="dropdown-menu" aria-labelledby={`${props.entity._id}-dropdownMenuButton`}>
          {!props.swagger && <span
            onClick={() => openApiDocForm()}
            className="dropdown-item cursor-pointer"
          >
            {translate('api.home.config.api.spec.btn.label')}
          </span>}
          {props.swagger && <span
            onClick={openTestingForm}
            className="dropdown-item cursor-pointer"
          >
            {translate('api.home.config.api.test.menu.edit')}
          </span>}
          {props.entity.testing && <div className="dropdown-divider" />}
          {props.entity.testing && <span
            onClick={() => props.save({ ...props.entity, testing: null })}
            className="dropdown-item cursor-pointer danger"
          >
            {translate('api.home.config.api.test.menu.delete')}
          </span>}
        </div>
      </Can>
      {!props.swagger && (
        <Can I={manage} a={API} team={props.ownerTeam}>
          <div className={`alert alert-info col-6 text-center mx-auto`} role='alert'>
            <div>{translate('update.api.openapi.not.found.alert')}</div>
            <button className="btn btn-outline-info" onClick={openApiDocForm}>{translate('update.api.openapi.btn.label')}</button>
          </div>
        </Can>
      )}
      {props.swagger && !props.testing && (
        <Can I={manage} a={API} team={props.ownerTeam}>
          <div className={`alert alert-info col-6 text-center mx-auto`} role='alert'>
            <div>{translate('update.api.testing.not.found.alert')}</div>
            <button className="btn btn-outline-info" onClick={openTestingForm}>{translate('update.api.testing.btn.label')}</button>
          </div>
        </Can>
      )}
      {props.swagger && props.testing?.enabled && <div id="swagger-ui" style={{ width: '100%' }} />}
      {(!props.swagger || !props.testing?.enabled) && null}
    </div>
  );
}

type EnvironmentsSwaggerProps = {
  api: IApi
  ownerTeam: ITeamSimple
}
export const EnvironmentsTest = (props: EnvironmentsSwaggerProps) => {
  const { translate } = useContext(I18nContext);

  const [selectedEnvironment, setSelectedEnvironment] = useState<IUsagePlan>()

  const queryClient = useQueryClient();
  const environmentsQuery = useQuery({
    queryKey: ['environments', props.api._id],
    queryFn: () => Services.getVisiblePlans(props.api._id, props.api.currentVersion)
      .then(r => {
        if (isError(r)) {
          return []
        } else {
          setSelectedEnvironment(r.find(e => e.testing?.enabled) || r[0])
          return r
        }
      }),
  })

  const savePlan = (plan: IUsagePlan) => {
    return (
      Services.updatePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, plan)
        .then(() => toast.success(translate('update.plan.successful.toast.label')))
        .then(() => queryClient.invalidateQueries({ queryKey: ['environments'] }))
    )
  }

  if (!selectedEnvironment && environmentsQuery.isLoading) {
    return <Spinner />
  } else if (selectedEnvironment && environmentsQuery.data) {
    const environments: IUsagePlan[] = environmentsQuery.data
    return (
      <div className='d-flex flex-column'>
        <Select
          className='col-3'
          placeholder={translate('api.subscriptions.team.select.placeholder')}
          options={environments.map(value => ({ label: value.customName, value }))}
          onChange={t => setSelectedEnvironment(t!.value)}
          value={{ label: selectedEnvironment.customName, value: selectedEnvironment }}
          styles={{
            valueContainer: (baseStyles) => ({
              ...baseStyles,
              display: 'flex'
            }),
          }}
          components={{
            IndicatorSeparator: () => null,
            SingleValue: (props) => {
              return <div className='d-flex align-items-center m-0' style={{
                gap: '.5rem'
              }}>
                <span className={`badge badge-custom`}>
                  {'ENV'}
                </span>{props.data.label}
              </div>
            }
          }} />


        <ApiTest
          _id={props.api._id}
          testing={selectedEnvironment.testing}
          swagger={selectedEnvironment.swagger}
          swaggerUrl={`/api/teams/${props.ownerTeam._id}/apis/${props.api._id}/${props.api.currentVersion}/plans/${selectedEnvironment._id}/swagger?timestamp=${new Date().getTime()}`}
          callUrl={`/api/teams/${props.ownerTeam._id}/testing/${props.api._id}/plans/${selectedEnvironment._id}/call`}
          ownerTeam={props.ownerTeam}
          entity={selectedEnvironment}
          save={savePlan}
        />
      </div>
    )
  } else {
    return <div>An error occured while fetching environments </div>
  }
}
