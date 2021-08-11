import React, { Component } from 'react';
import { SelectInput, TextInput, TextareaInput, ObjectInput, NumberInput } from '../../../inputs';
import { Spinner } from '../../../utils';

import set from 'set-value';
import { t, Translation } from '../../../../locales';

const LazyForm = React.lazy(() => import('../../../inputs/Form'));

export class AlgoSettings extends Component {
  state = {
    error: null,
  };

  componentDidCatch(error) {
    const algo = this.props.algo;
    const path = this.props.path;
    console.log('AlgoSettings did catch', error, path, algo);
    this.setState({ error });
  }

  render() {
    if (!this.props.rawValue.readProfileFromToken) {
      return null;
    }
    const algo = this.props.algo || this.props.value;
    const path = this.props.path || '';
    const changeTheValue = (path, value) => {
      if (path === '') {
        this.props.onChange(value);
      } else {
        const newValue = { ...this.props.value };
        set(newValue, name, value);
        this.props.onChange(newValue);
      }
    };
    if (this.state.error) {
      return <span>{this.state.error.message ? this.state.error.message : this.state.error}</span>;
    }
    return (
      <div>
        <SelectInput
          label={this.props.algoTitle || t('Algo.', this.props.currentLanguage)}
          value={algo.type}
          onChange={(e) => {
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
            label={t('SHA Size', this.props.currentLanguage)}
            help={t(
              'sha.size.help',
              this.props.currentLanguage,
              'Word size for the SHA-2 hash function used'
            )}
            value={algo.size}
            onChange={(v) => changeTheValue(path + '.size', v)}
            possibleValues={[
              { label: '256', value: 256 },
              { label: '384', value: 384 },
              { label: '512', value: 512 },
            ]}
          />,
          <TextInput
            key="hmac-secret"
            label={t('Hmac secret', this.props.currentLanguage)}
            placeholder="secret"
            value={algo.secret}
            help={t('hmac.secet.help', this.props.currentLanguage, 'The Hmac secret')}
            onChange={(e) => changeTheValue(path + '.secret', e)}
          />,
        ]}
        {algo.type === 'RSAlgoSettings' && [
          <SelectInput
            key="sha-size"
            label={t('SHA Size', this.props.currentLanguage)}
            help={t(
              'sha.size.help',
              this.props.currentLanguage,
              'Word size for the SHA-2 hash function used'
            )}
            value={algo.size}
            onChange={(v) => changeTheValue(path + '.size', v)}
            possibleValues={[
              { label: '256', value: 256 },
              { label: '384', value: 384 },
              { label: '512', value: 512 },
            ]}
          />,
          <TextareaInput
            key="public-key"
            label={t('Public key', this.props.currentLanguage)}
            value={algo.publicKey}
            help={t('The RSA public key', this.props.currentLanguage)}
            onChange={(e) => changeTheValue(path + '.publicKey', e)}
          />,
          <TextareaInput
            key="private-key"
            label={t('Private key', this.props.currentLanguage)}
            value={algo.privateKey}
            help={t(
              'private.key.help',
              this.props.currentLanguage,
              'The RSA private key, private key can be empty if not used for JWT token signing'
            )}
            onChange={(e) => changeTheValue(path + '.privateKey', e)}
          />,
        ]}
        {algo.type === 'ESAlgoSettings' && [
          <SelectInput
            key="sha-size"
            label={t('SHA Size', this.props.currentLanguage)}
            help={t(
              'sha.size.help',
              this.props.currentLanguage,
              'Word size for the SHA-2 hash function used'
            )}
            value={algo.size}
            onChange={(v) => changeTheValue(path + '.size', v)}
            possibleValues={[
              { label: '256', value: 256 },
              { label: '384', value: 384 },
              { label: '512', value: 512 },
            ]}
          />,
          <TextareaInput
            key="public-key"
            label={t('Public key', this.props.currentLanguage)}
            value={algo.publicKey}
            help={t('The ECDSA public key', this.props.currentLanguage)}
            onChange={(e) => changeTheValue(path + '.publicKey', e)}
          />,
          <TextareaInput
            key="private-key"
            label={t('Private key', this.props.currentLanguage)}
            value={algo.privateKey}
            help={t(
              'ecdsa.private.key.help',
              this.props.currentLanguage,
              'The ECDSA private key, private key can be empty if not used for JWT token signing'
            )}
            onChange={(e) => changeTheValue(path + '.privateKey', e)}
          />,
        ]}
        {algo.type === 'JWKSAlgoSettings' && [
          <TextInput
            key="url"
            label={t('URL', this.props.currentLanguage)}
            value={algo.url}
            help={t('The JWK Set url', this.props.currentLanguage)}
            onChange={(e) => changeTheValue(path + '.url', e)}
          />,
          <NumberInput
            key="http-call-timeout"
            label={t('HTTP call timeout', this.props.currentLanguage)}
            suffix={t('millis.', this.props.currentLanguage)}
            value={algo.timeout}
            help={t('Timeout for fetching the keyset', this.props.currentLanguage)}
            onChange={(e) => changeTheValue(path + '.timeout', e)}
          />,
          <NumberInput
            key="ttl"
            label={t('TTL', this.props.currentLanguage)}
            suffix={t('millis.', this.props.currentLanguage)}
            value={algo.ttl}
            help={t('Cache TTL for the keyset', this.props.currentLanguage)}
            onChange={(e) => changeTheValue(path + '.ttl', e)}
          />,
          <ObjectInput
            key="http-header"
            label={t('HTTP Headers', this.props.currentLanguage)}
            value={algo.headers}
            help={t('The HTTP headers passed', this.props.currentLanguage)}
            onChange={(e) => changeTheValue(path + '.headers', e)}
          />,
          <SelectInput
            key="key-type"
            label={t('Key type', this.props.currentLanguage)}
            help={t('Type of key', this.props.currentLanguage)}
            value={algo.kty}
            onChange={(v) => changeTheValue(path + '.kty', v)}
            possibleValues={[
              { label: 'RSA', value: 'RSA' },
              { label: 'EC', value: 'EC' },
            ]}
          />,
        ]}
      </div>
    );
  }
}

export class OAuth2Config extends Component {
  fetchConfig = () => {
    window.prompt(t('URL of the OIDC config', this.props.currentLanguage)).then((url) => {
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
            id: this.props.value.id,
            name: this.props.value.name,
            desc: this.props.value.desc,
          }),
        })
          .then((r) => r.json())
          .then((config) => {
            this.props.onChange(config);
          });
      }
    });
  };

  static defaultConfig = {
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

  formFlow = [
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

  formSchema = {
    sessionMaxAge: {
      type: 'number',
      props: {
        suffix: t('Second', this.props.currentLanguage),
        label: t('Session max. age', this.props.currentLanguage),
      },
    },
    oidcProvider: {
      type: () => (
        <div className="form-group row">
          <label className="col-xs-12 col-sm-2 col-form-label" />
          <div className="col-sm-10">
            <button type="button" className="btn btn-success" onClick={this.fetchConfig}>
              <Translation i18nkey="Get from OIDC config 2">
                Get from OIDC config 2
              </Translation>
            </button>
          </div>
        </div>
      ),
    },
    useJson: {
      type: 'bool',
      props: {
        label: t('Use JSON payloads', this.props.currentLanguage),
      },
    },
    readProfileFromToken: {
      type: 'bool',
      props: {
        label: t('Read profile from JWT token', this.props.currentLanguage),
      },
    },
    scope: {
      type: 'string',
      props: {
        label: t('Token scope', this.props.currentLanguage),
      },
    },
    clientId: {
      type: 'string',
      props: {
        label: t('Client Id', this.props.currentLanguage),
      },
    },
    clientSecret: {
      type: 'string',
      props: {
        label: t('Client secret', this.props.currentLanguage),
      },
    },
    authorizeUrl: {
      type: 'string',
      props: {
        label: t('Authorize URL', this.props.currentLanguage),
      },
    },
    tokenUrl: {
      type: 'string',
      props: {
        label: t('Token URL', this.props.currentLanguage),
      },
    },
    userInfoUrl: {
      type: 'string',
      props: {
        label: t('Userinfo URL', this.props.currentLanguage),
      },
    },
    loginUrl: {
      type: 'string',
      props: {
        label: t('Login URL', this.props.currentLanguage),
      },
    },
    logoutUrl: {
      type: 'string',
      props: {
        label: t('Logout URL', this.props.currentLanguage),
      },
    },
    callbackUrl: {
      type: 'string',
      props: {
        label: t('Callback URL', this.props.currentLanguage),
      },
    },
    accessTokenField: {
      type: 'string',
      props: {
        label: t('Access token field name', this.props.currentLanguage),
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
    pictureField: {
      type: 'string',
      props: {
        label: t('Picture field name', this.props.currentLanguage),
      },
    },
    daikokuAdmins: {
      type: 'array',
      props: {
        label: t('Email of Daikoku Admins', this.props.currentLanguage),
      },
    },
    jwtVerifier: {
      type: AlgoSettings,
      props: {
        currentLanguage: this.props.currentLanguage,
      },
    },
  };

  componentDidMount() {
    if (this.props.rawValue.authProvider === 'OAuth2') {
      this.props.onChange({ ...OAuth2Config.defaultConfig, ...this.props.value });
    }
  }

  render() {
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          value={this.props.value}
          onChange={(e) => {
            this.props.onChange(e);
          }}
          flow={this.formFlow}
          schema={this.formSchema}
          style={{ marginTop: 50 }}
        />
      </React.Suspense>
    );
  }
}
