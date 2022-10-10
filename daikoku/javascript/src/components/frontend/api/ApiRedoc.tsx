import React, { useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LoginOrRegisterModal } from '..';
import { I18nContext } from '../../../core';

export function ApiRedoc(props: any) {
  const [error, setError] = useState<string | undefined>();
  const params = useParams();

  const { translate } = useContext(I18nContext);

  useEffect(() => {
    const { tenant, connectedUser } = props;
    const showSwagger = !(connectedUser.isGuest && tenant.apiReferenceHideForGuest);

    if (showSwagger) {
      const url = `${window.location.origin}/api/teams/${props.teamId}/apis/${props.api._id}/${params.versionId}/swagger.json`;

      fetch(url).then((res) => {
        if (res.status > 300) {
          setError(translate('api_redoc.failed_to_retrieve_doc'));
        } else {
          //@ts-ignore
          // eslint-disable-next-line no-undef
          Redoc.init(
            url,
            {
              scrollYOffset: 50,
              hideHostname: true,
              suppressWarnings: true,
            },
            document.getElementById('redoc-container')
          );
        }
      });
    } else {
      setError(translate('api_redoc.guest_user'));
    }
  }, []);

  const { tenant, connectedUser } = props;

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
    return <div>{translate({key: 'api_data.missing', replacements: ['Api reference']})}</div>;

  return <div id="redoc-container" />;
}