import { useContext, useEffect, useState } from 'react';
import { RedocStandalone, SideNavStyleEnum } from 'redoc';
import AsyncApiComponent from "@asyncapi/react-component/browser/index.js";

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import { ISwagger, SpecificationType } from '../../../types';
import { Option } from '../../utils/Option';

import "@asyncapi/react-component/styles/default.min.css";
import { Spinner } from '../../utils/Spinner';

type ApiRedocProps = {
  swaggerUrl: string,
  swaggerConf?: ISwagger
}
export function ApiRedoc(props: ApiRedocProps) {
  const [spec, setSpec] = useState<string>()

  const { connectedUser, tenant } = useContext(GlobalContext)
  const { translate } = useContext(I18nContext);
  const { openLoginOrRegisterModal } = useContext(ModalContext);

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
  } else if (props.swaggerConf?.specificationType === SpecificationType.openapi) {
    return <RedocStandalone specUrl={props.swaggerUrl} options={{ downloadFileName, pathInMiddlePanel: true, sideNavStyle: SideNavStyleEnum.PathOnly, ...(props.swaggerConf?.additionalConf || {}) }} />
  } else if (props.swaggerConf?.specificationType === SpecificationType.asyncapi && spec) {
    return <AsyncApiComponent schema={spec} config={config} />
  } else {
    return <Spinner />
  }
}
