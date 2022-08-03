import React, { useContext, useEffect, useState } from 'react';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';

import { Spinner } from '../../../utils';
import { Help } from '../../../inputs';
import * as Services from '../../../../services';
import { I18nContext } from '../../../../core';

// @ts-expect-error TS(6142): Module '../../../inputs/Form' was resolved to '/Us... Remove this comment to see the full error message
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

export function LDAPConfig(props: any) {
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

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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
        // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
        checkConnection: () => checkConnection(),
      },
    },
    testingWithUser: {
      type: CheckingUserConnection,
      props: {
        label: translateMethod('Testing user'),
        checkConnection: (username: any, password: any) => checkConnection({ username, password }),
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

  const checkConnection = (user: any) => {
    Services.checkConnection(props.value, user).then((res) => {
      if (res.works) toastr.success(translateMethod('Worked!'));
      else toastr.error(res.error);
    });
  };

  const { value, onChange } = props;

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <React.Suspense fallback={<Spinner />}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <LazyForm
        value={value}
        onChange={onChange}
        flow={formFlow}
        schema={formSchema}
        // @ts-expect-error TS(2322): Type '{ value: any; onChange: any; flow: string[];... Remove this comment to see the full error message
        style={{ marginTop: 50 }}
      />
    </React.Suspense>
  );
}

const CheckingAdminConnection = (props: any) => {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <label className="col-xs-12 col-sm-2 col-form-label">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Help text={props.help} label={props.label} />
      </label>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-sm-10 ps-3" id="input-Testing buttons">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <a type="button" className="btn btn-outline-primary me-1" onClick={props.checkConnection}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Testing">Testing</Translation>
        </a>
      </div>
    </div>
  );
};

const CheckingUserConnection = (props: any) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <label className="col-xs-12 col-sm-2 col-form-label">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Help text={props.help} label={props.label} />
      </label>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-sm-10 ps-3 d-flex" id="input-Testing buttons">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          className="form-control me-1"
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          className="form-control me-1"
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <a
          type="button"
          className="btn btn-outline-primary"
          onClick={() => props.checkConnection(username, password)}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Testing">Testing</Translation>
        </a>
      </div>
    </div>
  );
};
