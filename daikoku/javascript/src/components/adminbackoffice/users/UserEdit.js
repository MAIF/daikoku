import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { connect } from 'react-redux';
import * as Services from '../../../services';
import faker from 'faker';
import md5 from 'js-md5';
import { toastr } from 'react-redux-toastr';

import { AssetChooserByModal, MimeTypeFilter } from '../../frontend';
import { UserBackOffice } from '../../backoffice';
import { Can, manage, daikoku, Spinner, validatePassword, validateUser } from '../../utils';
import { I18nContext } from '../../../core';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

function SetPassword(props) {
  const { translateMethod, Translation } = useContext(I18nContext);

  const genAndSetPassword = () => {
    window.prompt(translateMethod('Type the password'), undefined, true).then((pw1) => {
      if (pw1) {
        window.prompt(translateMethod('Re-type the password'), undefined, true).then((pw2) => {
          const validation = validatePassword(pw1, pw2, translateMethod);
          if (validation.ok) {
            props.changeValue('password', pw2);
          } else {
            props.displayError(validation.error);
          }
        });
      }
    });
  };

  return (
    <div className="form-group row">
      <label className="col-xs-12 col-sm-2 col-form-label" />
      <div className="col-sm-10">
        <button type="button" className="btn btn-outline-success" onClick={genAndSetPassword}>
          <i className="fas fa-unlock-alt mr-1" />
          <Translation i18nkey="Set password">Set password</Translation>
        </button>
      </div>
    </div>
  );
}

function RefreshToken(props) {
  const { Translation } = useContext(I18nContext);

  const reloadToken = () => {
    props.changeValue('personalToken', faker.random.alphaNumeric(32));
  };

  return (
    <div className="form-group row">
      <label className="col-xs-12 col-sm-2 col-form-label" />
      <div className="col-sm-10">
        <button type="button" className="btn btn-outline-success" onClick={reloadToken}>
          <i className="fas fa-sync-alt mr-1" />
          <Translation i18nkey="Reload personal token">Reload personal token</Translation>
        </button>
      </div>
    </div>
  );
}

function Gravatar(props) {
  const { Translation } = useContext(I18nContext);

  const setGravatarLink = () => {
    const email = props.rawValue.email.toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    props.changeValue('picture', url);
  };

  return (
    <button type="button" className="btn btn-access" onClick={setGravatarLink}>
      <i className="fas fa-user-circle mr-1" />
      <Translation i18nkey="Set avatar from Gravatar">Set avatar from Gravatar</Translation>
    </button>
  );
}

function AssetButton(props) {
  const { translateMethod } = useContext(I18nContext);

  return (
    <AssetChooserByModal
      typeFilter={MimeTypeFilter.image}
      onlyPreview
      tenantMode
      label={translateMethod('Set avatar from asset')}
      onSelect={(asset) => props.changeValue('picture', asset.link)}
    />
  );
}

function AvatarChooser(props) {
  return (
    <div className="form-group row">
      <div className="col-12  d-flex justify-content-end">
        <Gravatar {...props} />
        <AssetButton {...props} />
      </div>
    </div>
  );
}

export function UserEditComponent() {
  const { translateMethod, Translation } = useContext(I18nContext);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const [state, setState] = useState({
    user: null,
  });

  const formSchema = {
    _id: { type: 'string', disabled: true, props: { label: 'Id', placeholder: '---' } },
    tenants: {
      type: 'array',
      disabled: true,
      props: {
        label: translateMethod('Tenant', true, 'Tenants'),
      },
    },
    origins: {
      type: 'array',
      disabled: true,
      props: {
        label: translateMethod('Origins'),
      },
    },
    name: {
      type: 'string',
      props: {
        label: translateMethod('Name'),
      },
    },
    email: {
      type: 'string',
      props: {
        label: translateMethod('Email address'),
      },
    },
    picture: {
      type: 'string',
      props: {
        label: translateMethod('Avatar'),
      },
    },
    isDaikokuAdmin: {
      type: 'bool',
      props: {
        label: translateMethod('Daikoku admin.'),
      },
    },
    personalToken: {
      type: 'string',
      props: {
        label: translateMethod('Personal Token'),
        disabled: true,
      },
    },
    refreshToken: {
      type: RefreshToken,
    },
    password: {
      type: 'string',
      disabled: true,
      props: {
        label: translateMethod('Password'),
      },
    },
    metadata: {
      type: 'object',
      props: {
        label: translateMethod('Metadata'),
      },
    },
    setPassword: {
      type: SetPassword,
      props: {
        displayError: (error) => toastr.error(error),
      },
    },
    avatarFromAsset: {
      type: AvatarChooser,
    },
  };

  const formFlow = [
    'name',
    'email',
    'picture',
    'avatarFromAsset',
    'isDaikokuAdmin',
    'password',
    'setPassword',
    'personalToken',
    'refreshToken',
    'tenants',
    'origins',
    'metadata',
  ];

  useEffect(() => {
    if (location && location.state && location.state.newUser) {
      setState({
        ...state,
        user: {
          ...location.state.newUser,
          personalToken: faker.random.alphaNumeric(32),
        },
        create: true,
      });
    } else {
      Services.findUserById(params.userId).then((user) => setState({ ...state, user }));
    }
  }, []);

  const removeUser = () => {
    window.confirm(translateMethod('remove.user.confirm')).then((ok) => {
      if (ok) {
        Services.deleteUserById(state.user._id).then(() => {
          toastr.info(
            translateMethod(
              'remove.user.success',
              false,
              `user ${state.user.name} is successfully deleted`,
              state.user.name
            )
          );
          navigate('/settings/users');
        });
      }
    });
  };

  const save = () => {
    const validation = validateUser(state.user, translateMethod);
    if (validation.ok) {
      if (state.create) {
        Services.createUser(state.user).then(() => {
          toastr.success(
            translateMethod(
              'user.created.success',
              false,
              `user ${state.user.name} successfully created`,
              state.user.name
            )
          );
          navigate('/settings/users');
        });
      } else {
        Services.updateUserById(state.user).then((user) => {
          setState({ ...state, user, create: false });
          toastr.success(
            translateMethod(
              'user.updated.success',
              false,
              `user ${state.user.name} successfully updated`,
              state.user.name
            )
          );
          navigate('/settings/users');
        });
      }
    } else {
      toastr.error(validation.error);
    }
  };

  return (
    <UserBackOffice tab="Users">
      <Can I={manage} a={daikoku} dispatchError>
        <div className="row d-flex justify-content-start align-items-center mb-2">
          {state.user && (
            <div className="ml-1 avatar__container">
              <img
                src={state.user.picture}
                className="img-fluid"
                alt="avatar"
                style={{ minWidth: '100px' }}
              />
            </div>
          )}
          {!state.user && <h1>User</h1>}
          {state.user && (
            <h1 className="h1-rwd-reduce ml-2">
              {state.user.name} - {state.user.email}
            </h1>
          )}
        </div>
        {state.user && (
          <div className="row">
            <React.Suspense fallback={<Spinner />}>
              <LazyForm
                flow={formFlow}
                schema={formSchema}
                value={state.user}
                onChange={(user) => {
                  setState({ ...state, user });
                }}
              />
            </React.Suspense>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Link className="btn btn-outline-danger" to={'/settings/users'}>
            <Translation i18nkey="Cancel">Cancel</Translation>
          </Link>
          {!state.create && (
            <button
              style={{ marginLeft: 5 }}
              type="button"
              className="btn btn-outline-danger"
              onClick={removeUser}
            >
              <i className="fas fa-trash mr-1" />
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
                <i className="fas fa-save mr-1" />
                <Translation i18nkey="Save">Save</Translation>
              </span>
            )}
            {state.create && (
              <span>
                <i className="fas fa-save mr-1" />
                <Translation i18nkey="Create">Create</Translation>
              </span>
            )}
          </button>
        </div>
      </Can>
    </UserBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const UserEdit = connect(mapStateToProps)(UserEditComponent);
