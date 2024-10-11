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
  } else if (props.swaggerConf?.specificationType === SpecificationType.openapi) {
    return <div>
      <Can I={manage} a={API} team={props.ownerTeam}>
        <More
          className="a-fake"
          aria-label="update api"
          style={{ position: "absolute", right: 0 }}
          onClick={() => openRightPanel({
            title: "Update api",
            content:
              <TeamApiSwagger value={props.entity} save={d => props.save(d).then(closeRightPanel)} />
          })
          } />
      </Can>
      <RedocStandalone specUrl={props.swaggerUrl} options={{ downloadFileName, pathInMiddlePanel: true, sideNavStyle: SideNavStyleEnum.PathOnly, ...(props.swaggerConf?.additionalConf || {}) }} />
    </div>
  } else if (props.swaggerConf?.specificationType === SpecificationType.asyncapi && spec) {
    return <AsyncApiComponent schema={spec} config={config} />
  } else {
    return <Spinner />
  }
}
