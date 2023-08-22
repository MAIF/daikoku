import { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { SwaggerUIBundle } from 'swagger-ui-dist';

import { ModalContext } from '../../../contexts';
import { I18nContext } from '../../../core';
import { IState, IStateContext } from '../../../types';

type ApiRedocProps = {
  swaggerUrl: string
}
export function ApiRedoc(props: ApiRedocProps) {
  const [error, setError] = useState<string>();

  const { connectedUser, tenant } = useSelector<IState, IStateContext>(s => s.context)

  const { translate } = useContext(I18nContext);
  const { openLoginOrRegisterModal } = useContext(ModalContext);

  useEffect(() => {
    fetch(props.swaggerUrl)
      .then((res) => {
        if (res.status > 300) {
          setError(translate('api_swagger.failed_to_retrieve_swagger'));
        } else {
          drawSwaggerUi();
        }
        setTimeout(() => {
          [...document.querySelectorAll('.scheme-container')].map((i) => ((i as any).style.display = 'none'));
          [...document.querySelectorAll('.information-container')].map((i) => ((i as any).style.display = 'none'));
        }, 500);
      });
  }, []);

  const drawSwaggerUi = () => {
    if (props.swaggerUrl) {
      (window as any).ui = SwaggerUIBundle({
        url: props.swaggerUrl,
        dom_id: '#swagger-ui',
        deepLinking: true,
        docExpansion: 'list',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        supportedSubmitMethods: []
      });
    }
  };

  if (connectedUser.isGuest && tenant.apiReferenceHideForGuest)
    openLoginOrRegisterModal({
      tenant,
      showOnlyMessage: true,
      message: translate('api_redoc.guest_user')
    })

  if (error)
    return (
      <div className="d-flex justify-content-center w-100">
        <span className="alert alert-danger text-center">{error}</span>
      </div>
    );

  return <div id="swagger-ui" />
}
