import React, { Component, useState } from 'react';
import * as Services from '../../../services';
import faker from 'faker';
import bcrypt from 'bcryptjs';
import md5 from 'js-md5';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import { configuration } from '../../../locales';
import { UserBackOffice } from '../../backoffice';
import { Spinner, validatePassword, ValidateEmail } from '../../utils';
import { t, Translation } from '../../../locales';
import { updateUser } from '../../../core';
import { udpateLanguage } from '../../../core';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

function TwoFactorAuthentication({ currentLanguage, rawValue }) {
  const [modal, setModal] = useState(false);
  const [error, setError] = useState();
  const [backupCodes, setBackupCodes] = useState("")

  const getQRCode = () => {
    Services.getQRCode()
      .then(res => setModal({
        ...res,
        code: ""
      }));
  }

  const disable2FA = () => {
    window.confirm(t('2fa.disable_confirm_message', currentLanguage))
      .then(ok => {
        if (ok) {
          Services.disable2FA()
            .then(() => {
              toastr.success(t('2fa.successfully_disabled_from_pr', currentLanguage));
              window.location.reload()
            })
        }
      });
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(rawValue.twoFactorAuthentication.backupCodes)
    toastr.success(t('2fa.copied', currentLanguage));
  }

  function verify() {
    if (!modal.code || modal.code.length !== 6) {
      setError(t('2fa.code_error', currentLanguage));
      setModal({ ...modal, code: "" });
    }
    else {
      Services.selfVerify2faCode(modal.code)
        .then(res => {
          if (res.status >= 400) {
            setError(t('2fa.wrong_code', currentLanguage));
            setModal({ ...modal, code: "" });
          }
          else
            res.json()
              .then(r => {
                toastr.success(r.message);
                setBackupCodes(r.backupCodes);
              })
        })
    }
  }

  return (
    modal ?
      <div style={{
        position: 'absolute',
        top: 0, left: 0,
        width: '100%', height: '100%',
        backgroundColor: '#f6f7f7'
      }}>
        {backupCodes ?
          <div className="d-flex flex-column justify-content-center align-items-center w-50 mx-auto">
            <span className="my-3">{t('2fa.backup_codes_message', currentLanguage)}</span>
            <div className="d-flex w-100 mb-3">
              <input type="text" disabled={true} value={backupCodes} className="form-control" />
              <button className="btn btn-outline-success ml-1" type="button" onClick={() => {
                navigator.clipboard.writeText(backupCodes)
                toastr.success("Copied");
              }}>
                <i className="fas fa-copy" />
              </button>
            </div>
            <button className="btn btn-outline-success" type="button" onClick={() => window.location.reload()}>
              {t('2fa.confirm', currentLanguage)}
            </button>
          </div>
          :
          <div className="d-flex flex-column justify-content-center align-items-center p-3">
            <div className="d-flex justify-content-center align-items-center p-3">
              <div className="d-flex flex-column justify-content-center align-items-center">
                <span className="my-3 text-center w-75 mx-auto">{t('2fa.advice_scan', currentLanguage)}</span>
                <img src={`data:image/svg+xml;utf8,${encodeURIComponent(modal.qrcode)}`} style={{
                  maxWidth: "250px",
                  height: "250px"
                }} />
              </div>
              <div className="w-75">
                <span className="my-3 text-center">{t('2fa.advice_enter_manually', currentLanguage)}</span>
                <textarea type="text"
                  style={{ resize: 'none', background: 'none', fontWeight: 'bold', border: 0, color: "black", letterSpacing: '3px' }}
                  disabled={true} value={modal.rawSecret.match(/.{1,4}/g).join(" ")} className="form-control" />
              </div>
            </div>
            <div className="w-75 mx-auto">
              <span className="mt-3">{t('2fa.enter_6_digits', currentLanguage)}</span>
              <span className="mb-3">{t('2fa.enter_a_code', currentLanguage)}</span>
              {error && <div className="alert alert-danger" role="alert">
                {error}
              </div>}
              <input type="number"
                value={modal.code}
                placeholder={t('2fa.insert_code', currentLanguage)}
                onChange={e => {
                  if (e.target.value.length < 7) {
                    setError(null)
                    setModal({ ...modal, code: e.target.value })
                  }
                }} className="form-control my-3" />

              <button className="btn btn-outline-success" type="button" onClick={verify}>
                {t('2fa.complete_registration', currentLanguage)}
              </button>
            </div>
          </div>}
      </div>
      :
      <>
        <div className="form-group row">
          <label className="col-xs-12 col-sm-2 col-form-label">{t('2fa', currentLanguage)}</label>
          <div className="col-sm-10">
            {
              rawValue.twoFactorAuthentication && rawValue.twoFactorAuthentication.enabled ?
                <button onClick={disable2FA} className="btn btn-outline-danger" type="button">
                  {t('2fa.disable_action', currentLanguage)}
                </button> :
                <button onClick={getQRCode} className="btn btn-outline-success" type="button">
                  {t('2fa.enable_action', currentLanguage)}
                </button>
            }
          </div>
        </div>
        {rawValue.twoFactorAuthentication && rawValue.twoFactorAuthentication.enabled && <div className="form-group row">
          <label className="col-xs-12 col-sm-2 col-form-label">{t('2fa.backup_codes', currentLanguage)}</label>
          <div className="col-sm-10">
            <div className="d-flex">
              <input type="text" disabled={true} value={rawValue.twoFactorAuthentication.backupCodes} className="form-control" />
              <button className="btn btn-outline-success ml-1" type="button" onClick={copyToClipboard}>
                <i className="fas fa-copy" />
              </button>
            </div>
          </div>
        </div>}
      </>
  )
}

class SetPassword extends Component {
  genAndSetPassword = () => {
    window
      .prompt(t('Type the password', this.props.currentLanguage), undefined, true)
      .then((pw1) => {
        if (pw1) {
          window
            .prompt(t('Re-type the password', this.props.currentLanguage), undefined, true)
            .then((pw2) => {
              const validation = validatePassword(pw1, pw2, this.props.currentLanguage);
              if (validation.ok) {
                const hashed = bcrypt.hashSync(pw1, bcrypt.genSaltSync(10));
                this.props.changeValue('password', hashed);
              } else {
                this.props.displayError(validation.error);
              }
            });
        }
      });
  };

  render() {
    if (
      this.props.rawValue.origins.length === 1 &&
      this.props.rawValue.origins[0].toLowerCase() === 'local'
    ) {
      return (
        <div className="form-group row">
          <label className="col-xs-12 col-sm-2 col-form-label" />
          <div className="col-sm-10">
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={this.genAndSetPassword}>
              <i className="fas fa-unlock-alt mr-1" />
              <Translation i18nkey="Change my password" language={this.props.currentLanguage}>
                Change my password
              </Translation>
            </button>
          </div>
        </div>
      );
    } else {
      return null;
    }
  }
}

class RefreshToken extends Component {
  reloadToken = () => {
    this.props.changeValue('personalToken', faker.random.alphaNumeric(32));
  };

  render() {
    return (
      <div className="form-group row">
        <label className="col-xs-12 col-sm-2 col-form-label" />
        <div className="col-sm-10">
          <button type="button" className="btn btn-outline-primary" onClick={this.reloadToken}>
            <i className="fas fa-sync-alt mr-1" />
            <Translation i18nkey="Reload personal token" language={this.props.currentLanguage}>
              Reload personal token
            </Translation>
          </button>
        </div>
      </div>
    );
  }
}

const Avatar = ({ currentLanguage, value, rawValue, changeValue, label, ...props }) => {
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
    <div className="form-group row">
      <label className="col-xs-12 col-sm-2 col-form-label">{label}</label>
      <div className="col-sm-10">
        <input type="text" className="form-control" value={value} onChange={(e) => changePicture(e.target.value)} />
      </div>
      <div className="col-sm-10 offset-sm-2 d-flex mt-1">
        <button type="button" className="btn btn-outline-primary mr-1" onClick={setGravatarLink}>
          <i className="fas fa-user-circle mr-1" />
          <Translation i18nkey="Set avatar from Gravatar" language={currentLanguage}>
            Set avatar from Gravatar
          </Translation>
        </button>
        {isOtherOriginThanLocal && (
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={setPictureFromProvider}
            disabled={rawValue.pictureFromProvider ? 'disabled' : null}>
            <i className="fas fa-user-circle mr-1" />
            <Translation i18nkey="Set avatar from auth. provider" language={currentLanguage}>
              Set avatar from auth. Provider
            </Translation>
          </button>
        )}
      </div>
    </div>
  );
};

class TenantList extends Component {
  state = {
    tenants: [],
  };

  componentDidMount() {
    Services.getTenantNames(this.props.value).then((tenants) => this.setState({ tenants }));
  }

  render() {
    return (
      <div className="form-group row pt-3">
        <label className="col-xs-12 col-sm-2 col-form-label">
          <Translation i18nkey="Tenants" language={this.props.currentLanguage}>
            Tenants
          </Translation>
        </label>
        <div className="col-sm-10">
          <p className="fake-form-control">{this.state.tenants.join(', ')}</p>
        </div>
      </div>
    );
  }
}

class PictureUpload extends Component {
  state = { uploading: false };

  setFiles = (e) => {
    const files = e.target.files;
    this.setState({ uploading: true }, () => {
      this.props.setFiles(files).then(() => {
        this.setState({ uploading: false });
      });
    });
  };

  trigger = () => {
    this.input.click();
  };

  render() {
    return (
      <div className="changePicture">
        <input
          ref={(r) => (this.input = r)}
          type="file"
          className="form-control hide"
          onChange={this.setFiles}
        />
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={this.state.uploading}
          onClick={this.trigger}
          style={{ width: 200, height: 200, borderRadius: '50%' }}>
          {this.state.uploading && <i className="fas fa-spinner" />}
          {!this.state.uploading && (
            <div className="text-white">
              <Translation i18nkey="Change your picture" language={this.props.currentLanguage}>
                Change your picture
              </Translation>
            </div>
          )}
        </button>
      </div>
    );
  }
}

class MyProfileComponent extends Component {
  state = {
    user: null,
  };

  formSchema = {
    _id: { type: 'string', disabled: true, props: { label: 'Id', placeholder: '---' } },
    tenants: {
      type: TenantList,
      props: {
        currentLanguage: this.props.currentLanguage,
      },
    },
    origins: {
      type: ({ value }) => (
        <div className="form-group row">
          <label className="col-xs-12 col-sm-2 col-form-label">
            <Translation i18nkey="Origins" language={this.props.currentLanguage}>
              Origins
            </Translation>
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
        label: t('Name', this.props.currentLanguage),
      },
    },
    email: {
      type: 'string',
      props: {
        label: t('Email address', this.props.currentLanguage),
      },
    },
    personalToken: {
      type: 'string',
      props: {
        label: t('Personal Token', this.props.currentLanguage),
        disabled: true,
      },
    },
    refreshToken: {
      type: RefreshToken,
      props: {
        currentLanguage: this.props.currentLanguage,
      },
    },
    isDaikokuAdmin: {
      type: 'bool',
      props: {
        label: t('Daikoku admin.', this.props.currentLanguage),
      },
    },
    setPassword: {
      type: SetPassword,
      props: {
        currentLanguage: this.props.currentLanguage,
        displayError: (error) => toastr.error(error),
      },
    },
    picture: {
      type: Avatar,
      props: {
        currentLanguage: this.props.currentLanguage,
        label: t('Avatar', this.props.currentLanguage),
      },
    },
    defaultLanguage: {
      type: 'select',
      props: {
        label: t('Default language', this.props.currentLanguage),
        possibleValues: Object.keys(configuration).map((key) => ({
          label: key,
          value: key,
        })),
      },
    },
    enable2FA: {
      type: TwoFactorAuthentication,
      props: {
        ...this.props
      }
    }
  };

  formFlow = [
    'name',
    'email',
    'setPassword',
    'picture',
    'personalToken',
    'refreshToken',
    'defaultLanguage',
    'enable2FA',
    'tenants',
    'origins'
  ];

  setFiles = (files) => {
    const file = files[0];
    const filename = file.name;
    const contentType = file.type;
    return Services.storeUserAvatar(filename, contentType, file).then((res) => {
      if (res.error) {
        toastr.error(res.error);
      } else {
        this.setState(
          {
            user: {
              ...this.state.user,
              picture: `/user-avatar/${this.props.tenant._humanReadableId}/${res.id}`,
              pictureFromProvider: false,
            },
          },
          () => this.forceUpdate()
        );
      }
    });
  };

  componentDidMount() {
    Services.me(this.props.connectedUser._id).then((user) => this.setState({ user }));
  }

  save = () => {
    if (this.state.user.name && this.state.user.email && this.state.user.picture) {
      const emailValidation = ValidateEmail(this.state.user.email);
      if (emailValidation.ok) {
        Services.updateUserById(this.state.user).then((user) => {
          this.setState({ user }, () => {
            this.props.updateUser(user);
            if (this.props.currentLanguage !== user.defaultLanguage) {
              this.props.updateLanguage(user.defaultLanguage);
            }
            toastr.success(
              t(
                'user.updated.success',
                this.props.currentLanguage,
                false,
                'user successfully updated',
                user.name
              )
            );
          });
        });
      } else {
        toastr.error(emailValidation.error);
      }
    } else {
      toastr.error(t('Missing informations ...', this.props.currentLanguage));
    }
  };

  removeUser = () => {
    window
      .confirm(
        t(
          'delete account',
          this.props.currentLanguage,
          'Are you sure you want to delete your account ? This action cannot be undone ...'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.deleteSelfUserById().then(() => {
            this.props.history.push('/logout');
          });
        }
      });
  };

  render() {
    const user = this.state.user
    return (
      <UserBackOffice tab="Me">
        <div className="row">
          <div className="col">
            <div className="d-flex mb-3">
              {user && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <img
                    src={`${user.picture}${user.picture.startsWith('http') ? '' : `?${Date.now()}`
                      }`}
                    style={{
                      width: 200,
                      borderRadius: '50%',
                      backgroundColor: 'white',
                      position: 'relative',
                    }}
                    alt="avatar"
                    className="mr-3"
                  />
                  <PictureUpload
                    setFiles={this.setFiles}
                    currentLanguage={this.props.currentLanguage}
                  />
                </div>
              )}
              {user ? <div className="mt-3">
                <h1 className="my-0">{user.name}</h1>
                <span id="my_profile_email">{user.email}</span>
              </div> : <h1>Me</h1>}
            </div>
            {this.state.user && (
              <React.Suspense fallback={<Spinner />}>
                <LazyForm
                  flow={this.formFlow}
                  schema={this.formSchema}
                  value={this.state.user}
                  onChange={(user) => {
                    this.setState({ user });
                  }}
                />
              </React.Suspense>
            )}
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <a
            className="btn btn-outline-primary"
            href="#"
            onClick={() => this.props.history.goBack()}>
            <i className="fas fa-chevron-left mr-1" />
            <Translation i18nkey="Back" language={this.props.currentLanguage}>
              Back
            </Translation>
          </a>
          <button
            type="button"
            className="btn btn-outline-danger"
            style={{ marginLeft: 5 }}
            onClick={this.removeUser}>
            <i className="fas fa-trash mr-1" />
            <Translation i18nkey="Delete my profile" language={this.props.currentLanguage}>
              Delete my profile
            </Translation>
          </button>
          <button
            style={{ marginLeft: 5 }}
            type="button"
            className="btn btn-outline-success"
            onClick={this.save}>
            <span>
              <i className="fas fa-save mr-1" />
              <Translation i18nkey="Save" language={this.props.currentLanguage}>
                Save
              </Translation>
            </span>
          </button>
        </div>
      </UserBackOffice>
    );
  }
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateUser: (u) => updateUser(u),
  updateLanguage: (l) => udpateLanguage(l),
};

export const MyProfile = connect(mapStateToProps, mapDispatchToProps)(MyProfileComponent);
