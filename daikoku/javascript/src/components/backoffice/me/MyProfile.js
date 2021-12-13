import React, { useContext, useEffect, useState } from 'react';
import * as Services from '../../../services';
import faker from 'faker';
import md5 from 'js-md5';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { useNavigate } from 'react-router-dom';

import { UserBackOffice } from '../../backoffice';
import { Spinner, validatePassword, ValidateEmail } from '../../utils';
import { I18nContext, updateUser } from '../../../core';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

function TwoFactorAuthentication({ rawValue }) {
  const [modal, setModal] = useState(false);
  const [error, setError] = useState();
  const [backupCodes, setBackupCodes] = useState('');

  const { translateMethod } = useContext(I18nContext);

  const getQRCode = () => {
    Services.getQRCode().then((res) =>
      setModal({
        ...res,
        code: '',
      })
    );
  };

  const disable2FA = () => {
    window.confirm(translateMethod('2fa.disable_confirm_message')).then((ok) => {
      if (ok) {
        Services.disable2FA().then(() => {
          toastr.success(translateMethod('2fa.successfully_disabled_from_pr'));
          window.location.reload();
        });
      }
    });
  };

  function copyToClipboard() {
    navigator.clipboard.writeText(rawValue.twoFactorAuthentication.backupCodes);
    toastr.success(translateMethod('2fa.copied'));
  }

  function verify() {
    if (!modal.code || modal.code.length !== 6) {
      setError(translateMethod('2fa.code_error'));
      setModal({ ...modal, code: '' });
    } else {
      Services.selfVerify2faCode(modal.code).then((res) => {
        if (res.error) {
          setError(translateMethod('2fa.wrong_code'));
          setModal({ ...modal, code: '' });
        } else {
          toastr.success(res.message);
          setBackupCodes(res.backupCodes);
        }
      });
    }
  }

  return modal ? (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 3,
        backgroundColor: '#f6f7f7',
      }}>
      {backupCodes ? (
        <div className="d-flex flex-column justify-content-center align-items-center w-50 mx-auto">
          <span className="my-3">{translateMethod('2fa.backup_codes_message')}</span>
          <div className="d-flex w-100 mb-3">
            <input type="text" disabled={true} value={backupCodes} className="form-control" />
            <button
              className="btn btn-outline-success ms-1"
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(backupCodes);
                toastr.success('Copied');
              }}>
              <i className="fas fa-copy" />
            </button>
          </div>
          <button
            className="btn btn-outline-success"
            type="button"
            onClick={() => window.location.reload()}>
            {translateMethod('2fa.confirm')}
          </button>
        </div>
      ) : (
        <div className="d-flex flex-column justify-content-center align-items-center p-3">
          <div className="d-flex justify-content-center align-items-center p-3">
            <div className="d-flex flex-column justify-content-center align-items-center">
              <span className="my-3 text-center w-75 mx-auto">
                {translateMethod('2fa.advice_scan')}
              </span>
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(modal.qrcode)}`}
                style={{
                  maxWidth: '250px',
                  height: '250px',
                }}
              />
            </div>
            <div className="w-75">
              <span className="my-3 text-center">
                {translateMethod('2fa.advice_enter_manually')}
              </span>
              <textarea
                type="text"
                style={{
                  resize: 'none',
                  background: 'none',
                  fontWeight: 'bold',
                  border: 0,
                  color: 'black',
                  letterSpacing: '3px',
                }}
                disabled={true}
                value={modal.rawSecret.match(/.{1,4}/g).join(' ')}
                className="form-control"
              />
            </div>
          </div>
          <div className="w-75 mx-auto">
            <span className="mt-3">{translateMethod('2fa.enter_6_digits')}</span>
            <span className="mb-3">{translateMethod('2fa.enter_a_code')}</span>
            {error && (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            )}
            <input
              type="number"
              value={modal.code}
              placeholder={translateMethod('2fa.insert_code')}
              onChange={(e) => {
                if (e.target.value.length < 7) {
                  setError(null);
                  setModal({ ...modal, code: e.target.value });
                }
              }}
              className="form-control my-3"
            />

            <button className="btn btn-outline-success" type="button" onClick={verify}>
              {translateMethod('2fa.complete_registration')}
            </button>
          </div>
        </div>
      )}
    </div>
  ) : (
    <>
      <div className="mb-3 row">
        <label className="col-xs-12 col-sm-2 col-form-label">{translateMethod('2fa')}</label>
        <div className="col-sm-10">
          {rawValue.twoFactorAuthentication && rawValue.twoFactorAuthentication.enabled ? (
            <button onClick={disable2FA} className="btn btn-outline-danger" type="button">
              {translateMethod('2fa.disable_action')}
            </button>
          ) : (
            <button onClick={getQRCode} className="btn btn-outline-success" type="button">
              {translateMethod('2fa.enable_action')}
            </button>
          )}
        </div>
      </div>
      {rawValue.twoFactorAuthentication && rawValue.twoFactorAuthentication.enabled && (
        <div className="mb-3 row">
          <label className="col-xs-12 col-sm-2 col-form-label">
            {translateMethod('2fa.backup_codes')}
          </label>
          <div className="col-sm-10">
            <div className="d-flex">
              <input
                type="text"
                disabled={true}
                value={rawValue.twoFactorAuthentication.backupCodes}
                className="form-control"
              />
              <button
                className="btn btn-outline-success ms-1"
                type="button"
                onClick={copyToClipboard}>
                <i className="fas fa-copy" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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

  if (props.rawValue.origins.length === 1 && props.rawValue.origins[0].toLowerCase() === 'local') {
    return (
      <div className="mb-3 row">
        <label className="col-xs-12 col-sm-2 col-form-label">
          <Translation i18nkey="Password">Password</Translation>
        </label>
        <div className="col-sm-10">
          <button type="button" className="btn btn-outline-primary" onClick={genAndSetPassword}>
            <i className="fas fa-unlock-alt me-1" />
            <Translation i18nkey="Change my password">Change my password</Translation>
          </button>
        </div>
      </div>
    );
  } else {
    return null;
  }
}

function RefreshToken(props) {
  const { Translation } = useContext(I18nContext);

  const reloadToken = () => {
    props.changeValue('personalToken', faker.random.alphaNumeric(32));
  };

  return (
    <div className="mb-3 row">
      <label className="col-xs-12 col-sm-2 col-form-label" />
      <div className="col-sm-10">
        <button type="button" className="btn btn-outline-primary" onClick={reloadToken}>
          <i className="fas fa-sync-alt me-1" />
          <Translation i18nkey="Reload personal token">Reload personal token</Translation>
        </button>
      </div>
    </div>
  );
}

const Avatar = ({ value, rawValue, changeValue, label, ...props }) => {
  const { Translation } = useContext(I18nContext);

  const setPictureFromProvider = () => {
    changeValue('pictureFromProvider', true);
  };

  const changePicture = (picture) => {
    if (rawValue.pictureFromProvider) {
      props.onRawChange({ ...rawValue, picture, pictureFromProvider: false });
    } else {
      changeValue('picture', picture);
    }
  };

  const setGravatarLink = () => {
    const email = rawValue.email.toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    changePicture(url);
  };

  const isOtherOriginThanLocal = rawValue.origins.some((o) => o.toLowerCase !== 'local');

  if (!isOtherOriginThanLocal) {
    return null;
  }
  return (
    <div className="mb-3 row">
      <label className="col-xs-12 col-sm-2 col-form-label">{label}</label>
      <div className="col-sm-10">
        <input
          type="text"
          className="form-control"
          value={value}
          onChange={(e) => changePicture(e.target.value)}
        />
      </div>
      <div className="col-sm-10 offset-sm-2 d-flex mt-1">
        <button type="button" className="btn btn-outline-primary me-1" onClick={setGravatarLink}>
          <i className="fas fa-user-circle me-1" />
          <Translation i18nkey="Set avatar from Gravatar">Set avatar from Gravatar</Translation>
        </button>
        {isOtherOriginThanLocal && (
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={setPictureFromProvider}
            disabled={rawValue.pictureFromProvider ? 'disabled' : null}>
            <i className="fas fa-user-circle me-1" />
            <Translation i18nkey="Set avatar from auth. provider">
              Set avatar from auth. Provider
            </Translation>
          </button>
        )}
      </div>
    </div>
  );
};

function TenantList(props) {
  const [tenants, setTenants] = useState([]);

  const { Translation } = useContext(I18nContext);

  useEffect(() => {
    Services.getTenantNames(props.value).then(setTenants);
  }, []);

  return (
    <div className="mb-3 row pt-3">
      <label className="col-xs-12 col-sm-2 col-form-label">
        <Translation i18nkey="Tenants">Tenants</Translation>
      </label>
      <div className="col-sm-10">
        <p className="fake-form-control">{tenants.join(', ')}</p>
      </div>
    </div>
  );
}

function PictureUpload(props) {
  const [uploading, setUploading] = useState(false);

  const { Translation } = useContext(I18nContext);

  const setFiles = (e) => {
    const files = e.target.files;
    setUploading(true);
    props.setFiles(files);
    setUploading(false);
  };

  const trigger = () => {
    input.click();
  };

  let input;

  return (
    <div className="changePicture">
      <input
        ref={(r) => (input = r)}
        type="file"
        className="form-control hide"
        onChange={setFiles}
      />
      <button
        type="button"
        className="btn btn-outline-secondary"
        disabled={uploading}
        onClick={trigger}
        style={{ width: 200, height: 200, borderRadius: '50%' }}>
        {uploading && <i className="fas fa-spinner" />}
        {!uploading && (
          <div className="text-white">
            <Translation i18nkey="Change your picture">Change your picture</Translation>
          </div>
        )}
      </button>
    </div>
  );
}

function MyProfileComponent(props) {
  const [user, setUser] = useState();

  const { translateMethod, setLanguage, language, Translation, languages } =
    useContext(I18nContext);

  const navigate = useNavigate();

  const formSchema = {
    _id: { type: 'string', disabled: true, props: { label: 'Id', placeholder: '---' } },
    tenants: {
      type: TenantList,
    },
    origins: {
      type: ({ value }) => (
        <div className="mb-3 row">
          <label className="col-xs-12 col-sm-2 col-form-label">
            <Translation i18nkey="Origins">Origins</Translation>
          </label>
          <div className="col-sm-10">
            <p className="fake-form-control">{value.join(', ')}</p>
          </div>
        </div>
      ),
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
    isDaikokuAdmin: {
      type: 'bool',
      props: {
        label: translateMethod('Daikoku admin.'),
      },
    },
    setPassword: {
      type: SetPassword,
      props: {
        displayError: (error) => toastr.error(error),
      },
    },
    picture: {
      type: Avatar,
      props: {
        label: translateMethod('Avatar'),
      },
    },
    defaultLanguage: {
      type: 'select',
      props: {
        label: translateMethod('Default language'),
        possibleValues: languages,
      },
    },
    enable2FA: {
      type: TwoFactorAuthentication,
      props: {
        ...props,
      },
    },
  };

  const formFlow = [
    'name',
    'email',
    'setPassword',
    'picture',
    'personalToken',
    'refreshToken',
    'defaultLanguage',
    'enable2FA',
    'tenants',
    'origins',
  ];

  const setFiles = (files) => {
    const file = files[0];
    const filename = file.name;
    const contentType = file.type;
    return Services.storeUserAvatar(filename, contentType, file).then((res) => {
      if (res.error) {
        toastr.error(res.error);
      } else {
        setUser({
          ...user,
          picture: `/user-avatar/${props.tenant._humanReadableId}/${res.id}`,
          pictureFromProvider: false,
        });
      }
    });
  };

  useEffect(() => {
    Services.me(props.connectedUser._id).then((user) => {
      setUser(user);
      if (user.defaultLanguage && user.defaultLanguage !== language)
        setLanguage(user.defaultLanguage);
    });
  }, []);

  const save = () => {
    if (user.name && user.email && user.picture) {
      const emailValidation = ValidateEmail(user.email, translateMethod);
      if (emailValidation.ok) {
        Services.updateUserById(user).then((user) => {
          setUser(user);
          props.updateUser(user);

          if (language !== user.defaultLanguage) setLanguage(user.defaultLanguage);

          toastr.success(
            translateMethod('user.updated.success', false, 'user successfully updated', user.name)
          );
        });
      } else {
        toastr.error(emailValidation.error);
      }
    } else {
      toastr.error(translateMethod('Missing informations ...'));
    }
  };

  const removeUser = () => {
    window
      .confirm(
        translateMethod(
          'delete account',
          false,
          'Are you sure you want to delete your account ? This action cannot be undone ...'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.deleteSelfUserById().then(() => {
            navigate('/logout');
          });
        }
      });
  };

  return (
    <UserBackOffice tab="Me">
      <div className="row">
        <div className="col">
          <div className="d-flex mb-3">
            {user && (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <img
                  src={`${user.picture}${user.picture.startsWith('http') ? '' : `?${Date.now()}`}`}
                  style={{
                    width: 200,
                    borderRadius: '50%',
                    backgroundColor: 'white',
                    position: 'relative',
                  }}
                  alt="avatar"
                  className="me-3"
                />
                <PictureUpload setFiles={setFiles} />
              </div>
            )}
            {user ? (
              <div className="mt-3">
                <h1 className="my-0">{user.name}</h1>
                <span id="my_profile_email">{user.email}</span>
              </div>
            ) : (
              <h1>Me</h1>
            )}
          </div>
          {user && (
            <React.Suspense fallback={<Spinner />}>
              <LazyForm
                flow={formFlow}
                schema={formSchema}
                value={user}
                onChange={(user) => {
                  setUser(user);
                }}
              />
            </React.Suspense>
          )}
        </div>
      </div>
      <div className="row">
        <div className="d-flex justify-content-end">
          <a className="btn btn-outline-primary" href="#" onClick={() => navigate(-1)}>
            <i className="fas fa-chevron-left me-1" />
            <Translation i18nkey="Back">Back</Translation>
          </a>
          <button
            type="button"
            className="btn btn-outline-danger"
            style={{ marginLeft: 5 }}
            onClick={removeUser}>
            <i className="fas fa-trash me-1" />
            <Translation i18nkey="Delete my profile">Delete my profile</Translation>
          </button>
          <button
            style={{ marginLeft: 5 }}
            type="button"
            className="btn btn-outline-success"
            onClick={save}>
            <span>
              <i className="fas fa-save me-1" />
              <Translation i18nkey="Save">Save</Translation>
            </span>
          </button>
        </div>
      </div>
    </UserBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateUser: (u) => updateUser(u),
};

export const MyProfile = connect(mapStateToProps, mapDispatchToProps)(MyProfileComponent);
