import React, { Component, useContext, useEffect } from 'react';
import { Spinner } from '../../../utils';

import set from 'set-value';
import { I18nContext } from '../../../../core';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export function AlgoSettings(props: any) {
  const { translateMethod } = useContext(I18nContext);

  if (!props.rawValue.readProfileFromToken) {
    return null;
  }

  const algo = props.algo || props.value;
  const path = props.path || '';

  const changeTheValue = (path: any, value: any) => {
    if (path === '') {
      props.onChange(value);
    } else {
      const newValue = { ...props.value };
      set(newValue, name, value);
      props.onChange(newValue);
    }
  };

  return (
    <div>
      <SelectInput
        label={props.algoTitle || translateMethod('Algo.')}
        value={algo.type}
        onChange={(e: any) => {
          switch (e) {
            case 'HSAlgoSettings':
              changeTheValue(path + '', {
                type: 'HSAlgoSettings',
                size: 512,
                secret: 'secret',
              });
              break;
            case 'RSAlgoSettings':
              changeTheValue(path + '', {
                type: 'RSAlgoSettings',
                size: 512,
                publicKey: '-----BEGIN PUBLIC KEY-----\nxxxxxxxx\n-----END PUBLIC KEY-----',
                privateKey: '-----BEGIN PRIVATE KEY-----\nxxxxxxxx\n-----END PRIVATE KEY-----',
              });
              break;
            case 'ESAlgoSettings':
              changeTheValue(path + '', {
                type: 'ESAlgoSettings',
                size: 512,
                publicKey: '-----BEGIN PUBLIC KEY-----\nxxxxxxxx\n-----END PUBLIC KEY-----',
                privateKey: '-----BEGIN PRIVATE KEY-----\nxxxxxxxx\n-----END PRIVATE KEY-----',
              });
              break;
            case 'JWKSAlgoSettings':
              changeTheValue(path + '', {
                type: 'JWKSAlgoSettings',
                url: 'https://jwk.foo.bar/.well-known/jwks.json',
                headers: {},
                timeout: 2000,
                ttl: 5 * 60 * 60 * 1000,
                kty: 'RSA',
              });
              break;
          }
          // changeTheValue(path + '', e)
        }}
        possibleValues={[
          { label: 'Hmac + SHA', value: 'HSAlgoSettings' },
          { label: 'RSASSA-PKCS1 + SHA', value: 'RSAlgoSettings' },
          { label: 'ECDSA + SHA', value: 'ESAlgoSettings' },
          { label: 'JWK Set', value: 'JWKSAlgoSettings' },
        ]}
        help="What kind of algorithm you want to use to verify/sign your JWT token with"
      />
      {algo.type === 'HSAlgoSettings' && [
        <SelectInput
          key="sha-size"
          label={translateMethod('SHA Size')}
          help={translateMethod('sha.size.help')}
          value={algo.size}
          onChange={(v: any) => changeTheValue(path + '.size', v)}
          possibleValues={[
            { label: '256', value: 256 },
            { label: '384', value: 384 },
            { label: '512', value: 512 },
          ]}
        />,
        <TextInput
          key="hmac-secret"
          label={translateMethod('Hmac secret')}
          placeholder="secret"
          value={algo.secret}
          help={translateMethod('hmac.secet.help', 'The Hmac secret')}
          onChange={(e: any) => changeTheValue(path + '.secret', e)}
        />,
      ]}
      {algo.type === 'RSAlgoSettings' && [
        <SelectInput
          key="sha-size"
          label={translateMethod('SHA Size')}
          help={translateMethod('sha.size.help')}
          value={algo.size}
          onChange={(v: any) => changeTheValue(path + '.size', v)}
          possibleValues={[
            { label: '256', value: 256 },
            { label: '384', value: 384 },
            { label: '512', value: 512 },
          ]}
        />,
        <TextareaInput
          key="public-key"
          label={translateMethod('Public key')}
          value={algo.publicKey}
          help={translateMethod('The RSA public key')}
          onChange={(e: any) => changeTheValue(path + '.publicKey', e)}
        />,
        <TextareaInput
          key="private-key"
          label={translateMethod('Private key')}
          value={algo.privateKey}
          help={translateMethod('private.key.help')}
          onChange={(e: any) => changeTheValue(path + '.privateKey', e)}
        />,
      ]}
      {algo.type === 'ESAlgoSettings' && [
        <SelectInput
          key="sha-size"
          label={translateMethod('SHA Size')}
          help={translateMethod('sha.size.help')}
          value={algo.size}
          onChange={(v: any) => changeTheValue(path + '.size', v)}
          possibleValues={[
            { label: '256', value: 256 },
            { label: '384', value: 384 },
            { label: '512', value: 512 },
          ]}
        />,
        <TextareaInput
          key="public-key"
          label={translateMethod('Public key')}
          value={algo.publicKey}
          help={translateMethod('The ECDSA public key')}
          onChange={(e: any) => changeTheValue(path + '.publicKey', e)}
        />,
        <TextareaInput
          key="private-key"
          label={translateMethod('Private key')}
          value={algo.privateKey}
          help={translateMethod('ecdsa.private.key.help')}
          onChange={(e: any) => changeTheValue(path + '.privateKey', e)}
        />,
      ]}
      {algo.type === 'JWKSAlgoSettings' && [
        <TextInput
          key="url"
          label={translateMethod('URL')}
          value={algo.url}
          help={translateMethod('The JWK Set url')}
          onChange={(e: any) => changeTheValue(path + '.url', e)}
        />,
        <NumberInput
          key="http-call-timeout"
          label={translateMethod('HTTP call timeout')}
          suffix={translateMethod('millis.')}
          value={algo.timeout}
          help={translateMethod('Timeout for fetching the keyset')}
          onChange={(e: any) => changeTheValue(path + '.timeout', e)}
        />,
        <NumberInput
          key="ttl"
          label={translateMethod('TTL')}
          suffix={translateMethod('millis.')}
          value={algo.ttl}
          help={translateMethod('Cache TTL for the keyset')}
          onChange={(e: any) => changeTheValue(path + '.ttl', e)}
        />,
        <ObjectInput
          key="http-header"
          label={translateMethod('HTTP Headers')}
          value={algo.headers}
          help={translateMethod('The HTTP headers passed')}
          onChange={(e: any) => changeTheValue(path + '.headers', e)}
        />,
        <SelectInput
          key="key-type"
          label={translateMethod('Key type')}
          help={translateMethod('Type of key')}
          value={algo.kty}
          onChange={(v: any) => changeTheValue(path + '.kty', v)}
          possibleValues={[
            { label: 'RSA', value: 'RSA' },
            { label: 'EC', value: 'EC' },
          ]}
        />,
      ]}
    </div>
  );
}

const defaultConfig = {
  sessionMaxAge: 86400,
  clientId: 'client',
  clientSecret: 'secret',
  authorizeUrl: 'https://<oauth-domain>/authorize',
  tokenUrl: 'http://<oauth-domain>/oauth/token',
  userInfoUrl: 'http://<oauth-domain>/userinfo',
  loginUrl: 'http://<oauth-domain>/authorize',
  logoutUrl: 'http://daikoku.foo.bar:8080/v2/logout?returnTo=${redirect}',
  callbackUrl: 'http://daikoku.foo.bar:8080/auth/oauth2/callback',
  accessTokenField: 'id_token',
  scope: 'openid profile email name',
  useJson: false,
  readProfileFromToken: false,
  jwtVerifier: {
    type: 'HSAlgoSettings',
    size: 512,
    secret: 'secret',
  },
  nameField: 'name',
  emailField: 'email',
  pictureField: 'picture',
  otoroshiDataField: 'app_metadata | otoroshi_data',
  daikokuAdmins: [],
};

export function OAuth2Config(props: any) {
  const { translateMethod, Translation } = useContext(I18nContext);

  const fetchConfig = () => {
    (window.prompt(translateMethod('URL of the OIDC config')) as any).then((url: any) => {
      if (url) {
        return fetch('/api/oidc/_fetchConfig', {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            id: props.value.id,
            name: props.value.name,
            desc: props.value.desc,
          }),
        })
          .then((r) => r.json())
          .then((config) => {
            props.onChange(config);
          });
      }
    });
  };

  const formFlow = [
    'sessionMaxAge',
    'oidcProvider',
    'useJson',
    'readProfileFromToken',
    'clientId',
    'clientSecret',
    'authorizeUrl',
    'tokenUrl',
    'userInfoUrl',
    'loginUrl',
    'logoutUrl',
    'callbackUrl',
    'scope',
    'accessTokenField',
    'nameField',
    'emailField',
    'pictureField',
    'daikokuAdmins',
    'jwtVerifier',
  ];

  const formSchema = {
    sessionMaxAge: {
      type: 'number',
      props: {
        suffix: translateMethod('Second'),
        label: translateMethod('Session max. age'),
      },
    },
    oidcProvider: {
      type: () => (
        <div className="mb-3 row">
          <label className="col-xs-12 col-sm-2 col-form-label" />
          <div className="col-sm-10">
            <button type="button" className="btn btn-success" onClick={fetchConfig}>
              <Translation i18nkey="Get from OIDC config 2">Get from OIDC config 2</Translation>
            </button>
          </div>
        </div>
      ),
    },
    useJson: {
      type: 'bool',
      props: {
        label: translateMethod('Use JSON payloads'),
      },
    },
    readProfileFromToken: {
      type: 'bool',
      props: {
        label: translateMethod('Read profile from JWT token'),
      },
    },
    scope: {
      type: 'string',
      props: {
        label: translateMethod('Token scope'),
      },
    },
    clientId: {
      type: 'string',
      props: {
        label: translateMethod('Client Id'),
      },
    },
    clientSecret: {
      type: 'string',
      props: {
        label: translateMethod('Client secret'),
      },
    },
    authorizeUrl: {
      type: 'string',
      props: {
        label: translateMethod('Authorize URL'),
      },
    },
    tokenUrl: {
      type: 'string',
      props: {
        label: translateMethod('Token URL'),
      },
    },
    userInfoUrl: {
      type: 'string',
      props: {
        label: translateMethod('Userinfo URL'),
      },
    },
    loginUrl: {
      type: 'string',
      props: {
        label: translateMethod('Login URL'),
      },
    },
    logoutUrl: {
      type: 'string',
      props: {
        label: translateMethod('Logout URL'),
      },
    },
    callbackUrl: {
      type: 'string',
      props: {
        label: translateMethod('Callback URL'),
      },
    },
    accessTokenField: {
      type: 'string',
      props: {
        label: translateMethod('Access token field name'),
      },
    },
    nameField: {
      type: 'string',
      props: {
        label: translateMethod('Name field name'),
      },
    },
    emailField: {
      type: 'string',
      props: {
        label: translateMethod('Email field name'),
      },
    },
    pictureField: {
      type: 'string',
      props: {
        label: translateMethod('Picture field name'),
      },
    },
    daikokuAdmins: {
      type: 'array',
      props: {
        label: translateMethod('Email of Daikoku Admins'),
      },
    },
    jwtVerifier: {
      type: AlgoSettings,
    },
  };

  useEffect(() => {
    if (props.rawValue.authProvider === 'OAuth2') {
      props.onChange({ ...defaultConfig, ...props.value });
    }
  }, []);

  return (
    <React.Suspense fallback={<Spinner />}>
      <LazyForm
        value={props.value}
        onChange={(e) => {
          props.onChange(e);
        }}
        flow={formFlow}
        schema={formSchema}
        style={{ marginTop: 50 }}
      />
    </React.Suspense>
  );
}
