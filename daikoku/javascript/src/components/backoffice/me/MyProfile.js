import React, { Component } from 'react';
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
import { fileToObject } from 'antd/lib/upload/utils';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

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

class Gravatar extends Component {
  setGravatarLink = () => {
    const email = this.props.rawValue.email.toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    this.props.changeValue('picture', url);
  };

  render() {
    return (
      <div className="form-group row">
        <label className="col-xs-12 col-sm-2 col-form-label" />
        <div className="col-sm-10">
          <button type="button" className="btn btn-outline-primary" onClick={this.setGravatarLink}>
            <i className="fas fa-user-circle mr-1" />
            <Translation i18nkey="Set avatar from Gravatar" language={this.props.currentLanguage}>
              Set avatar from Gravatar
            </Translation>
          </button>
        </div>
      </div>
    );
  }
}

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
          style={{ width: 200, height: 200 }}>
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
    picture: {
      type: 'string',
      props: {
        label: t('Avatar', this.props.currentLanguage),
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
    gravatar: {
      type: Gravatar,
      props: {
        currentLanguage: this.props.currentLanguage,
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
  };

  formFlow = [
    'tenants',
    'origins',
    'name',
    'email',
    'setPassword',
    'picture',
    'gravatar',
    'personalToken',
    'refreshToken',
    'defaultLanguage',
  ];

  setFiles = (files) => {
    const file = files[0];
    const filename = file.name;
    const contentType = file.type;
    return Services.storeUserAvatar(filename, contentType, file).then((res) => {
      this.setState(
        {
          user: {
            ...this.state.user,
            picture: `/user-avatar/${this.props.tenant._humanReadableId}/${res.id}`,
          },
        },
        () => this.forceUpdate()
      );
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
          this.setState({ user }, () =>
            toastr.success(
              t(
                'user.updated.success',
                this.props.currentLanguage,
                false,
                'user successfully updated',
                user.name
              )
            )
          );
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
    return (
      <UserBackOffice tab="Me">
        <div className="row">
          <div className="col">
            {!this.state.user && <h1>Me</h1>}
            {this.state.user && (
              <h1 className="h1-rwd-reduce">
                {this.state.user.name} - {this.state.user.email}
              </h1>
            )}
            {this.state.user && (
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  marginTop: 20,
                  marginBottom: 20,
                }}>
                <img
                  src={`${this.state.user.picture}${this.state.user.picture.startsWith('http') ? '' : `?${Date.now()}`}`}
                  style={{
                    width: 200,
                    borderRadius: '50%',
                    backgroundColor: 'white',
                    position: 'relative',
                  }}
                  alt="avatar"
                />
                <PictureUpload
                  setFiles={this.setFiles}
                  currentLanguage={this.props.currentLanguage}
                />
              </div>
            )}
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

export const MyProfile = connect(mapStateToProps)(MyProfileComponent);
