import { useContext, useEffect, useState } from 'react';
import { RedocStandalone, SideNavStyleEnum } from 'redoc';
import AsyncApiComponent from "@asyncapi/react-component/browser/index.js";
import More from 'react-feather/dist/icons/more-vertical';


import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import { IApi, ISwagger, ITeamSimple, IWithSwagger, SpecificationType } from '../../../types';
import { Option } from '../../utils/Option';

import "@asyncapi/react-component/styles/default.min.css";
import { Spinner } from '../../utils/Spinner';
import { Can, manage, api as API } from '../../utils';
import { TeamApiSwagger } from '../../backoffice/apis/TeamApiSwagger';
import { toast } from 'sonner';

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
      title: translate('update.api.details.panel.title'),
      content: <div>
        <TeamApiSwagger value={props.entity} save={d => props.save(d).then(closeRightPanel)} />
      </div>
    })


    return <div>
      <Can I={manage} a={API} team={props.ownerTeam}>
        <More
          className="a-fake"
          aria-label={translate('update.api.openapi.btn.label')}
          data-bs-toggle="dropdown"
          aria-expanded="false"
          id={`${props.entity._id}-dropdownMenuButton`}
          style={{ position: "absolute", right: 0 }} />
        <div className="dropdown-menu" aria-labelledby={`${props.entity._id}-dropdownMenuButton`}>
          <span
            onClick={() => openApiDocForm()}
            className="dropdown-item cursor-pointer"
          >
            {translate('update.api.openapi.btn.label')}
          </span>
          {props.entity.swagger && <div className="dropdown-divider" />}
          {props.entity.swagger && <span
            onClick={() => props.save({ ...props.entity, swagger: null })}
            className="dropdown-item cursor-pointer btn-outline-danger"
          >
            {translate('update.api.testing.delete.btn.label')}
          </span>}
        </div>
      </Can>
      {props.swaggerConf?.specificationType === SpecificationType.openapi && <RedocStandalone specUrl={props.swaggerUrl} options={{ downloadFileName, pathInMiddlePanel: true, sideNavStyle: SideNavStyleEnum.PathOnly, ...(props.swaggerConf?.additionalConf || {}) }} />}
      {props.swaggerConf?.specificationType === SpecificationType.asyncapi && <AsyncApiComponent schema={spec} config={config} />}
      {!props.swaggerConf && (
        <div className={`alert alert-info col-6 text-center mx-auto`} role='alert'>
          <div>{translate('update.api.openapi.not.found.alert')}</div>
          <button className="btn btn-outline-info" onClick={openApiDocForm}>{translate('update.api.openapi.btn.label')}</button>
        </div>
      )}
    </div>
  }
}
