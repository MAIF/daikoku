import { Form, type } from '@maif/react-forms';
import { useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { toast } from 'sonner';
import { useTenantBackOffice } from '../../../contexts';
import { I18nContext } from '../../../contexts/i18n-context';
import { CurrentUserContext } from '../../../contexts/userContext';
import * as Services from '../../../services';
import { Can, tenant as TENANT, manage } from '../../utils';

export const TenantOtoroshi = () => {
  const { tenant } = useContext(CurrentUserContext);
  useTenantBackOffice();

  const { translate, Translation } = useContext(I18nContext);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const [create, setCreate] = useState(false);
  const [otoroshi, setOtoroshi] = useState();

  const formSchema = {
    url: {
      type: type.string,
      label: translate('Otoroshi Url'),
      placeholder: 'https://otoroshi-api.foo.bar',
    },
    host: {
      type: type.string,
      label: translate('Otoroshi Host'),
      placeholder: 'otoroshi-api.foo.bar',
    },
    clientId: {
      type: type.string,
      label: translate('Otoroshi client id'),
    },
    clientSecret: {
      type: type.string,
      label: translate('Otoroshi client secret'),
    },
  };

  useEffect(() => {
    if (location && location.state && (location as any).state.newSettings) {
      setOtoroshi((location as any).state.newSettings);
      setCreate(true);
    } else {
      Services.oneOtoroshi(tenant._id, params.otoroshiId!)
        .then((otoroshi) => setOtoroshi(otoroshi));
    }
  }, []);

  const save = (data: any) => {
    if (create) {
      Services.createOtoroshiSettings(tenant._id, data)
        .then((result) => {
          if (result.error) {
            toast.error(result.error);
          } else {
            toast.success(translate('otoroshi.settings.created.success'));
            navigate('/settings/otoroshis')
          }
        });
    } else {
      Services.saveOtoroshiSettings(tenant._id, data)
        .then((result) => {
          if (result.error) {
            toast.error(result.error);
          } else {
            toast.success(translate('otoroshi.settings.updated.success'));
            navigate('/settings/otoroshis')
          }
        });
    }
  };

  return (
    <Can I={manage} a={TENANT} dispatchError>
      <div className="row">
        {!create && (
          <h1>
            <Translation i18nkey="Otoroshi settings">Otoroshi settings</Translation>
          </h1>
        )}
        {create && (
          <h1>
            <Translation i18nkey="New otoroshi settings">New otoroshi settings</Translation>
          </h1>
        )}
      </div>
      <div className="row">
        {otoroshi && (
          <Form
            schema={formSchema}
            value={otoroshi}
            onSubmit={save}
            options={{
              actions: {
                submit: {
                  label: create ? translate('Create') : translate('Save')
                },
                cancel: {
                  display: true,
                  label: translate('Back'),
                  action: () => navigate('/settings/otoroshis')
                }
              }
            }}
          />
        )}
      </div>
    </Can>
  );
};
