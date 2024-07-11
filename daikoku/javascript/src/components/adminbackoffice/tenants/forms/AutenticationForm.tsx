import { constraints, format, Schema, type } from '@maif/react-forms';
import { useContext } from 'react';
import { UseMutationResult } from '@tanstack/react-query';


import { I18nContext } from '../../../../contexts';
import { ITenantFull } from '../../../../types';
import { FormWithChoice } from '../../../utils/FormWithChoice';

export const AuthenticationForm = (props: { tenant: ITenantFull, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
  const { translate } = useContext(I18nContext)

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
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]

    },
    claimSecret: {
      type: type.string,
      label: translate('Claim Secret'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
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
      defaultValue: 2000,
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
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
      label: translate('Daikoku admin filter'),
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
    //         <button type="button" className="btn btn-outline-success" onClick={fetchConfig}>
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
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    },
    clientId: {
      type: type.string,
      label: translate('Client Id'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    },
    clientSecret: {
      type: type.string,
      label: translate('Client secret'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    },
    authorizeUrl: {
      type: type.string,
      label: translate('Authorize URL'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    },
    tokenUrl: {
      type: type.string,
      label: translate('Token URL'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    },
    userInfoUrl: {
      type: type.string,
      label: translate('Userinfo URL'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    },
    loginUrl: {
      type: type.string,
      props: {
        label: translate('Login URL'),
        constraints: [
          constraints.required(translate("constraints.required.value"))
        ]
      },
    },
    logoutUrl: {
      type: type.string,
      label: translate('Logout URL'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    },
    callbackUrl: {
      type: type.string,
      label: translate('Callback URL'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    },
    accessTokenField: {
      type: type.string,
      label: translate('Access token field name'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    },
    nameField: {
      type: type.string,
      label: translate('Name field name'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    },
    emailField: {
      type: type.string,
      label: translate('Email field name'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    },
    pictureField: {
      type: type.string,
      label: translate('Picture field name'),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    },
    daikokuAdmins: {
      type: type.string,
      array: true,
      label: translate('Email of Daikoku Admins'),
    },
    jwtVerifier: {
      label: translate("jwt verifier"),
      type: type.object,
      format: format.form,
      optional: true,
      schema: {
        type: {
          type: type.string,
          label: translate('Type'),
          format: format.buttonsSelect,
          options: ['HSAlgoSettings', 'RSAlgoSettings', 'JWKSAlgoSettings'],
          // defaultValue: 'RSAlgoSettings'
        },
        shaSize: {
          type: type.number,
          label: translate('authentication.form.jwtverifier.sha.size.label'),
          format: format.buttonsSelect,
          options: [256, 384, 512],
          // defaultValue: 512,
          visible: (props => props.rawValues.jwtVerifier.type === 'HSAlgoSettings' || props.rawValues.jwtVerifier.type === 'RSAlgoSettings'),
        },
        hmacSecret: {
          type: type.string,
          label: translate('authentication.form.jwtverifier.hmacsecret.label'),
          visible: (props => props.rawValues.jwtVerifier.type === 'HSAlgoSettings'),
        },
        base64: {
          type: type.bool,
          label: translate('authentication.form.jwtverifier.base64.label'),
          visible: (props => props.rawValues.jwtVerifier.type === 'HSAlgoSettings'),
        },
        publicKey: {
          type: type.string,
          format: format.text,
          label: translate('authentication.form.jwtverifier.public.key.label'),
          placeholder: `-----BEGIN PUBLIC KEY----- 
          xxxxxxxx 
          -----END PUBLIC KEY-----`,
          visible: (props => props.rawValues.jwtVerifier.type === 'RSAlgoSettings'),
        },
        privateKey: {
          type: type.string,
          format: format.text,
          label: translate('authentication.form.jwtverifier.private.key.label'),
          placeholder: `-----BEGIN PRIVATE KEY----- 
          xxxxxxxx 
          -----END PRIVATE KEY-----`,
          visible: (props => props.rawValues.jwtVerifier.type === 'RSAlgoSettings'),
        },
        url: {
          type: type.string,
          label: translate('URL'),
          visible: (props => props.rawValues.jwtVerifier.type === 'JWKSAlgoSettings'),
        },
        headers: {
          type: type.object,
          label: translate('Headers'),
          visible: (props => props.rawValues.jwtVerifier.type === 'JWKSAlgoSettings'),
        },
        timeout: {
          type: type.number,
          label: translate('HTTP call timeout'),
          visible: (props => props.rawValues.jwtVerifier.type === 'JWKSAlgoSettings'),
        },
        ttl: {
          type: type.number,
          label: translate('TTL'),
          visible: (props => props.rawValues.jwtVerifier.type === 'JWKSAlgoSettings'),
        },
        kty: {
          type: type.string,
          label: translate('Key type'),
          format: format.buttonsSelect,
          options: ['RSA', 'EC'],
          visible: (props => props.rawValues.jwtVerifier.type === 'JWKSAlgoSettings'),
        }
      }
    },
  }

  return (
    <FormWithChoice
      defaultSelector="Local"
      selectorName="authProvider"
      schemas={[
        { key: "Local", schema: localSchema },
        { key: "Otoroshi", schema: otoroshiSchema },
        { key: "LDAP", schema: ldapSchema },
        { key: "OAuth2", schema: OAuth2Schema },
      ]}
      onsubmit={authProviderSettings => {
        props.updateTenant.mutateAsync({ ...props.tenant, authProviderSettings, authProvider: authProviderSettings.authProvider })
      }}
      value={{ ...props.tenant.authProviderSettings, authProvider: props.tenant.authProvider }}
    />
  )
}