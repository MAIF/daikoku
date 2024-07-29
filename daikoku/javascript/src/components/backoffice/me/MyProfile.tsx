import { Form, Schema, constraints, format, type } from '@maif/react-forms';
import { md5 } from 'js-md5';
import { ChangeEvent, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { I18nContext, ModalContext, useUserBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { I2FAQrCode, ITenant, IUser, isError } from '../../../types';
import { Spinner } from '../../utils';

type TwoFactorAuthenticationProps = {
  user: IUser
}

const TwoFactorAuthentication = ({
  user
}: TwoFactorAuthenticationProps) => {
  const [modal, setModal] = useState<I2FAQrCode & { code: string }>();
  const [error, setError] = useState<string>();
  const [backupCodes, setBackupCodes] = useState('');

  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  const getQRCode = () => {
    Services.getQRCode()
      .then((res) => {
        if (!isError(res)) {
          setModal({
            ...res,
            code: '',
          })
        } else {
          toast.error(res.error)
        }
      }
      );
  };

  const disable2FA = () => {
    confirm({ message: translate('2fa.disable_confirm_message') })
      .then((ok) => {
        if (ok) {
          Services.disable2FA()
            .then(() => {
              toast.success(translate('2fa.successfully_disabled_from_pr'));
              window.location.reload();
            });
        }
      });
  };

  function copyToClipboard() {
    navigator.clipboard.writeText(user!.twoFactorAuthentication!.backupCodes);
    toast.success(translate('2fa.copied'));
  }

  function verify() {
    if (!modal!.code || modal!.code.length !== 6) {
      setError(translate('2fa.code_error'));
      setModal({ ...modal!, code: '' });
    } else {
      Services.selfVerify2faCode(modal!.code)
        .then((res) => {
          if (res.error) {
            setError(translate('2fa.wrong_code'));
            setModal({ ...modal!, code: '' });
          } else {
            toast.success(res.message);
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
          toast.success(translate('Copied'));
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
          <img src={`data:image/svg+xml;utf8,${encodeURIComponent(modal.qrcode)}`} style={{
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
          }}
            disabled={true}
            value={modal.rawSecret.match(/.{1,4}/g)!.join(' ')}
            className="form-control" />
        </div>
      </div>
      <div className="w-75 mx-auto">
        <span className="mt-3">{translate('2fa.enter_6_digits')}</span>
        <span className="mb-3">{translate('2fa.enter_a_code')}</span>
        {error && (<div className="alert alert-danger" role="alert">
          {error}
        </div>)}
        <input type="number" value={modal.code} placeholder={translate('2fa.insert_code')} onChange={(e) => {
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
        {user?.twoFactorAuthentication?.enabled ? (
          <button onClick={disable2FA} className="btn btn-outline-danger" type="button">
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
          <input type="text" disabled={true} value={user?.twoFactorAuthentication.backupCodes}
            className="form-control" />
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
  onChange,
  tenant
}: any) => {
  const { Translation } = useContext(I18nContext);

  const setFiles = (files: FileList | null) => {
    if (files) {
      const file = files[0];
      const filename = file.name;
      const contentType = file.type;
      return Services.storeUserAvatar(filename, contentType, file)
        .then((res) => {
          if (res.error) {
            toast.error(res.error);
          } else {
            setValue('pictureFromProvider', false);
            onChange(`/user-avatar/${tenant._humanReadableId}/${res.id}`);
          }
        });
    }
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
        return <></>;
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
                <PictureUpload setFiles={setFiles} tenant={tenant}/>
            </div>
            <div className="">
                <input
                    type="text"
                    className="form-control"
                    value={value}
                    onChange={(e) => changePicture(e.target.value)}
                />
                <div className="d-flex mt-1 justify-content-end">
                    <button type="button" className="btn btn-outline-info me-1" onClick={setGravatarLink}>
                        <i className="fas fa-user-circle me-1"/>
                        <Translation i18nkey="Set avatar from Gravatar">Set avatar from Gravatar</Translation>
                    </button>
                    {isOtherOriginThanLocal && (
                        <button
                            type="button"
                            className="btn btn-outline-info"
                            onClick={setPictureFromProvider}
                            disabled={rawValues.pictureFromProvider}
                        >
                            <i className="fas fa-user-circle me-1"/>
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

type PictureUploadProps = {
  tenant: ITenant,
  setFiles: (files: FileList | null) => void
}
const PictureUpload = (props: PictureUploadProps) => {
  const [uploading, setUploading] = useState(false);

  const { Translation } = useContext(I18nContext);

  const setFiles = (e: ChangeEvent<HTMLInputElement>) => {

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
                onChange={e => setFiles(e)}
            />
            <button
                type="button"
                className="btn btn-outline-primary"
                disabled={uploading}
                onClick={trigger}
                style={{width: 100, height: 100, borderRadius: '50%'}}
            >
                {uploading && <i className="fas fa-spinner"/>}
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

  const [user, setUser] = useState<IUser>();
  const [tab, setTab] = useState('infos');

  const { tenant, reloadContext } = useContext(GlobalContext);
  const [token, setToken] = useState("");

  const [copiedTimeout, setCopiedTimeout] = useState<any>()

  const { translate, setLanguage, language, Translation, languages } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  const formSchema: Schema = {
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
      render: (v) => Avatar({ ...v, tenant: tenant }),
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
      defaultValue: languages.find((l) => l.value === tenant.defaultLanguage)?.value || 'En',
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
        if (!isError(user)) {
          setUser(user);
          if (user.defaultLanguage && user.defaultLanguage !== language)
            setLanguage(user.defaultLanguage);
        } else {
          toast.error(user.error)
        }
      });

    return () => {
      if (copiedTimeout) {
        clearTimeout(copiedTimeout)
      }
    }
  }, []);

  const save = (data: any) => {
    Services.updateUserById(data)
      .then((user) => {
        setUser(user);
        reloadContext();

        if (language !== user.defaultLanguage) setLanguage(user.defaultLanguage);

        toast.success(translate({ key: 'user.updated.success', replacements: [user.name] }));
      });
  };

  const removeUser = () => {
    confirm({ message: translate('delete account'), okLabel: translate('Yes') })
      .then((ok) => {
        if (ok) {
          Services.deleteSelfUserById()
        }
      });
  };

  const updatePassword = ({
    oldPassword,
    newPassword
  }: { oldPassword: string, newPassword: string }) => {
    Services.updateMyPassword(oldPassword, newPassword)
      .then((user) => {
        if (user.error) {
          toast.error(translate(user.error));
        } else {
          setUser(user);
          reloadContext();

          toast.success(translate('user.password.updated.success'));
        }
      });
  };

  if (!user) {
    return <Spinner />
  }

  const resetToken = (copy?: boolean) => {
    let rawUser: IUser = user;

    fetch(`/api/users/${rawUser._id}/session`, {
      credentials: 'include'
    })
      .then(r => r.json())
      .then(data => {
        setToken(data.token);

        if (copy)
          copyToken()
      })
  }

  const copyToken = () => {
    if (navigator.clipboard && window.isSecureContext && !copiedTimeout) {
      navigator.clipboard.writeText(`daikokucli login --token=${token}`);

      setCopiedTimeout(setTimeout(() => {
        setCopiedTimeout(null)
      }, 1500))
    }
  }

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
          <li className="nav-item">
            <span
              className={`nav-link cursor-pointer ${tab === 'cms_cli' ? 'active' : ''}`}
              onClick={() => {
                resetToken()
                setTab('cms_cli')
              }}
            >
              <Translation i18nkey="CMS CLI">CMS CLI</Translation>
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
                          className="btn btn-outline-success my-2"
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

        {tab === "cms_cli" && <div>
          <textarea
            readOnly
            rows={4}
            className="form-control input-sm" value={`daikokucli login --token=${token}`} />
          <div className='d-flex align-items-center mt-3' style={{ gap: '.25rem' }}>
            <button
              type="button"
              disabled={copiedTimeout}
              className="btn btn-sm btn-outline-primary m-1"
              onClick={copyToken}
            >
              {copiedTimeout ? <span>
                <Translation i18nkey="profile.cmscli.paste.token">
                  Copied
                </Translation>
                <i className='fas fa-paste ms-1' />
              </span> : <span>
                <Translation i18nkey="profile.cmscli.copy.token">
                  Copy
                </Translation>
                <i className='fas fa-copy ms-1' />
              </span>}
            </button>
          </div>
        </div>}
      </div>
    </div>
  );
};
