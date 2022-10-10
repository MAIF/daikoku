import React, { useContext, useEffect, useState } from 'react';
import * as Services from '../../../services';
import md5 from 'js-md5';
import { toastr } from 'react-redux-toastr';
import { Form, type, format, constraints } from '@maif/react-forms';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { I18nContext, updateUser } from '../../../core';
import { useUserBackOffice } from '../../../contexts';

const TwoFactorAuthentication = ({
  user
}: any) => {
  const [modal, setModal] = useState<any>(false);
  const [error, setError] = useState<string | undefined>();
  const [backupCodes, setBackupCodes] = useState('');

  const { translate } = useContext(I18nContext);

  const getQRCode = () => {
    Services.getQRCode().then((res) =>
      setModal({
        ...res,
        code: '',
      })
    );
  };

  const disable2FA = () => {
    (window.confirm(translate('2fa.disable_confirm_message')) as any).then((ok: any) => {
      if (ok) {
        Services.disable2FA().then(() => {
          toastr.success(translate('Success'), translate('2fa.successfully_disabled_from_pr'));
          window.location.reload();
        });
      }
    });
  };

  function copyToClipboard() {
    navigator.clipboard.writeText(user?.twoFactorAuthentication.backupCodes);
    toastr.success(translate('succes'), translate('2fa.copied'));
  }

  function verify() {
    if (!modal.code || modal.code.length !== 6) {
      setError(translate('2fa.code_error'));
      setModal({ ...modal, code: '' });
    } else {
      Services.selfVerify2faCode((modal as any).code).then((res) => {
        if (res.error) {
          setError(translate('2fa.wrong_code'));
          setModal({ ...modal, code: '' });
        }
        else {
          toastr.success(translate('Success'), res.message);
          setBackupCodes(res.backupCodes);
        }
      });
    }
  }

  return modal ? (<div>
    {backupCodes ? (<div className="d-flex flex-column justify-content-center align-items-center w-50 mx-auto">
      <span className="my-3">{translate('2fa.backup_codes_message')}</span>
      <div className="d-flex w-100 mb-3">
        <input type="text" disabled={true} value={backupCodes} className="form-control" />
        <button className="btn btn-outline-success ms-1" type="button" onClick={() => {
          navigator.clipboard.writeText(backupCodes);
          toastr.success(translate('Success'), translate('Copied'));
        }}>
          <i className="fas fa-copy" />
        </button>
      </div>
      <button className="btn btn-outline-success" type="button" onClick={() => window.location.reload()}>
        {translate('2fa.confirm')}
      </button>
    </div>) : (<div className="d-flex flex-column justify-content-center align-items-center p-3">
      <div className="d-flex justify-content-center align-items-center p-3">
        <div className="d-flex flex-column justify-content-center align-items-center">
          <span className="my-3 text-center w-75 mx-auto">
            {translate('2fa.advice_scan')}
          </span>
          <img src={`data:image/svg+xml;utf8,${encodeURIComponent((modal as any).qrcode)}`} style={{
            maxWidth: '250px',
            height: '250px',
          }} />
        </div>
        <div className="w-75">
          <span className="my-3 text-center">
            {translate('2fa.advice_enter_manually')}
          </span>
          <textarea style={{
            resize: 'none',
            background: 'none',
            fontWeight: 'bold',
            border: 0,
            color: 'black',
            letterSpacing: '3px',
          }} disabled={true} value={(modal as any).rawSecret.match(/.{1,4}/g).join(' ')} className="form-control" />
        </div>
      </div>
      <div className="w-75 mx-auto">
        <span className="mt-3">{translate('2fa.enter_6_digits')}</span>
        <span className="mb-3">{translate('2fa.enter_a_code')}</span>
        {error && (<div className="alert alert-danger" role="alert">
          {error}
        </div>)}
        <input type="number" value={(modal as any).code} placeholder={translate('2fa.insert_code')} onChange={(e) => {
          if (e.target.value.length < 7) {
            setError(undefined);
            setModal({ ...modal, code: e.target.value });
          }
        }} className="form-control my-3" />

        <button className="btn btn-outline-success" type="button" onClick={verify}>
          {translate('2fa.complete_registration')}
        </button>
      </div>
    </div>)}
  </div>) : (<>
    <div className="form-group row">
      <div className="col-sm-10">
        {user?.twoFactorAuthentication?.enabled ? (<button onClick={disable2FA} className="btn btn-outline-danger" type="button">
          {translate('2fa.disable_action')}
        </button>) : (<button onClick={getQRCode} className="btn btn-outline-success" type="button">
          {translate('2fa.enable_action')}
        </button>)}
      </div>
    </div>
    {user?.twoFactorAuthentication?.enabled && (<div className="form-group row">
      <label className="col-xs-12 col-sm-2 col-form-label">
        {translate('2fa.backup_codes')}
      </label>
      <div className="col-sm-10">
        <div className="d-flex">
          <input type="text" disabled={true} value={user?.twoFactorAuthentication.backupCodes} className="form-control" />
          <button className="btn btn-outline-success ms-1" type="button" onClick={copyToClipboard}>
            <i className="fas fa-copy" />
          </button>
        </div>
      </div>
    </div>)}
  </>);
};

const Avatar = ({
  setValue,
  rawValues,
  value,
  error,
  onChange,
  tenant
}: any) => {
  const { translate, Translation } = useContext(I18nContext);

  const setFiles = (files: any) => {
    const file = files[0];
    const filename = file.name;
    const contentType = file.type;
    return Services.storeUserAvatar(filename, contentType, file)
      .then((res) => {
        if (res.error) {
          toastr.error(translate('Error'), res.error);
        } else {
          setValue('pictureFromProvider', false);
          onChange(`/user-avatar/${tenant._humanReadableId}/${res.id}`);
        }
      });
  };

  const setPictureFromProvider = () => {
    setValue('pictureFromProvider', true);
  };

  const changePicture = (picture: any) => {
    if (rawValues.pictureFromProvider) {
      setValue('pictureFromProvider', false);
      onChange(picture);
    } else {
      onChange(picture);
    }
  };

  const setGravatarLink = () => {
    const email = rawValues.email.toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    changePicture(url);
  };

  const isOtherOriginThanLocal = rawValues?.origins?.some((o: any) => o.toLowerCase !== 'local');

  if (!isOtherOriginThanLocal) {
    return null;
  }
  return (
    <div className="">
      <div className="float-right mb-4 position-relative">
        <img
          src={`${rawValues?.picture}${rawValues?.picture?.startsWith('http') ? '' : `?${Date.now()}`
            }`}
          style={{
            width: 100,
            borderRadius: '50%',
            backgroundColor: 'white',
          }}
          alt="avatar"
          className="mx-3"
        />
        <PictureUpload setFiles={setFiles} />
      </div>
      <div className="">
        <input
          type="text"
          className="form-control"
          value={value}
          onChange={(e) => changePicture(e.target.value)}
        />
        <div className="d-flex mt-1 justify-content-end">
          <button type="button" className="btn btn-outline-primary me-1" onClick={setGravatarLink}>
            <i className="fas fa-user-circle me-1" />
            <Translation i18nkey="Set avatar from Gravatar">Set avatar from Gravatar</Translation>
          </button>
          {isOtherOriginThanLocal && (
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={setPictureFromProvider}
              disabled={rawValues.pictureFromProvider}
            >
              <i className="fas fa-user-circle me-1" />
              <Translation i18nkey="Set avatar from auth. provider">
                Set avatar from auth. Provider
              </Translation>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const PictureUpload = (props: any) => {
  const [uploading, setUploading] = useState(false);

  const { Translation } = useContext(I18nContext);

  const setFiles = (e: any) => {
    const files = e.target.files;
    setUploading(true);
    props.setFiles(files);
    setUploading(false);
  };

  const trigger = () => {
    input.click();
  };

  let input: any;

  return (
    <div className="changePicture mx-3">
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
        style={{ width: 100, height: 100, borderRadius: '50%' }}
      >
        {uploading && <i className="fas fa-spinner" />}
        {!uploading && (
          <div className="text-white">
            <Translation i18nkey="Change your picture">Change your picture</Translation>
          </div>
        )}
      </button>
    </div>
  );
};

export const MyProfile = () => {
  useUserBackOffice();

  const [user, setUser] = useState();
  const [tab, setTab] = useState('infos');

  const { tenant, connectedUser } = useSelector((state) => (state as any).context);
  const dispatch = useDispatch();

  const { translate, setLanguage, language, Translation, languages } =
    useContext(I18nContext);

  const navigate = useNavigate();

  const formSchema = {
    name: {
      type: type.string,
      label: translate('Name'),
      constraints: [constraints.required(translate('constraints.required.name'))],
    },
    email: {
      type: type.string,
      format: format.email,
      label: translate('Email address'),
      constraints: [
        constraints.required(translate('constraints.required.email')),
        constraints.email(translate('constraints.matches.email')),
      ],
    },
    picture: {
      type: type.string,
      label: translate('Avatar'),
      render: (v: any) => Avatar({ ...v, tenant: tenant }),
      constraints: [
        constraints.required(translate('constraints.required.avatar')),
        constraints.url(
          translate({ key: 'constraints.format.url', replacements: [translate('Avatar')] })
        ),
      ],
    },
    defaultLanguage: {
      type: type.string,
      format: format.select,
      label: translate('Default language'),
      defaultValue: languages.find((l: any) => l.value === tenant.defaultLanguage),
      options: languages,
    },
  };

  const formFlow = ['picture', 'name', 'email', 'defaultLanguage'];

  const changePasswordSchema = {
    oldPassword: {
      type: type.string,
      format: format.password,
      label: translate('profile.security.oldPassword'),
      constraints: [constraints.required(translate('constraints.required.oldPassword'))],
    },
    newPassword: {
      type: type.string,
      format: format.password,
      label: translate('profile.security.newPassword'),
      constraints: [
        constraints.required(translate('constraints.required.newPassword')),
        constraints.matches(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,1000}$/,
          translate('constraint.matches.password')
        ),
      ],
    },
    confirmNewPassword: {
      type: type.string,
      format: format.password,
      label: translate('profile.security.confirmPassword'),
      constraints: [
        constraints.required(translate('constraints.required.newPassword')),
        constraints.oneOf(
          [constraints.ref('newPassword')],
          translate('constraint.oneof.confirm.password')
        ),
      ],
    },
  };

  useEffect(() => {
    Services.me()
      .then((user) => {
        setUser(user);
        if (user.defaultLanguage && user.defaultLanguage !== language)
          setLanguage(user.defaultLanguage);
      });
  }, []);

  const save = (data: any) => {
    Services.updateUserById(data).then((user) => {
      setUser(user);
      updateUser(user)(dispatch);

      if (language !== user.defaultLanguage) setLanguage(user.defaultLanguage);

      toastr.success(
        translate('Success'),
        translate({ key: 'user.updated.success', replacements: [user.name] })
      );
    });
  };

  const removeUser = () => {
    (window
      .confirm(translate('delete account')))//@ts-ignore
      .then((ok: any) => {
        if (ok) {
          Services.deleteSelfUserById().then(() => {
            navigate('/logout');
          });
        }
      });
  };

  const updatePassword = ({
    oldPassword,
    newPassword
  }: any) => {
    Services.updateMyPassword(oldPassword, newPassword).then((user) => {
      if (user.error) {
        toastr.error(translate('Error'), translate(user.error));
      } else {
        setUser(user);
        updateUser(user)(dispatch);

        toastr.success(
          translate('Success'),
          translate('user.password.updated.success')
        );
      }
    });
  };

  return (
    <div className="container-fluid">
      <div className="row">
        <ul className="nav nav-tabs flex-column flex-sm-row mb-3 mt-3">
          <li className="nav-item">
            <span
              className={`nav-link cursor-pointer ${tab === 'infos' ? 'active' : ''}`}
              onClick={() => setTab('infos')}
            >
              <Translation i18nkey="Informations">Informations</Translation>
            </span>
          </li>
          <li className="nav-item">
            <span
              className={`nav-link cursor-pointer ${tab === 'security' ? 'active' : ''}`}
              onClick={() => setTab('security')}
            >
              <Translation i18nkey="Security">AccountSecurity</Translation>
            </span>
          </li>
        </ul>
        {tab === 'infos' && (
          <Form
            flow={formFlow}
            //@ts-ignore //FIXME: ???
            schema={formSchema}
            value={user}
            onSubmit={save}
            footer={({ valid }) => {
              return (
                <div className="d-flex mt-3" style={{ justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    style={{ marginLeft: 5 }}
                    onClick={removeUser}
                  >
                    <i className="fas fa-trash me-1" />
                    <Translation i18nkey="Delete my profile">Delete my profile</Translation>
                  </button>
                  <button
                    style={{ marginLeft: 5 }}
                    type="button"
                    className="btn btn-outline-success"
                    onClick={valid}
                  >
                    <span>
                      <i className="fas fa-save me-1" />
                      <Translation i18nkey="Save">Save</Translation>
                    </span>
                  </button>
                </div>
              );
            }}
          />
        )}
        {tab === 'security' && (
          <div className="row">
            <div className="col-sm-6">
              <div className="row">
                <h4>
                  <Translation i18nkey="profile.security.updatePassword">
                    Update password
                  </Translation>
                </h4>
                <Form
                  schema={changePasswordSchema}
                  onSubmit={updatePassword}
                  footer={({ valid }) => {
                    return (
                      <div className="d-flex justify-content-end">
                        <button
                          type="button"
                          className="btn btn-outline-success mb-2"
                          onClick={valid}
                        >
                          <span>
                            <Translation i18nkey="profile.security.updatePassword">
                              Update password
                            </Translation>
                          </span>
                        </button>
                        {/* TODO: forgot password link */}
                      </div>
                    );
                  }}
                />
              </div>
            </div>
            <div className="col-sm-6">
              <h4>
                <Translation i18nkey="2fa">Two-factor authentication</Translation>
              </h4>
              <TwoFactorAuthentication user={user} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};