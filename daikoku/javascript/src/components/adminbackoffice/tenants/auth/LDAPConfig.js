import React, { Component } from 'react';
import { t } from '../../../../locales';
import { Spinner } from '../../../utils';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export class LDAPConfig extends Component {
  static defaultConfig = {
    sessionMaxAge: 86400,
    serverUrl: 'ldap://ldap.forumsys.com:389',
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
    'serverUrl',
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
    serverUrl: {
      type: 'string',
      props: {
        label: t('LDAP Server URL', this.props.currentLanguage),
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
        label: t('Group filter', this.props.currentLanguage),
      },
    },
    adminGroupFilter: {
      type: 'string',
      props: {
        label: t('Admins. group filter', this.props.currentLanguage),
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

  componentDidMount() {
    if (this.props.rawValue.authProvider === 'LDAP') {
      this.props.onChange({ ...LDAPConfig.defaultConfig, ...this.props.value });
    }
  }

  render() {
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          value={this.props.value}
          onChange={this.props.onChange}
          flow={this.formFlow}
          schema={this.formSchema}
          style={{ marginTop: 50 }}
        />
      </React.Suspense>
    );
  }
}
