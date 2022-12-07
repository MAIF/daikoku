import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { SwaggerUIBundle } from 'swagger-ui-dist';

import { LoginOrRegisterModal } from '..';
import { I18nContext } from '../../../core';
import { IApi, IState, IStateContext } from '../../../types';

type ApiRedocProps = {
  teamId: string
  api: IApi
}
export function ApiRedoc(props: ApiRedocProps) {
  const [error, setError] = useState<string>();
  const params = useParams();

  const { connectedUser, tenant } = useSelector<IState, IStateContext>(s => s.context)

  const { translate } = useContext(I18nContext);

  useEffect(() => {
    fetch(
      `/api/teams/${params.teamId}/apis/${params.apiId}/${params.versionId}/swagger.json`
    ).then((res) => {
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
    if (props.api.swagger) {
      (window as any).ui = SwaggerUIBundle({
        url: `/api/teams/${api.team}/apis/${api._id}/${api.currentVersion}/swagger`,
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
    return (
      <LoginOrRegisterModal
        {...props}
        showOnlyMessage={true}
        asFlatFormat
        message={translate('api_redoc.guest_user')}
      />
    );

  if (error)
    return (
      <div className="d-flex justify-content-center w-100">
        <span className="alert alert-danger text-center">{error}</span>
      </div>
    );

  const api = props.api;
  if (!api || !api.swagger)
    return <div>{translate({ key: 'api_data.missing', replacements: ['Api reference'] })}</div>;

  return <div id="swagger-ui" />
}
