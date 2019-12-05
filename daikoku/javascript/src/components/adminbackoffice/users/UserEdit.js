import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { connect } from "react-redux";
import * as Services from '../../../services';
import faker from 'faker';
import bcrypt from 'bcryptjs';
import md5 from 'js-md5';

import {AssetChooserByModal, MimeTypeFilter} from '../../frontend';
import { UserBackOffice } from '../../backoffice';
import { Can, manage, daikoku, Spinner } from '../../utils';
import { t, Translation } from "../../../locales";

const LazyForm = React.lazy(() => import('../../inputs/Form'));

class SetPassword extends Component {
  genAndSetPassword = () => {
    window.prompt(t('Type the password', this.props.currentLanguage)).then(pw1 => {
      if (pw1) {
        window.prompt(t('Re-type the password', this.props.currentLanguage)).then(pw2 => {
          if (pw2 && pw1 === pw2) {
            const hashed = bcrypt.hashSync(pw1, bcrypt.genSaltSync(10));
            this.props.changeValue('password', hashed);
          }
        });
      }
    });
  };

  render() {
    return (
      <div className="form-group row">
        <label className="col-xs-12 col-sm-2 col-form-label" />
        <div className="col-sm-10">
          <button
            type="button"
            className="btn btn-outline-success"
            onClick={this.genAndSetPassword}>
            <i className="fas fa-unlock-alt mr-1" /> 
            <Translation i18nkey="Set password" language={this.props.currentLanguage}>
              Set password
            </Translation>
          </button>
        </div>
      </div>
    );
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
          <button
            type="button"
            className="btn btn-outline-success"
            onClick={this.reloadToken}>
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
      <button type="button" className="btn btn-outline-success" onClick={this.setGravatarLink}>
        <i className="fas fa-user-circle mr-1" />
        <Translation i18nkey="Set avatar from Gravatar" language={this.props.currentLanguage}>
          Set avatar from Gravatar
        </Translation>
      </button>
    );
  }
}

class AssetButton extends Component {
  render() {
    return (
      <AssetChooserByModal
        currentLanguage={this.props.currentLanguage}
        typeFilter={MimeTypeFilter.image}
        onlyPreview
        tenantMode
        label={t("Set avatar from asset", this.props.currentLanguage)}
        onSelect={asset => this.props.changeValue('avatar', asset.link)}/>
    );
  }
}
class AvatarChooser extends Component {
  render() {
    return (
      <div className="form-group row">
        <div className="col-12  d-flex justify-content-end">
          <Gravatar {...this.props}/>
          <AssetButton {...this.props}/>
        </div>
      </div>
    );
  }
}

export class UserEditComponent extends Component {
  state = {
    user: null,
  };
  formSchema = {
    _id: { type: 'string', disabled: true, props: { label: 'Id', placeholder: '---' } },
    tenants: {
      type: 'array',
      disabled: true,
      props: {
        label: t('Tenant', this.props.currentLanguage, true, 'Tenants'),
      },
    },
    origins: {
      type: 'array',
      disabled: true,
      props: {
        label: t('Origins', this.props.currentLanguage),
      },
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
    isDaikokuAdmin: {
      type: 'bool',
      props: {
        label: t('Daikoku admin.', this.props.currentLanguage),
      },
    },
    personalToken: {
      type: 'string',
      props: {
        label: t('Personal Token', this.props.currentLanguage),
        disabled: true
      },
    },
    refreshToken: {
      type: RefreshToken,
      props: {
        currentLanguage: this.props.currentLanguage
      }
    },
    password: {
      type: 'string',
      disabled: true,
      props: {
        label: t('Password', this.props.currentLanguage),
      },
    },
    metadata: {
      type: 'object',
      props: {
        label: t('Metadata', this.props.currentLanguage),
      },
    },
    setPassword: {
      type: SetPassword,
      props: {
        currentLanguage: this.props.currentLanguage
      }
    },
    avatarFromAsset: {
      type: AvatarChooser,
      props: {
        currentLanguage: this.props.currentLanguage
      }
    },
  };

  formFlow = [
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
    'metadata'
  ];

  componentDidMount() {
    if (this.props.location && this.props.location.state && this.props.location.state.newUser) {
      this.setState({ user: this.props.location.state.newUser, create: true });
    } else {
      Services.findUserById(this.props.match.params.userId).then(user => this.setState({ user }));
    }
  }

  removeUser = () => {
    Services.deleteUserById(this.state.user._id).then(() => {
      this.props.history.push('/settings/users');
    });
  };

  save = () => {
    if (this.state.create) {
      Services.createUser(this.state.user).then(() => {});
    } else {
      Services.updateUserById(this.state.user).then(user => {
        this.setState({ user, create: false });
      });
      this.props.history.push('/settings/users');
    }
  };

  render() {
    return (
      <UserBackOffice tab="Users">
        <Can I={manage} a={daikoku} dispatchError>
          <div className="row d-flex justify-content-start align-items-center mb-2">
            {this.state.user && (
              <div
                style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '50px',
                  border: '3px solid #fff',
                  boxShadow: '0px 0px 0px 3px lightgrey',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                }}>
                <img
                  src={this.state.user.picture}
                  style={{ width: 200, borderRadius: '50%', backgroundColor: 'white' }}
                  alt="avatar"
                />
              </div>
            )}
              {!this.state.user && <h1>User</h1>}
              {this.state.user && (
                <h1 className="h1-rwd-reduce ml-2">
                  {this.state.user.name} - {this.state.user.email}
                </h1>
              )}
          </div>
          {this.state.user && (
            <div className="row">
              <React.Suspense fallback={<Spinner />}>
                <LazyForm
                  flow={this.formFlow}
                  schema={this.formSchema}
                  value={this.state.user}
                  onChange={user => {
                    this.setState({ user });
                  }}
                />
              </React.Suspense>
            </div>
          )}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Link className="btn btn-outline-danger" to={'/settings/users'}>
              <Translation i18nkey="Cancel" language={this.props.currentLanguage}>
                Cancel
              </Translation>
            </Link>
            {!this.state.create && (
              <button
                style={{ marginLeft: 5 }}
                type="button"
                className="btn btn-outline-danger"
                onClick={this.removeUser}>
                <i className="fas fa-trash mr-1" />
                <Translation i18nkey="Delete" language={this.props.currentLanguage}>
                  Delete
                </Translation>
              </button>
            )}
            <button
              style={{ marginLeft: 5 }}
              type="button"
              className="btn btn-outline-success"
              onClick={this.save}>
              {!this.state.create && (
                <span>
                  <i className="fas fa-save mr-1" />
                  <Translation i18nkey="Save" language={this.props.currentLanguage}>
                    Save
                </Translation>
                </span>
              )}
              {this.state.create && (
                <span>
                  <i className="fas fa-save mr-1" />
                  <Translation i18nkey="Create" language={this.props.currentLanguage}>
                    Create
                  </Translation>
                </span>
              )}
            </button>
          </div>
        </Can>
      </UserBackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const UserEdit = connect(mapStateToProps)(UserEditComponent);