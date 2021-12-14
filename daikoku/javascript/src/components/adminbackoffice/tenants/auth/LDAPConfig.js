import React, { useContext, useEffect, useState } from 'react';
import { toastr } from 'react-redux-toastr';

import { Spinner } from '../../../utils';
import { Help } from '../../../inputs';
import * as Services from '../../../../services';
import { I18nContext } from '../../../../core';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

const defaultConfig = {
  sessionMaxAge: 86400,
  serverUrls: ['ldap://ldap.forumsys.com:389'],
  connectTimeout: 2,
  searchBase: 'dc=example,dc=com',
  userBase: '',
  searchFilter: '(mail=${username})',
  groupFilter: '',
  adminGroupFilter: '',
  adminUsername: 'cn=read-only-admin,dc=example,dc=com',
  adminPassword: 'password',
  nameFields: ['cn'],
  emailField: 'mail',
  metadataField: null,
};

export function LDAPConfig(props) {
  const formFlow = [
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
    'nameFields',
    'emailField',
    'testing',
    'testingWithUser',
  ];

  const { translateMethod } = useContext(I18nContext);

  const formSchema = {
    sessionMaxAge: {
      type: 'number',
      props: {
        suffix: translateMethod('seconds'),
        label: translateMethod('Session max. age'),
      },
    },
    serverUrls: {
      type: 'array',
      props: {
        label: translateMethod('LDAP Server URLs', true),
      },
    },
    connectTimeout: {
      type: 'number',
      props: {
        suffix: translateMethod('seconds'),
        label: translateMethod('Connect timeout'),
      },
    },
    searchBase: {
      type: 'string',
      props: {
        label: translateMethod('Search Base'),
      },
    },
    userBase: {
      type: 'string',
      props: {
        label: translateMethod('Users search base'),
      },
    },
    groupFilter: {
      type: 'string',
      props: {
        label: translateMethod('Simple user filter'),
      },
    },
    adminGroupFilter: {
      type: 'string',
      props: {
        label: translateMethod('Tenants admin filter'),
      },
    },
    searchFilter: {
      type: 'string',
      props: {
        label: translateMethod('Search filter'),
      },
    },
    adminUsername: {
      type: 'string',
      props: {
        label: translateMethod('Admin username (bind DN)'),
      },
    },
    adminPassword: {
      type: 'string',
      props: {
        label: translateMethod('Admin password'),
      },
    },
    nameFields: {
      type: 'array',
      props: {
        label: translateMethod('Name field name'),
        help: translateMethod('ldap.namefields.help'),
      },
    },
    emailField: {
      type: 'string',
      props: {
        label: translateMethod('Email field name'),
      },
    },
    testing: {
      type: CheckingAdminConnection,
      props: {
        label: translateMethod('Testing connection'),
        checkConnection: () => checkConnection(),
      },
    },
    testingWithUser: {
      type: CheckingUserConnection,
      props: {
        label: translateMethod('Testing user'),
        checkConnection: (username, password) => checkConnection({ username, password }),
      },
    },
  };

  useEffect(() => {
    if (props.rawValue.authProvider === 'LDAP') {
      const { value } = props;

      if (value.serverUrl)
        value.serverUrl = Array.isArray(value.serverUrl) ? value.serverUrl : [value.serverUrl];

      props.onChange({ ...defaultConfig, ...value });
    }
  }, []);

  const checkConnection = (user) => {
    Services.checkConnection(props.value, user).then((res) => {
      if (res.works) toastr.success(translateMethod('Worked!'));
      else toastr.error(res.error);
    });
  };

  const { value, onChange } = props;

  return (
    <React.Suspense fallback={<Spinner />}>
      <LazyForm
        value={value}
        onChange={onChange}
        flow={formFlow}
        schema={formSchema}
        style={{ marginTop: 50 }}
      />
    </React.Suspense>
  );
}

const CheckingAdminConnection = (props) => {
  const { Translation } = useContext(I18nContext);

  return (
    <div className="form-group row">
      <label className="col-xs-12 col-sm-2 col-form-label">
        <Help text={props.help} label={props.label} />
      </label>
      <div className="col-sm-10 pl-3" id="input-Testing buttons">
        <a type="button" className="btn btn-outline-primary mr-1" onClick={props.checkConnection}>
          <Translation i18nkey="Testing">Testing</Translation>
        </a>
      </div>
    </div>
  );
};

const CheckingUserConnection = (props) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const { Translation } = useContext(I18nContext);

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
          onClick={() => props.checkConnection(username, password)}
        >
          <Translation i18nkey="Testing">Testing</Translation>
        </a>
      </div>
    </div>
  );
};
