import { useContext } from 'react';
import { useSelector } from 'react-redux';
import { RedocStandalone } from 'redoc';

import { ModalContext } from '../../../contexts';
import { I18nContext } from '../../../core';
import { IState, IStateContext } from '../../../types';

type ApiRedocProps = {
  swaggerUrl: string
}
export function ApiRedoc(props: ApiRedocProps) {

  const { connectedUser, tenant } = useSelector<IState, IStateContext>(s => s.context)

  const { translate } = useContext(I18nContext);
  const { openLoginOrRegisterModal } = useContext(ModalContext);
  

  if (connectedUser.isGuest && tenant.apiReferenceHideForGuest) {
    openLoginOrRegisterModal({
      tenant,
      showOnlyMessage: true,
      message: translate('api_redoc.guest_user')
    })
    return <></>
  } else {
    return <RedocStandalone specUrl={props.swaggerUrl} />
  }
}
