import React, { useContext, useEffect, useState } from 'react';
import { LoginOrRegisterModal } from '..';
import { I18nContext } from '../../../core';

export function ApiRedoc(props) {
  const [error, setError] = useState()

  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    const { tenant, connectedUser } = props;
    const showSwagger = !(connectedUser.isGuest && tenant.apiReferenceHideForGuest);

    if (showSwagger) {
      const url = `${window.location.origin}/api/teams/${props.teamId}/apis/${props.api._id}/swagger.json?version=${props.match.params.versionId}`;

      fetch(url).then((res) => {
        if (res.status > 300)
          setError(translateMethod('api_redoc.failed_to_retrieve_doc'));
        else {
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
    } else
      setError(translateMethod('api_redoc.guest_user'));
  }, [])

  const { tenant, connectedUser } = props;

  if (connectedUser.isGuest && tenant.apiReferenceHideForGuest)
    return (
      <LoginOrRegisterModal
        {...props}
        showOnlyMessage={true}
        asFlatFormat
        message={translateMethod('api_redoc.guest_user')}
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
    return (
      <div>
        {translateMethod('api_data.missing', false, undefined, ['Api reference'])}
      </div>
    );

  return <div id="redoc-container" />;
}
