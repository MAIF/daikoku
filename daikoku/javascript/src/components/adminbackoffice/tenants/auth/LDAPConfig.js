import React, { Component, useState } from 'react';
import { toastr } from 'react-redux-toastr';

import { t, Translation } from '../../../../locales';
import { Spinner } from '../../../utils';
import { Help } from '../../../inputs';
import { checkConnection } from '../../../../services';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export class LDAPConfig extends Component {
  static defaultConfig = {
    sessionMaxAge: 86400,
    serverUrls: ['ldap://ldap.forumsys.com:389'],
    connectTimeout: 2,
    searchBase: 'dc=example,dc=com',
    userBase: '',
    searchFilter: '(mail=${username})',
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
    'connectTimeout',
    'searchBase',
    'userBase',
    'groupFilter',
    'adminGroupFilter',
    'searchFilter',
    'adminUsername',
    'adminPassword',
    'nameField',
    'emailField',
    'testing',
    'testingWithUser',
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
        label: t('LDAP Server URLs', this.props.currentLanguage, true),
      },
    },
    connectTimeout: {
      type: 'number',
      props: {
        suffix: t('seconds', this.props.currentLanguage),
        label: t('Connect timeout', this.props.currentLanguage),
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
    testing: {
      type: CheckingAdminConnection,
      props: {
        label: t('Testing connection', this.props.currentLanguage),
        checkConnection: () => this.checkConnection(),
      },
    },
    testingWithUser: {
      type: CheckingUserConnection,
      props: {
        label: t('Testing user', this.props.currentLanguage),
        checkConnection: (username, password) => this.checkConnection({ username, password }),
      },
    },
  };

  componentDidMount() {
    if (this.props.rawValue.authProvider === 'LDAP') {
      const { value } = this.props;

      if (value.serverUrl)
        value.serverUrl = Array.isArray(value.serverUrl) ? value.serverUrl : [value.serverUrl];

      this.props.onChange({ ...LDAPConfig.defaultConfig, ...value });
    }
  }

  checkConnection = (user) => {
    checkConnection(this.props.value, user).then((res) => {
      if (res.works) toastr.success(t('Worked!'));
      else toastr.error(res.error);
    });
  };

  render() {
    const { value, onChange } = this.props;

    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          value={value}
          onChange={onChange}
          flow={this.formFlow}
          schema={this.formSchema}
          style={{ marginTop: 50 }}
        />
      </React.Suspense>
    );
  }
}

const CheckingAdminConnection = (props) => {
  return (
    <div className="form-group row">
      <label className="col-xs-12 col-sm-2 col-form-label">
        <Help text={props.help} label={props.label} />
      </label>
      <div className="col-sm-10 pl-3" id="input-Testing buttons">
        <a type="button" className="btn btn-outline-primary mr-1" onClick={props.checkConnection}>
          <Translation i18nkey="Testing" language={props.currentLanguage}>
            Testing
          </Translation>
        </a>
      </div>
    </div>
  );
};

const CheckingUserConnection = (props) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="form-group row">
      <label className="col-xs-12 col-sm-2 col-form-label">
        <Help text={props.help} label={props.label} />
      </label>
      <div className="col-sm-10 pl-3 d-flex" id="input-Testing buttons">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          className="form-control mr-1"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          className="form-control mr-1"
        />
        <a
          type="button"
          className="btn btn-outline-primary"
          onClick={() => props.checkConnection(username, password)}>
          <Translation i18nkey="Testing" language={props.currentLanguage}>
            Testing
          </Translation>
        </a>
      </div>
    </div>
  );
};
