import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Form, type, constraints } from '@maif/react-forms'

import * as Services from '../../../services';
import { Can, manage, tenant as TENANT, Spinner } from '../../utils';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
// @ts-expect-error TS(6142): Module '../../../locales/i18n-context' was resolve... Remove this comment to see the full error message
import { I18nContext } from '../../../locales/i18n-context';
import { useTenantBackOffice } from '../../../contexts';

export const TenantOtoroshi = () => {
  const { tenant } = useSelector((s) => (s as any).context);
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  useTenantBackOffice();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const [create, setCreate] = useState(false);
  const [otoroshi, setOtoroshi] = useState();

  const formSchema = {
    url: {
      type: type.string,
      label: translateMethod('Otoroshi Url'),
      placeholder: 'https://otoroshi-api.foo.bar',
    },
    host: {
      type: type.string,
      label: translateMethod('Otoroshi Host'),
      placeholder: 'otoroshi-api.foo.bar',
    },
    clientId: {
      type: type.string,
      label: translateMethod('Otoroshi client id'),
    },
    clientSecret: {
      type: type.string,
      label: translateMethod('Otoroshi client secret'),
    },
  };

  useEffect(() => {
    if (location && location.state && (location as any).state.newSettings) {
      setOtoroshi((location as any).state.newSettings);
      setCreate(true);
    } else {
      Services.oneOtoroshi(tenant._id, params.otoroshiId)
        .then((otoroshi) => setOtoroshi(otoroshi));
    }
  }, []);

  const save = (data: any) => {
    if (create) {
      Services.createOtoroshiSettings(tenant._id, data)
        .then((result) => {
          if (result.error) {
            toastr.error('Failure', result.error);
          } else {
            toastr.success(translateMethod('otoroshi.settings.created.success'));
            navigate('/settings/otoroshis')
          }
        });
    } else {
      Services.saveOtoroshiSettings(tenant._id, data)
        .then((result) => {
          if (result.error) {
            toastr.error('Failure', result.error);
          } else {
            toastr.success(translateMethod('otoroshi.settings.updated.success'));
            navigate('/settings/otoroshis')
          }
        });
    }
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Can I={manage} a={TENANT} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {!create && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <h1>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Otoroshi settings">Otoroshi settings</Translation>
          </h1>
        )}
        {create && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <h1>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="New otoroshi settings">New otoroshi settings</Translation>
          </h1>
        )}
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {otoroshi && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Form
            schema={formSchema}
            value={otoroshi}
            onSubmit={save}
            options={{
              actions: {
                submit: {
                  label: create ? translateMethod('Create') : translateMethod('Save')
                },
                cancel: {
                  display: true,
                  label: translateMethod('Back'),
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
