import { useContext } from 'react';
import { constraints, format, Schema, type } from '@maif/react-forms';
import { UseMutationResult, useQuery } from '@tanstack/react-query';

import * as Services from '../../../../services';

import { I18nContext } from '../../../../core';
import { ITenant, ITenantFull } from '../../../../types';
import { MultiStepForm, Spinner } from '../../../utils';

export const AuthenticationForm = (props: { tenant: ITenant, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translateMethod } = useContext(I18nContext)
  const { isLoading, data } = useQuery(['tenant'], () => Services.oneTenant(props.tenant._id))

  const authProviderSettingsShema = (data: ITenantFull, subschema: Schema) => {
    return {
      authProviderSettings: {
        type: type.object,
        format: format.form,
        label: data.authProvider,
        schema: {
          ...subschema
        }
      }
    }
  }

  const localSchema: Schema = {
    sessionMaxAge: {
      type: type.number,
      label: translateMethod('Session max. age (s)'),
      defaultValue: 86400
    },
  }

  const otoroshiSchema: Schema = {
    sessionMaxAge: {
      type: type.number,
      label: translateMethod('Session max. age (s)'),
      defaultValue: 86400
    },
    claimHeaderName: {
      type: type.string,
      label: translateMethod('Claim header name'),

    },
    claimSecret: {
      type: type.string,
      label: translateMethod('Claim Secret'),
    },

  }
  const ldapSchema: Schema = {
    sessionMaxAge: {
      type: type.number,
      label: translateMethod('Session max. age (s)'),
      defaultValue: 86400
    },
    serverUrls: {
      type: type.string,
      array: true,
      label: translateMethod('LDAP Server URLs', true),
    },
    connectTimeout: {
      type: type.number,
      label: translateMethod('Connect timeout (s)'),
    },
    searchBase: {
      type: type.string,
      label: translateMethod('Search Base'),
    },
    userBase: {
      type: type.string,
      label: translateMethod('Users search base'),
    },
    groupFilter: {
      type: type.string,
      label: translateMethod('Simple user filter'),
    },
    adminGroupFilter: {
      type: type.string,
      label: translateMethod('Tenants admin filter'),
    },
    searchFilter: {
      type: type.string,
      label: translateMethod('Search filter'),
    },
    adminUsername: {
      type: type.string,
      label: translateMethod('Admin username (bind DN)'),
    },
    adminPassword: {
      type: type.string,
      label: translateMethod('Admin password'),
    },
    nameFields: {
      type: type.string,
      array: true,
      label: translateMethod('Name field name'),
      help: translateMethod('ldap.namefields.help'),
    },
    emailField: {
      type: type.string,
      label: translateMethod('Email field name'),
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
  const OAuth2Schema: Schema = {
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
      array: true,
      label: translateMethod('Email of Daikoku Admins'),
    },
    jwtVerifier: {
      type: type.object,
      //todo: add algo setting if jwt is enabled
    },
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

  const steps = [
    {
      id: 'authProvider',
      label: translateMethod('Authentication type'),
      schema: {
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
          constraints: [
            constraints.required()
          ]
        }
      }
    },
    {
      id: 'params',
      label: 'config',
      schema: (data) => {
        switch (data.authProvider) {
          case 'Local':
            return authProviderSettingsShema(data, localSchema);
          case 'LDAP':
            return authProviderSettingsShema(data, ldapSchema);
          case 'OAuth2':
            return authProviderSettingsShema(data, OAuth2Schema);
          case 'Otoroshi':
            return authProviderSettingsShema(data, otoroshiSchema);
        }
      }
    }
  ]

  if (isLoading) {
    return (
      <Spinner />
    )
  }

  return (
    <MultiStepForm
      value={data}
      steps={steps}
      initial={data?.authProvider ? "params" : "authProvider"}
      creation={false}
      save={(d) => props.updateTenant.mutateAsync(d)}
      labels={{
        previous: translateMethod('Previous'),
        skip: translateMethod('Skip'),
        next: translateMethod('Next'),
        save: translateMethod('Save'),
      }} />
  )
}