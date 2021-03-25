import React, { Component } from 'react';
import { t, Translation } from '../../../../locales';
import { Spinner } from '../../../utils';

import { checkConnection } from '../../../../services';
import { isArray } from 'xstate/lib/utils';
import { toastr } from 'react-redux-toastr';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export class LDAPConfig extends Component {
  static defaultConfig = {
    sessionMaxAge: 86400,
    serverUrls: [
      'ldap://ldap.forumsys.com:389'
    ],
    searchBase: 'dc=example,dc=com',
    userBase: '',
    searchFilter: '(uid=${username})',
    groupFilter: '()',
    adminGroupFilter: '()',
    adminUsername: 'cn=read-only-admin,dc=example,dc=com',
    adminPassword: 'password',
    nameField: 'cn',
    emailField: 'mail',
    metadataField: null,
  };

  formFlow = [
    'sessionMaxAge',
    'serverUrls',
    'searchBase',
    'userBase',
    'groupFilter',
    'adminGroupFilter',
    'searchFilter',
    'adminUsername',
    'adminPassword',
    'nameField',
    'emailField',
  ];

  formSchema = {
    sessionMaxAge: {
      type: 'number',
      props: {
        suffix: t('seconds', this.props.currentLanguage),
        label: t('Session max. age', this.props.currentLanguage),
      },
    },
    serverUrls: {
      type: 'array',
      props: {
        label: t('LDAP Server URLs', this.props.currentLanguage, true)
      },
    },
    searchBase: {
      type: 'string',
      props: {
        label: t('Search Base', this.props.currentLanguage),
      },
    },
    userBase: {
      type: 'string',
      props: {
        label: t('Users search base', this.props.currentLanguage),
      },
    },
    groupFilter: {
      type: 'string',
      props: {
        label: t('Simple user filter', this.props.currentLanguage),
      },
    },
    adminGroupFilter: {
      type: 'string',
      props: {
        label: t('Tenants admin filter', this.props.currentLanguage),
      },
    },
    searchFilter: {
      type: 'string',
      props: {
        label: t('Search filter', this.props.currentLanguage),
      },
    },
    adminUsername: {
      type: 'string',
      props: {
        label: t('Admin username (bind DN)', this.props.currentLanguage),
      },
    },
    adminPassword: {
      type: 'string',
      props: {
        label: t('Admin password', this.props.currentLanguage),
      },
    },
    nameField: {
      type: 'string',
      props: {
        label: t('Name field name', this.props.currentLanguage),
      },
    },
    emailField: {
      type: 'string',
      props: {
        label: t('Email field name', this.props.currentLanguage),
      },
    },
  };

  state = {
    username: "",
    password: ""
  }

  componentDidMount() {
    if (this.props.rawValue.authProvider === 'LDAP') {
      const { value } = this.props;

      if (value.serverUrls)
        value.serverUrls = isArray(value.serverUrls) ? value.serverUrls : [value.serverUrls];

      this.props.onChange({ ...LDAPConfig.defaultConfig, ...value });
    }
  }

  checkConnection = (value, user) => {
    checkConnection(value, user)
      .then(res => {
        if (res.works)
          toastr.success(t('Worked!'));
        else
          toastr.error(res.error);
      })
  }

  handleChange = e => {
    this.setState({
      [e.target.name]: e.target.value
    });
  }

  render() {
    const { value, onChange } = this.props;
    const { username, password } = this.state;

    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          value={value}
          onChange={onChange}
          flow={this.formFlow}
          schema={this.formSchema}
          style={{ marginTop: 50 }}
        />
        <CheckingAdminConnection
          {...this.props}
          checkConnection={() => this.checkConnection(value)}
        />
        <CheckingUserConnection
          {...this.props}
          username={username}
          password={password}
          handleChange={this.handleChange}
          checkConnection={() => this.checkConnection(value, { username, password })}
        />
      </React.Suspense>
    );
  }
}


function CheckingAdminConnection({ currentLanguage, checkConnection }) {
  return (
    <div>
      <div className="form-group row d-flex px-2">
        <label htmlFor="input-Testing buttons" className="col-xs-12 col-sm-2 col-form-label">{t('Testing connection', currentLanguage)}</label>
        <div className="col-sm-10 pl-3" id="input-Testing buttons">
          <button
            type="button"
            className="btn btn-access-negative mr-1" onClick={checkConnection}>
            <Translation i18nkey="Testing" language={currentLanguage}>
              Testing
          </Translation>
          </button>
        </div>
      </div>
    </div>
  )
}

function CheckingUserConnection({ currentLanguage, checkConnection, username, password, handleChange }) {
  return (
    <div>
      <div className="form-group row d-flex px-2">
        <label htmlFor="input-Testing buttons" className="col-xs-12 col-sm-2 col-form-label">{t('Testing user', currentLanguage)}</label>
        <div className="col-sm-10 pl-3 d-flex" id="input-Testing buttons">
          <input type="text" value={username} onChange={handleChange}
            placeholder="username" name="username" className="form-control mr-1" />
          <input type="password" value={password} onChange={handleChange}
            placeholder="password" name="password" className="form-control mr-1" />
          <button
            type="button"
            className="btn btn-access-negative form-control" onClick={checkConnection}>
            <Translation i18nkey="Testing" language={currentLanguage}>
              Testing
            </Translation>
          </button>
        </div>
      </div>
    </div>
  )
}