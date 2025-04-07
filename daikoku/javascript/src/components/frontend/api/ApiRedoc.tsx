import AsyncApiComponent from "@asyncapi/react-component/browser/index.js";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext, useEffect, useState } from 'react';
import More from 'react-feather/dist/icons/more-vertical';
import Select from 'react-select';
import { RedocStandalone, SideNavStyleEnum } from 'redoc';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { IApi, isError, ISwagger, ITeamSimple, IUsagePlan, IWithSwagger, SpecificationType } from '../../../types';
import { TeamApiSwagger } from '../../backoffice/apis/TeamApiSwagger';
import { api as API, Can, manage } from '../../utils';
import { Option } from '../../utils/Option';
import { Spinner } from '../../utils/Spinner';

import "@asyncapi/react-component/styles/default.min.css";
import { toast } from "sonner";

type ApiRedocProps<T extends IWithSwagger> = {
  swaggerUrl: string,
  swaggerConf?: ISwagger,
  ownerTeam: ITeamSimple,
  entity: T,
  save: (d: T) => Promise<any>
}
export function ApiRedoc<T extends IWithSwagger>(props: ApiRedocProps<T>) {
  const [spec, setSpec] = useState<string>()

  const { connectedUser, tenant } = useContext(GlobalContext)
  const { translate } = useContext(I18nContext);
  const { openLoginOrRegisterModal, openRightPanel, closeRightPanel } = useContext(ModalContext);

  useEffect(() => {
    if (props.swaggerConf?.specificationType === SpecificationType.asyncapi) {
      fetch(props.swaggerUrl, {
        credentials: 'include'
      })
        .then(res => res.blob())
        .then(blob => blob.text())
        .then(setSpec)
    }
  }, [props.swaggerUrl])


  const config = {
    schemaID: 'custom-spec',
    show: {
      operations: true,
      errors: true,
    },
  };

  const downloadFileName = Option<string>(props.swaggerConf?.url)
    .map(url => url.substring(url.lastIndexOf('/') + 1))
    .orElse(props.swaggerConf?.content)
    .map(c => {
      if (c.match(/^[-a-zA-Z0-9@:%_\+.~#?&=]+\.[A-Za-z]{4}$/)) {
        return c
      }
      try {
        JSON.parse(c);
        return "openAPI.json";
      } catch (e) {
        return "openAPI.yaml";
      }
    })
    .getOrElse("openAPI")

  if (connectedUser.isGuest && tenant.apiReferenceHideForGuest) {
    openLoginOrRegisterModal({
      tenant,
      showOnlyMessage: true,
      message: translate('api_redoc.guest_user')
    })
    return <></>
  } else {
    const openApiDocForm = () => openRightPanel({
      title: translate('api.home.spec.right.panel.title'),
      content: <div>
        <TeamApiSwagger
          value={props.entity}
          save={d => props.save(d)
            .then(closeRightPanel)} />
      </div>
    })


    return <div className="d-flex col flex-column section" style={{ position: 'relative' }}>
      <Can I={manage} a={API} team={props.ownerTeam}>
        <button
          className="btn btn-sm btn-outline-primary px-3"
          aria-label={translate('update.api.openapi.btn.label')}
          data-bs-toggle="dropdown"
          aria-expanded="false"
          id={`${props.entity._id}-dropdownMenuButton`}
          style={{ position: 'absolute', top: 10, right: 10, zIndex: 100 }}>
          {translate('api.home.config.api.spec.btn.label')}
        </button>
        <div className="dropdown-menu" aria-labelledby={`${props.entity._id}-dropdownMenuButton`}>
          <span
            onClick={() => openApiDocForm()}
            className="dropdown-item cursor-pointer"
          >
            {translate('api.home.config.api.spec.menu.edit')}
          </span>
          {props.entity.swagger && <div className="dropdown-divider" />}
          {props.entity.swagger && <span
            onClick={() => props.save({ ...props.entity, swagger: null })}
            className="dropdown-item cursor-pointer danger"
          >
            {translate('api.home.config.api.spec.menu.delete')}
          </span>}
        </div>
      </Can>
      <div>
        {props.swaggerConf?.specificationType === SpecificationType.openapi &&
          <RedocStandalone
            specUrl={props.swaggerUrl}
            options={{ downloadFileName, pathInMiddlePanel: true, sideNavStyle: SideNavStyleEnum.PathOnly, ...(props.swaggerConf?.additionalConf || {}) }} />}
        {props.swaggerConf?.specificationType === SpecificationType.asyncapi && <AsyncApiComponent schema={spec} config={config} />}
        {!props.swaggerConf && (
          <Can I={manage} a={API} team={props.ownerTeam}>
            <div className={`alert alert-info col-6 text-center mx-auto`} role='alert'>
              <div>{translate('update.api.openapi.not.found.alert')}</div>
              <button className="btn btn-outline-info" onClick={openApiDocForm}>{translate('update.api.openapi.btn.label')}</button>
            </div>
          </Can>
        )}
      </div>
    </div>
  }
}
type EnvironmentsRedocProps = {
  api: IApi
  ownerTeam: ITeamSimple
}
export const EnvironmentsRedoc = (props: EnvironmentsRedocProps) => {
  const { translate } = useContext(I18nContext);
  const { closeRightPanel } = useContext(ModalContext);

  const [selectedEnvironment, setSelectedEnvironment] = useState<IUsagePlan>()

  const queryClient = useQueryClient();
  const environmentsQuery = useQuery({
    queryKey: ['environments', props.api._id],
    queryFn: () => Services.getVisiblePlans(props.api._id, props.api.currentVersion)
      .then(r => {
        if (isError(r)) {
          return []
        } else {
          setSelectedEnvironment(prev => prev ? r.find(e => e._id === prev._id) : r.find(e => !!e.swagger) || r[0])
          return r
        }
      }),
  })

  const savePlan = (plan: IUsagePlan) => {
    return (
      Services.updatePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, plan)
        .then(() => toast.success(translate('update.plan.successful.toast.label')))
        .then(() => queryClient.invalidateQueries({ queryKey: ['environments'] }))
        .then(closeRightPanel)
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
            menu: (baseStyles) => ({
              ...baseStyles,
              zIndex: 10
            }),
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

        <ApiRedoc
          save={(updatedPlan) => savePlan(updatedPlan)}
          entity={selectedEnvironment}
          ownerTeam={props.ownerTeam}
          swaggerUrl={`/api/teams/${props.ownerTeam._id}/apis/${props.api._id}/${props.api.currentVersion}/plans/${selectedEnvironment._id}/swagger?timestamp=${new Date().getTime()}`}
          swaggerConf={selectedEnvironment.swagger} />
      </div>
    )
  } else {
    return <div>An error occured while fetching environments </div>
  }
}
