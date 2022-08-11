import React, { useContext, useState, useEffect } from 'react';
import { Form, format, type, constraints, Schema } from '@maif/react-forms';

import * as Services from '../../../../services';

import { ITenant } from '../../../../types';
import { I18nContext } from '../../../../core';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '../../../utils';

export const AuthenticationForm = (props: { tenant: ITenant }) => {
  const { translateMethod } = useContext(I18nContext)
  const { isLoading, data } = useQuery(['tenant'], () => Services.oneTenant(props.tenant._id))

  const LocalSchema: Schema = {
    authProviderSettings: {
      type: type.object,
      format: format.form,
      label: translateMethod('Settings'),
      schema: {
        sessionMaxAge: {
          type: type.number,
          label: translateMethod('Session max. age (s)'),
          defaultValue: 86400
        },
      }
    }
  }
  const OtoroshiSchema: Schema = {
    authProviderSettings: {
      type: type.object,
      format: format.form,
      label: translateMethod('Settings'),
      schema: {
        sessionMaxAge: {
          type: type.number,
          label: translateMethod('Session max. age (s)'),
          defaultValue: 86400
        },
        claimHeaderName: {
          type: type.string,
          label: translateMethod('Claim header name'),
          visible: ({ rawValues }) => rawValues.authProvider === 'Otoroshi',
          deps: ['authProvider']

        },
        claimSecret: {
          type: type.string,
          label: translateMethod('Claim Secret'),
          visible: ({ rawValues }) => rawValues.authProvider === 'Otoroshi',
          deps: ['authProvider']
        },
      }
    }
  }
  const LdapSchema: Schema = {
    authProviderSettings: {
      type: type.object,
      format: format.form,
      label: translateMethod('Settings'),
      schema: {
        sessionMaxAge: {
          type: type.number,
          label: translateMethod('Session max. age (s)'),
          defaultValue: 86400
        },
        serverUrls: {
          type: type.string,
          array: true,
          label: translateMethod('LDAP Server URLs', true),
          visible: ({ rawValues }) => rawValues.authProvider === 'LDAP',
          deps: ['authProvider']
        },
        connectTimeout: {
          type: type.number,
          label: translateMethod('Connect timeout (s)'),
          visible: ({ rawValues }) => rawValues.authProvider === 'LDAP',
          deps: ['authProvider']
        },
        searchBase: {
          type: type.string,
          label: translateMethod('Search Base'),
          visible: ({ rawValues }) => rawValues.authProvider === 'LDAP',
          deps: ['authProvider']
        },
        userBase: {
          type: type.string,
          label: translateMethod('Users search base'),
          visible: ({ rawValues }) => rawValues.authProvider === 'LDAP',
          deps: ['authProvider']
        },
        groupFilter: {
          type: type.string,
          label: translateMethod('Simple user filter'),
          visible: ({ rawValues }) => rawValues.authProvider === 'LDAP',
          deps: ['authProvider']
        },
        adminGroupFilter: {
          type: type.string,
          label: translateMethod('Tenants admin filter'),
          visible: ({ rawValues }) => rawValues.authProvider === 'LDAP',
          deps: ['authProvider']
        },
        searchFilter: {
          type: type.string,
          label: translateMethod('Search filter'),
          visible: ({ rawValues }) => rawValues.authProvider === 'LDAP',
          deps: ['authProvider']
        },
        adminUsername: {
          type: type.string,
          label: translateMethod('Admin username (bind DN)'),
          visible: ({ rawValues }) => rawValues.authProvider === 'LDAP',
          deps: ['authProvider']
        },
        adminPassword: {
          type: type.string,
          label: translateMethod('Admin password'),
          visible: ({ rawValues }) => rawValues.authProvider === 'LDAP',
          deps: ['authProvider']
        },
        nameFields: {
          type: type.string,
          array: true,
          label: translateMethod('Name field name'),
          help: translateMethod('ldap.namefields.help'),
          visible: ({ rawValues }) => rawValues.authProvider === 'LDAP',
          deps: ['authProvider']
        },
        emailField: {
          type: type.string,
          label: translateMethod('Email field name'),
          visible: ({ rawValues }) => rawValues.authProvider === 'LDAP',
          deps: ['authProvider']
        },
        // testing: {
        //   type: CheckingAdminConnection,
        //   props: {
        //     label: translateMethod('Testing connection'),
        //     checkConnection: () => checkConnection(),
        //   },
        // },
        // testingWithUser: {
        //   type: CheckingUserConnection,
        //   props: {
        //     label: translateMethod('Testing user'),
        //     checkConnection: (username, password) => checkConnection({ username, password }),
        //   },
        // },
      }
    }
  }
  const OAuth2Schema: Schema = {
    authProviderSettings: {
      type: type.object,
      format: format.form,
      label: translateMethod('Settings'),
      schema: {
        sessionMaxAge: {
          type: type.number,
          label: translateMethod('Session max. age (s)'),
          defaultValue: 86400
        },
        // oidcProvider: {
        //   type: () => (
        //     <div className="mb-3 row">
        //       <label className="col-xs-12 col-sm-2 col-form-label" />
        //       <div className="col-sm-10">
        //         <button type="button" className="btn btn-success" onClick={fetchConfig}>
        //           <Translation i18nkey="Get from OIDC config 2">Get from OIDC config 2</Translation>
        //         </button>
        //       </div>
        //     </div>
        //   ),
        // },
        useJson: {
          type: type.bool,
            label: translateMethod('Use JSON payloads'),
        },
        readProfileFromToken: {
          type: type.bool,
            label: translateMethod('Read profile from JWT token'),
        },
        scope: {
          type: type.string,
            label: translateMethod('Token scope'),
        },
        clientId: {
          type: type.string,
            label: translateMethod('Client Id'),
        },
        clientSecret: {
          type: type.string,
            label: translateMethod('Client secret'),
        },
        authorizeUrl: {
          type: type.string,
            label: translateMethod('Authorize URL'),
        },
        tokenUrl: {
          type: type.string,
            label: translateMethod('Token URL'),
        },
        userInfoUrl: {
          type: type.string,
            label: translateMethod('Userinfo URL'),
        },
        loginUrl: {
          type: type.string,
          props: {
            label: translateMethod('Login URL'),
          },
        },
        logoutUrl: {
          type: type.string,
            label: translateMethod('Logout URL'),
        },
        callbackUrl: {
          type: type.string,
            label: translateMethod('Callback URL'),
        },
        accessTokenField: {
          type: type.string,
            label: translateMethod('Access token field name'),
        },
        nameField: {
          type: type.string,
            label: translateMethod('Name field name'),
        },
        emailField: {
          type: type.string,
            label: translateMethod('Email field name'),
        },
        pictureField: {
          type: type.string,
            label: translateMethod('Picture field name'),
        },
        daikokuAdmins: {
          type: type.string,
          array:true,
            label: translateMethod('Email of Daikoku Admins'),
        },
        jwtVerifier: {
          type: type.object,
          //todo: add algo setting if jwt is enabled
        },
      }
    }
  }

  const schema: Schema = {
    authProvider: {
      type: type.string,
      format: format.buttonsSelect,
      label: translateMethod('Authentication type'),
      options: [
        { label: 'Local', value: 'Local' },
        { label: 'LDAP', value: 'LDAP' },
        { label: 'OAuth2', value: 'OAuth2' },
        { label: 'Otoroshi', value: 'Otoroshi' },
      ],
    },
  }


  if (isLoading) {
    return (
      <Spinner />
    )
  }

  return (
    <Form
      schema={schema}
      onSubmit={console.debug} //todo: clean kafka & elastic before save => null value if empty entries
      value={data}
    />
  )
}