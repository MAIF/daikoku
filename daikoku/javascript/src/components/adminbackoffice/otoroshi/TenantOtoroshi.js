import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { connect } from 'react-redux';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { Can, manage, tenant, Spinner } from '../../utils';
import { toastr } from 'react-redux-toastr';
import { I18nContext } from '../../../locales/i18n-context';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

function TenantOtoroshiComponent(props) {
  const { translateMethod, Translation } = useContext(I18nContext);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [state, setState] = useState({
    otoroshi: null,
    create: false,
  });

  const formSchema = {
    _id: {
      type: 'string',
      disabled: true,
      props: { label: translateMethod('Id'), placeholder: '---' },
    },
    url: {
      type: 'string',
      props: {
        label: translateMethod('Otoroshi Url'),
        placeholder: 'https://otoroshi-api.foo.bar',
      },
    },
    host: {
      type: 'string',
      props: {
        label: translateMethod('Otoroshi Host'),
        placeholder: 'otoroshi-api.foo.bar',
      },
    },
    clientId: {
      type: 'string',
      props: { label: translateMethod('Otoroshi client id') },
    },
    clientSecret: {
      type: 'string',
      props: { label: translateMethod('Otoroshi client secret') },
    },
  };

  const formFlow = ['_id', 'url', 'host', 'clientId', 'clientSecret'];

  useEffect(() => {
    if (location && location.state && location.state.newSettings) {
      setState({ ...state, otoroshi: location.state.newSettings, create: true });
    } else {
      Services.oneOtoroshi(props.tenant._id, params.otoroshiId).then((otoroshi) =>
        setState({ ...state, otoroshi })
      );
    }
  }, []);

  const save = () => {
    if (state.create) {
      Services.createOtoroshiSettings(props.tenant._id, state.otoroshi).then((result) => {
        if (result.error) {
          toastr.error('Failure', result.error);
        } else {
          toastr.success(translateMethod('otoroshi.settings.created.success'));
          setState({ ...state, create: false });
        }
      });
    } else {
      Services.saveOtoroshiSettings(props.tenant._id, state.otoroshi).then((result) => {
        if (result.error) {
          toastr.error('Failure', result.error);
        } else {
          toastr.success(translateMethod('otoroshi.settings.updated.success'));
          setState({ ...state, create: false });
        }
      });
    }
  };

  const onDelete = () => {
    window.confirm(translateMethod('otoroshi.settings.delete.confirm')).then((ok) => {
      if (ok) {
        Services.deleteOtoroshiSettings(props.tenant._id, state.otoroshi._id).then(() => {
          toastr.success(translateMethod('otoroshi.settings.deleted.success'));
          navigate('/settings/otoroshis');
        });
      }
    });
  };

  return (
    <UserBackOffice tab="Otoroshi" isLoading={!state.otoroshi}>
      {state.otoroshi && (
        <Can I={manage} a={tenant} dispatchError>
          <div className="row">
            {!state.create && (
              <h1>
                <Translation i18nkey="Otoroshi settings">Otoroshi settings</Translation>
              </h1>
            )}
            {state.create && (
              <h1>
                <Translation i18nkey="New otoroshi settings">New otoroshi settings</Translation>
              </h1>
            )}
          </div>
          <div className="row">
            {state.otoroshi && (
              <React.Suspense fallback={<Spinner />}>
                <LazyForm
                  flow={formFlow}
                  schema={formSchema}
                  value={state.otoroshi}
                  onChange={(otoroshi) => setState({ ...state, otoroshi })}
                  style={{ marginBottom: 20, paddingTop: 20 }}
                />
              </React.Suspense>
            )}
          </div>
          <div className="row">
            <div className="d-flex justify-content-end">
              <Link className="btn btn-outline-primary" to="/settings/otoroshis">
                <i className="fas fa-chevron-left me-1" />
                <Translation i18nkey="Back">Back</Translation>
              </Link>
              {!state.create && (
                <button
                  style={{ marginLeft: 5 }}
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={onDelete}
                >
                  <i className="fas fa-trash me-1" />
                  <Translation i18nkey="Delete">Delete</Translation>
                </button>
              )}
              <button
                style={{ marginLeft: 5 }}
                type="button"
                className="btn btn-outline-success"
                onClick={save}
              >
                {!state.create && (
                  <span>
                    <i className="fas fa-save me-1" />
                    <Translation i18nkey="Save">Save</Translation>
                  </span>
                )}
                {state.create && (
                  <span>
                    <Translation i18nkey="Create">Create</Translation>
                  </span>
                )}
              </button>
            </div>
          </div>
        </Can>
      )}
    </UserBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const TenantOtoroshi = connect(mapStateToProps)(TenantOtoroshiComponent);
