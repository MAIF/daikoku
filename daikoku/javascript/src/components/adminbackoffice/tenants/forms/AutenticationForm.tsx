import { constraints, format, Schema, type } from '@maif/react-forms';
import { useContext } from 'react';
import { UseMutationResult } from '@tanstack/react-query';


import { I18nContext } from '../../../../contexts';
import { ITenantFull } from '../../../../types';
import { IMultistepsformStep, MultiStepForm } from '../../../utils';

export const AuthenticationForm = (props: { tenant?: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translate } = useContext(I18nContext)

  const authProviderSettingsShema = (subschema: Schema, data?: ITenantFull, ) => {
    return {
      authProviderSettings: {
        type: type.object,
        format: format.form,
        label: data?.authProvider,
        schema: {
          ...subschema
        }
      }
    }
  }

  const localSchema: Schema = {
    sessionMaxAge: {
      type: type.number,
      label: translate('Session max. age (s)'),
      defaultValue: 86400
    },
  }

  const otoroshiSchema: Schema = {
    sessionMaxAge: {
      type: type.number,
      label: translate('Session max. age (s)'),
      defaultValue: 86400
    },
    claimHeaderName: {
      type: type.string,
      label: translate('Claim header name'),

    },
    claimSecret: {
      type: type.string,
      label: translate('Claim Secret'),
    },

  }
  const ldapSchema: Schema = {
    sessionMaxAge: {
      type: type.number,
      label: translate('Session max. age (s)'),
      defaultValue: 86400
    },
    serverUrls: {
      type: type.string,
      array: true,
      label: translate('LDAP Server URLs'),
    },
    connectTimeout: {
      type: type.number,
      label: translate('Connect timeout (s)'),
    },
    searchBase: {
      type: type.string,
      label: translate('Search Base'),
    },
    userBase: {
      type: type.string,
      label: translate('Users search base'),
    },
    groupFilter: {
      type: type.string,
      label: translate('Simple user filter'),
    },
    adminGroupFilter: {
      type: type.string,
      label: translate('Tenants admin filter'),
    },
    searchFilter: {
      type: type.string,
      label: translate('Search filter'),
    },
    adminUsername: {
      type: type.string,
      label: translate('Admin username (bind DN)'),
    },
    adminPassword: {
      type: type.string,
      label: translate('Admin password'),
    },
    nameFields: {
      type: type.string,
      array: true,
      label: translate('Name field name'),
      help: translate('ldap.namefields.help'),
    },
    emailField: {
      type: type.string,
      label: translate('Email field name'),
    },
    // testing: {
    //   type: CheckingAdminConnection,
    //   props: {
    //     label: translate('Testing connection'),
    //     checkConnection: () => checkConnection(),
    //   },
    // },
    // testingWithUser: {
    //   type: CheckingUserConnection,
    //   props: {
    //     label: translate('Testing user'),
    //     checkConnection: (username, password) => checkConnection({ username, password }),
    //   },
    // },

  }
  const OAuth2Schema: Schema = {
    sessionMaxAge: {
      type: type.number,
      label: translate('Session max. age (s)'),
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
      label: translate('Use JSON payloads'),
    },
    readProfileFromToken: {
      type: type.bool,
      label: translate('Read profile from JWT token'),
    },
    scope: {
      type: type.string,
      label: translate('Token scope'),
    },
    clientId: {
      type: type.string,
      label: translate('Client Id'),
    },
    clientSecret: {
      type: type.string,
      label: translate('Client secret'),
    },
    authorizeUrl: {
      type: type.string,
      label: translate('Authorize URL'),
    },
    tokenUrl: {
      type: type.string,
      label: translate('Token URL'),
    },
    userInfoUrl: {
      type: type.string,
      label: translate('Userinfo URL'),
    },
    loginUrl: {
      type: type.string,
      props: {
        label: translate('Login URL'),
      },
    },
    logoutUrl: {
      type: type.string,
      label: translate('Logout URL'),
    },
    callbackUrl: {
      type: type.string,
      label: translate('Callback URL'),
    },
    accessTokenField: {
      type: type.string,
      label: translate('Access token field name'),
    },
    nameField: {
      type: type.string,
      label: translate('Name field name'),
    },
    emailField: {
      type: type.string,
      label: translate('Email field name'),
    },
    pictureField: {
      type: type.string,
      label: translate('Picture field name'),
    },
    daikokuAdmins: {
      type: type.string,
      array: true,
      label: translate('Email of Daikoku Admins'),
    },
    jwtVerifier: {
      type: type.object,
      //todo: add algo setting if jwt is enabled
    },
  }

  const steps: Array<IMultistepsformStep<ITenantFull>> = [
    {
      id: 'authProvider',
      label: translate('Authentication type'),
      schema: {
        authProvider: {
          type: type.string,
          format: format.buttonsSelect,
          label: translate('Authentication type'),
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
        switch (data?.authProvider) {
          case 'LDAP':
            return authProviderSettingsShema(ldapSchema, data);
          case 'OAuth2':
            return authProviderSettingsShema(OAuth2Schema, data);
          case 'Otoroshi':
            return authProviderSettingsShema(otoroshiSchema, data);
          case 'Local':
            return authProviderSettingsShema(localSchema, data);
          default:
            return authProviderSettingsShema(localSchema);
        }
      }
    }
  ]

  return (
    <MultiStepForm
      value={props.tenant}
      steps={steps}
      initial={props.tenant?.authProvider ? "params" : "authProvider"}
      creation={false}
      save={(d) => props.updateTenant.mutateAsync(d)}
      labels={{
        previous: translate('Previous'),
        skip: translate('Skip'),
        next: translate('Next'),
        save: translate('Save'),
      }} />
  )
}