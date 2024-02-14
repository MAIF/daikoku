import { useContext } from 'react';
import { useSelector } from 'react-redux';
import { RedocStandalone } from 'redoc';

import { ModalContext } from '../../../contexts';
import { I18nContext } from '../../../core';
import { IState, IStateContext, ISwagger } from '../../../types';
import { Option } from '../../utils/Option';

type ApiRedocProps = {
  swaggerUrl: string,
  swaggerConf?: ISwagger
}
export function ApiRedoc(props: ApiRedocProps) {

  const { connectedUser, tenant } = useSelector<IState, IStateContext>(s => s.context)

  const { translate } = useContext(I18nContext);
  const { openLoginOrRegisterModal } = useContext(ModalContext);


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
    return <RedocStandalone specUrl={props.swaggerUrl} options={{ downloadFileName, ...(props.swaggerConf?.additionalConf || {}) }} />
  }
}
