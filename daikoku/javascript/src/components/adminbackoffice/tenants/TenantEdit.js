import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { AssetChooserByModal, MimeTypeFilter } from '../../frontend';

import { UserBackOffice } from '../../backoffice';
import * as Services from '../../../services';

import { LDAPConfig, LocalConfig, OAuth2Config, OtoroshiConfig } from './auth';
import { ConsoleConfig, MailgunConfig, MailjetConfig } from './mailer';
import { Can, manage, tenant, Spinner } from '../../utils';
import { t, Translation, configuration } from '../../../locales';
import { BooleanInput } from '../../inputs/BooleanInput';
import { openSaveOrCancelModal } from '../../../core/modal/actions';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

class LazyFormInput extends Component {
  render() {
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm {...this.props} />
      </React.Suspense>
    );
  }
}

class AuthConfig extends Component {
  render() {
    if (this.props.rawValue.authProvider === 'Local') {
      return <LocalConfig {...this.props} />;
    } else if (this.props.rawValue.authProvider === 'Otoroshi') {
      return <OtoroshiConfig {...this.props} />;
    } else if (this.props.rawValue.authProvider === 'LDAP') {
      return <LDAPConfig {...this.props} />;
    } else if (this.props.rawValue.authProvider === 'OAuth2') {
      return <OAuth2Config {...this.props} />;
    } else {
      return (
        <span>
          <Translation i18nkey="Unsupported auth. type" language={this.props.currentLanguage}>
            Unsupported auth. type
          </Translation>{' '}
          ({this.props.rawValue.authProvider})
        </span>
      );
    }
  }
}

class MailerConfig extends Component {
  render() {
    if (
      this.props.rawValue.mailerSettings &&
      this.props.rawValue.mailerSettings.type === 'console'
    ) {
      return <ConsoleConfig {...this.props} />;
    } else if (
      this.props.rawValue.mailerSettings &&
      this.props.rawValue.mailerSettings.type === 'mailgun'
    ) {
      return <MailgunConfig {...this.props} />;
    } else if (
      this.props.rawValue.mailerSettings &&
      this.props.rawValue.mailerSettings.type === 'mailjet'
    ) {
      return <MailjetConfig {...this.props} />;
    } else {
      return null;
    }
  }
}

class StyleLogoAssetButton extends Component {
  render() {
    const tenant = this.props.tenant ? this.props.tenant() : { domain: window.location.origin };
    const domain = tenant.domain;
    const origin =
      window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
    return (
      <div className="form-group d-flex justify-content-end">
        <AssetChooserByModal
          typeFilter={MimeTypeFilter.image}
          onlyPreview
          tenantMode
          label={t('Set tenant logo from asset', this.props.currentLanguage)}
          currentLanguage={this.props.currentLanguage}
          onSelect={(asset) => this.props.changeValue('style.logo', origin + asset.link)}
        />
      </div>
    );
  }
}

class StyleJsUrlAssetButton extends Component {
  render() {
    const tenant = this.props.tenant ? this.props.tenant() : { domain: window.location.origin };
    const domain = tenant.domain;
    const origin =
      window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
    return (
      <div className="form-group d-flex justify-content-end">
        <AssetChooserByModal
          typeFilter={MimeTypeFilter.javascript}
          tenantMode
          label={t('Set js from asset', this.props.currentLanguage)}
          currentLanguage={this.props.currentLanguage}
          onSelect={(asset) => this.props.changeValue('style.jsUrl', origin + asset.link)}
        />
      </div>
    );
  }
}

class StyleCssUrlAssetButton extends Component {
  render() {
    const tenant = this.props.tenant ? this.props.tenant() : { domain: window.location.origin };
    const domain = tenant.domain;
    const origin =
      window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
    return (
      <div className="form-group d-flex justify-content-end">
        <AssetChooserByModal
          typeFilter={MimeTypeFilter.css}
          tenantMode
          label={t('Set css from asset', this.props.currentLanguage)}
          currentLanguage={this.props.currentLanguage}
          onSelect={(asset) => this.props.changeValue('style.cssUrl', origin + asset.link)}
        />
      </div>
    );
  }
}

class StyleFaviconUrlAssetButton extends Component {
  render() {
    const tenant = this.props.tenant ? this.props.tenant() : { domain: window.location.origin };
    const domain = tenant.domain;
    const origin =
      window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
    return (
      <div className="form-group d-flex justify-content-end">
        <AssetChooserByModal
          typeFilter={MimeTypeFilter.image}
          onlyPreview
          tenantMode
          label={t('Set favicon from asset', this.props.currentLanguage)}
          currentLanguage={this.props.currentLanguage}
          onSelect={(asset) => this.props.changeValue('style.faviconUrl', origin + asset.link)}
        />
      </div>
    );
  }
}
class StyleFontFamilyUrlAssetButton extends Component {
  render() {
    const tenant = this.props.tenant ? this.props.tenant() : { domain: window.location.origin };
    const domain = tenant.domain;
    const origin =
      window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
    return (
      <div className="form-group d-flex justify-content-end">
        <AssetChooserByModal
          typeFilter={MimeTypeFilter.font}
          tenantMode
          label={t('Set font family from asset', this.props.currentLanguage)}
          currentLanguage={this.props.currentLanguage}
          onSelect={(asset) => this.props.changeValue('style.fontFamilyUrl', origin + asset.link)}
        />
      </div>
    );
  }
}

class ThemeUpdatorFromUI extends Component {
  render() {
    return (
      <div className="form-group d-flex justify-content-end">
        <button
          type="button"
          className="btn btn-access-negative"
          onClick={() => {
            const RedirectToUI = () =>
              this.props.history.push(`/settings/tenants/${this.props.tenant()._id}/style`);
            if (this.props.isTenantUpdated()) {
              this.props.openModal({
                open: true,
                dontsave: () => RedirectToUI(),
                save: () => this.props.save().then(() => RedirectToUI()),
                title: t(
                  'unsaved.modifications.title',
                  this.props.currentLanguage,
                  false,
                  'Unsaved modifications'
                ),
                message: t(
                  'unsaved.modifications.message',
                  this.props.currentLanguage,
                  false,
                  'Your have unsaved modifications, do you want to save it before continue ?'
                ),
              });
            } else {
              RedirectToUI();
            }
          }}>
          <Translation i18nkey="Set Color Theme from UI" language={this.props.currentLanguage}>
            Set Color Theme from UI
          </Translation>
        </button>
      </div>
    );
  }
}

class HomePageVisibilitySwitch extends Component {
  render() {
    if (this.props.rawValue.isPrivate) {
      return null;
    }
    return (
      <BooleanInput
        key="style.homePageVisible"
        {...this.props}
        value={this.props.rawValue.style.homePageVisible}
        onChange={(v) => this.props.changeValue('style.homePageVisible', v)}
      />
    );
  }
}

export class TenantEditComponent extends Component {
  state = {
    tenant: null,
    create: false,
    updated: false,
  };

  flow = [
    '_id',
    'enabled',
    'name',
    'domain',
    'defaultLanguage',
    'contact',
    `>>> ${t('Tenant Style', this.props.currentLanguage)}`,
    'style.logo',
    'style.logoFromAssets',
    'style.title',
    'style.description',
    'style.js',
    'style.css',
    'style.colorTheme',
    'style.colorThemeFromUI',
    'style.jsUrl',
    'style.jsUrlFromAssets',
    'style.cssUrl',
    'style.cssUrlFromAssets',
    'style.faviconUrl',
    'style.faviconUrlFromAssets',
    'style.fontFamilyUrl',
    'style.fontFamilyUrlFromAssets',
    `>>> ${t('Security', this.props.currentLanguage)}`,
    'isPrivate',
    'authProvider',
    'authProviderSettings',
    'creationSecurity',
    'subscriptionSecurity',
    `>>> ${t('Audit trail (Elastic)', this.props.currentLanguage)}`,
    'auditTrailConfig.elasticConfigs',
    `>>> ${t('Audit trail (Webhooks)', this.props.currentLanguage)}`,
    'auditTrailConfig.auditWebhooks',
    `>>> ${t('Audit trail (Kafka)', this.props.currentLanguage)}`,
    'auditTrailConfig.kafkaConfig.servers',
    'auditTrailConfig.kafkaConfig.keyPass',
    'auditTrailConfig.kafkaConfig.keystore',
    'auditTrailConfig.kafkaConfig.truststore',
    'auditTrailConfig.kafkaConfig.auditTopic',
    `>>> ${t('Alerting', this.props.currentLanguage)}`,
    'auditTrailConfig.alertsEmails',
    `>>> ${t('Mailer', this.props.currentLanguage)}`,
    'mailerSettings.type',
    'mailerSettings',
    `>>> ${t('Bucket', this.props.currentLanguage)}`,
    'bucketSettings.bucket',
    'bucketSettings.endpoint',
    'bucketSettings.region',
    'bucketSettings.access',
    'bucketSettings.secret',
    'bucketSettings.chunkSize',
    'bucketSettings.v4auth',
    `>>> ${t('Footer', this.props.currentLanguage)}`,
    'style.footer',
    `>>> ${t('Unlogged home description', this.props.currentLanguage)}`,
    'style.homePageVisible',
    'style.unloggedHome',
  ];

  elasticConfigFormFlow = ['clusterUri', 'index', 'type', 'user', 'password'];

  elasticConfigFormSchema = {
    clusterUri: {
      type: 'string',
      props: {
        label: t('Cluster URI', this.props.currentLanguage),
        placeholder: t('Elastic cluster URI', this.props.currentLanguage),
      },
    },
    index: {
      type: 'string',
      props: {
        label: t('Index', this.props.currentLanguage),
        placeholder: t('Elastic index', this.props.currentLanguage),
      },
    },
    type: {
      type: 'string',
      props: {
        label: t('Type', this.props.currentLanguage),
        placeholder: t('Event type', this.props.currentLanguage),
      },
    },
    user: {
      type: 'string',
      props: {
        label: t('User', this.props.currentLanguage),
        placeholder: t('Elastic User (optional)', this.props.currentLanguage),
      },
    },
    password: {
      type: 'string',
      props: {
        label: t('Password', this.props.currentLanguage),
        placeholder: t('Elastic password (optional)', this.props.currentLanguage),
      },
    },
  };

  webhooksFormSchema = {
    url: {
      type: 'string',
      props: {
        label: t('Analytics webhook URL', this.props.currentLanguage),
        placeholder: t('URL of the webhook target', this.props.currentLanguage),
      },
    },
    headers: {
      type: 'object',
      props: {
        label: t('Webhook Headers', this.props.currentLanguage),
        placeholderKey: t('Header name', this.props.currentLanguage),
        placeholderValue: t('Header value', this.props.currentLanguage),
      },
    },
  };

  webhooksFormFlow = ['url', 'headers'];

  schema = {
    _id: {
      type: 'string',
      props: { label: t('Id', this.props.currentLanguage) },
    },
    enabled: {
      type: 'bool',
      props: { label: t('Enabled', this.props.currentLanguage) },
    },
    name: {
      type: 'string',
      props: { label: t('Name', this.props.currentLanguage) },
    },
    domain: {
      type: 'string',
      props: { label: t('Domain name', this.props.currentLanguage) },
    },
    defaultLanguage: {
      type: 'select',
      props: {
        label: t('Default  language', this.props.currentLanguage),
        possibleValues: Object.keys(configuration).map((key) => ({
          label: key,
          value: key,
        })),
      },
    },
    contact: {
      type: 'string',
      props: {
        label: t('Contact', this.props.currentLanguage),
      },
    },
    'style.title': {
      type: 'string',
      props: { label: t('Title', this.props.currentLanguage) },
    },
    'style.description': {
      type: 'string',
      props: { label: t('Description', this.props.currentLanguage) },
    },
    'style.unloggedHome': {
      type: 'markdown',
      props: {
        tenantMode: true,
        label: t('Unlogged description', this.props.currentLanguage),
      },
    },
    'style.homePageVisible': {
      type: HomePageVisibilitySwitch,
      props: {
        label: t('Enabled', this.props.currentLanguage),
      },
    },
    'style.logo': {
      type: 'string',
      props: { label: t('Logo', this.props.currentLanguage) },
    },
    'style.logoFromAssets': {
      type: StyleLogoAssetButton,
      props: {
        tenant: () => this.state.tenant,
        currentLanguage: this.props.currentLanguage,
        onChangeLogo: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.cssUrlFromAssets': {
      type: StyleCssUrlAssetButton,
      props: {
        tenant: () => this.state.tenant,
        currentLanguage: this.props.currentLanguage,
        onChangeLogo: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.jsUrlFromAssets': {
      type: StyleJsUrlAssetButton,
      props: {
        tenant: () => this.state.tenant,
        currentLanguage: this.props.currentLanguage,
        onChangeLogo: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.faviconUrlFromAssets': {
      type: StyleFaviconUrlAssetButton,
      props: {
        tenant: () => this.state.tenant,
        currentLanguage: this.props.currentLanguage,
        onChangeLogo: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.css': {
      type: 'text',
      props: { label: t('CSS', this.props.currentLanguage) },
    },
    'style.colorTheme': {
      type: 'text',
      props: { label: t('CSS color theme', this.props.currentLanguage) },
    },
    'style.colorThemeFromUI': {
      type: ThemeUpdatorFromUI,
      props: {
        tenant: () => this.state.tenant,
        save: () => this.save(),
        history: this.props.history,
        currentLanguage: this.props.currentLanguage,
        isTenantUpdated: () => !!this.state.updated,
        openModal: (props) => this.props.openSaveOrCancelModal({ ...props }),
      },
    },
    'style.js': {
      type: 'text',
      props: { label: t('Javascript', this.props.currentLanguage) },
    },
    'style.jsUrl': {
      type: 'string',
      props: { label: t('Js URL', this.props.currentLanguage) },
    },
    'style.cssUrl': {
      type: 'string',
      props: { label: t('CSS URL', this.props.currentLanguage) },
    },
    'style.faviconUrl': {
      type: 'string',
      props: { label: t('Favicon URL', this.props.currentLanguage) },
    },
    'style.fontFamilyUrl': {
      type: 'string',
      props: { label: t('Font family', this.props.currentLanguage) },
    },
    'style.fontFamilyUrlFromAssets': {
      type: StyleFontFamilyUrlAssetButton,
      props: {
        tenant: () => this.state.tenant,
        currentLanguage: this.props.currentLanguage,
        onChangeFont: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.footer': {
      type: 'markdown',
      props: { label: t('Footer', this.props.currentLanguage) },
    },
    isPrivate: {
      type: 'bool',
      props: {
        label: t('Private tenant', this.props.currentLanguage),
      },
    },
    authProvider: {
      type: 'select',
      props: {
        label: t('Authentication type', this.props.currentLanguage),
        possibleValues: [
          { label: 'Local', value: 'Local' },
          { label: 'LDAP', value: 'LDAP' },
          { label: 'OAuth2', value: 'OAuth2' },
          { label: 'Otoroshi', value: 'Otoroshi' },
        ],
      },
    },
    authProviderSettings: {
      type: AuthConfig,
      props: {
        currentLanguage: this.props.currentLanguage,
        label: t('Settings', this.props.currentLanguage),
      },
    },
    creationSecurity: {
      type: 'bool',
      props: {
        currentLanguage: this.props.currentLanguage,
        label: t('creation security', this.props.currentLanguage),
        help: t('creation.security.help', this.props.currentLanguage, false, 'if enabled, only authorized teams will be able to create APIs')
      }
    },
    subscriptionSecurity: {
      type: 'bool',
      props: {
        currentLanguage: this.props.currentLanguage,
        label: t('subscription security', this.props.currentLanguage),
        help: t('subscription.security.help', this.props.currentLanguage, false, 'if enabled, personnal teams will not be able to subscribed to an API')
      }
    },
    'mailerSettings.type': {
      type: 'select',
      props: {
        label: t('Mailer type', this.props.currentLanguage),
        possibleValues: [
          { label: 'Mailgun', value: 'mailgun' },
          { label: 'Mailjet', value: 'mailjet' },
        ],
      },
    },
    mailerSettings: {
      type: MailerConfig,
      props: {
        label: t('Mailer', this.props.currentLanguage),
        currentLanguage: this.props.currentLanguage,
      },
    },
    'daikokuHeader.name': {
      type: 'string',
      props: { label: t('Header name', this.props.currentLanguage) },
      disabled: true,
    },
    'daikokuHeader.value': {
      type: 'string',
      props: { label: t('Header value', this.props.currentLanguage) },
      disabled: true,
    },
    'auditTrailConfig.auditWebhooks': {
      type: LazyFormInput,
      props: { flow: this.webhooksFormFlow, schema: this.webhooksFormSchema },
    },
    'auditTrailConfig.alertsEmails': {
      type: 'array',
      props: {
        label: t('Alert emails', this.props.currentLanguage),
        placeholder: t('Email address to receive alerts', this.props.currentLanguage),
        help: t(
          'Alert.email.help',
          this.props.currentLanguage,
          'Every email address will be notified with a summary of Otoroshi alerts'
        ),
      },
    },
    'auditTrailConfig.elasticConfigs': {
      type: LazyFormInput,
      props: {
        flow: this.elasticConfigFormFlow,
        schema: this.elasticConfigFormSchema,
      },
    },
    'auditTrailConfig.kafkaConfig.servers': {
      type: 'array',
      props: {
        label: t('Kafka Servers', this.props.currentLanguage),
        placeholder: '127.0.0.1:9092',
        help: t(
          'kafka.servers.help',
          this.props.currentLanguage,
          'The list of servers to contact to connect the Kafka client with the Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.keyPass': {
      type: 'string',
      props: {
        label: t('Kafka keypass', this.props.currentLanguage),
        placeholder: t('Secret', this.props.currentLanguage),
        help: t(
          'kafka.secret.help',
          this.props.currentLanguage,
          'The keystore password if you use a keystore/truststore to connect to Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.keystore': {
      type: 'string',
      props: {
        label: t('Kafka keystore path', this.props.currentLanguage),
        placeholder: '/home/bas/client.keystore.jks',
        help: t(
          'kafka.keystore.path.help',
          this.props.currentLanguage,
          'The keystore path on the server if you use a keystore/truststore to connect to Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.truststore': {
      type: 'string',
      props: {
        label: t('Kafka truststore path', this.props.currentLanguage),
        placeholder: '/home/bas/client.truststore.jks',
        help: t(
          'kafka.truststore.path.help',
          this.props.currentLanguage,
          'The truststore path on the server if you use a keystore/truststore to connect to Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.auditTopic': {
      type: 'string',
      props: {
        label: t('Kafka audits topic', this.props.currentLanguage),
        placeholder: t('daikoku-audit', this.props.currentLanguage),
        help: t(
          'kafka.audit.topic.help',
          this.props.currentLanguage,
          'The topic on which Otoroshi audits will be sent'
        ),
      },
    },
    'bucketSettings.bucket': {
      type: 'string',
      props: {
        label: t('Bucket name', this.props.currentLanguage),
        placeholder: 'daikoku-tenant-1',
        help: t('The name of the S3 bucket', this.props.currentLanguage),
      },
    },
    'bucketSettings.endpoint': {
      type: 'string',
      props: {
        label: t('Bucket url', this.props.currentLanguage),
        help: t('The url of the bucket', this.props.currentLanguage),
      },
    },
    'bucketSettings.region': {
      type: 'string',
      props: {
        label: t('S3 region', this.props.currentLanguage),
        placeholder: 'us-west-2',
        help: t('The region of the bucket', this.props.currentLanguage),
      },
    },
    'bucketSettings.access': {
      type: 'string',
      props: {
        label: t('Bucket access key', this.props.currentLanguage),
        help: t('The access key to access bucket', this.props.currentLanguage),
      },
    },
    'bucketSettings.secret': {
      type: 'string',
      props: {
        label: t('Bucket secret', this.props.currentLanguage),
        help: t('The secret to access the bucket', this.props.currentLanguage),
      },
    },
    'bucketSettings.chunkSize': {
      type: 'number',
      props: {
        label: t('Chunk size', this.props.currentLanguage),
        placeholder: 1024 * 1024 * 8,
        help: t('The size of each chunk sent', this.props.currentLanguage),
      },
    },
    'bucketSettings.v4auth': {
      type: 'bool',
      props: {
        label: t('Use V4 auth.', this.props.currentLanguage),
      },
    },
  };

  componentDidMount() {
    if (this.props.location && this.props.location.state && this.props.location.state.newTenant) {
      this.setState({
        tenant: {
          ...this.props.location.state.newTenant,
          bucketSettings: this.props.location.state.newTenant.bucketSettings || {},
        },
        create: true,
      });
    } else {
      Services.oneTenant(this.props.match.params.tenantId).then((tenant) => {
        this.setState({ tenant: { ...tenant, bucketSettings: tenant.bucketSettings || {} } });
      });
    }
  }

  static getDerivedStateFromProps(props, state) {
    if (state.tenant && props.match.params.tenantId !== state.tenant._humanReadableId) {
      Services.oneTenant(props.match.params.tenantId).then((tenant) => {
        return { tenant: { ...tenant, bucketSettings: tenant.bucketSettings || {} } };
      });
    }
    return null;
  }

  save = () => {
    if (this.state.create) {
      return Services.createTenant(this.state.tenant).then((tenant) => {
        this.setState(
          {
            create: false,
            tenant: { ...tenant, bucketSettings: tenant.bucketSettings || {} },
          },
          () =>
            toastr.success(
              t(
                'tenant.created.success',
                this.props.currentLanguage,
                false,
                `Tenant "${tenant.name}" created`,
                tenant.name
              )
            )
        );
      });
    } else {
      return Services.saveTenant(this.state.tenant).then(() =>
        toastr.success(t('Tenant updated successfully', this.props.currentLanguage))
      );
    }
  };

  componentDidCatch(e) {
    console.log('TenantError', e);
  }

  render() {
    const disabled = {}; //TODO: deepEqual(this.state.originalApi, this.state.api) ? { disabled: 'disabled' } : {};
    return (
      <UserBackOffice tab="Tenants" isLoading={!this.state.tenant}>
        {this.state.tenant && (
          <Can I={manage} a={tenant} dispatchError>
            <div className="row">
              <div className="col-12 d-flex justify-content-start align-items-center mb-2">
                <div className="avatar__container">
                  <img
                    style={{ width: '100%', height: 'auto' }}
                    src={this.state.tenant.style.logo}
                    alt="avatar"
                  />
                </div>
                <h1 className="h1-rwd-reduce ml-2">{this.state.tenant.name}</h1>
              </div>
              <React.Suspense fallback={<Spinner />}>
                <LazyForm
                  currentLanguage={this.props.currentLanguage}
                  flow={this.flow}
                  schema={this.schema}
                  value={this.state.tenant}
                  onChange={(tenant) => this.setState({ tenant, updated: true })}
                  style={{ marginBottom: 100, paddingTop: 20 }}
                />
              </React.Suspense>
              <div style={{ height: 60 }} />
              <div className="row form-back-fixedBtns">
                <Link className="btn btn-outline-primary mr-1" to={'/settings/tenants'}>
                  <i className="fas fa-chevron-left mr-1" />
                  <Translation i18nkey="Back" language={this.props.currentLanguage}>
                    Back
                  </Translation>
                </Link>
                {!this.state.create && (
                  <Link
                    className="btn btn-outline-primary mr-1"
                    to={`/settings/tenants/${this.state.tenant._humanReadableId}/admins`}>
                    <i className="fas fa-user-shield mr-1" />
                    <Translation i18nkey="Admins" language={this.props.currentLanguage}>
                      Admins
                    </Translation>
                  </Link>
                )}
                <button
                  type="button"
                  className="btn btn-outline-success"
                  {...disabled}
                  onClick={this.save}>
                  {!this.state.create && (
                    <span>
                      <i className="fas fa-save mr-1" />
                      <Translation i18nkey="Save" language={this.props.currentLanguage}>
                        Save
                      </Translation>
                    </span>
                  )}
                  {this.state.create && (
                    <span>
                      <i className="fas fa-save mr-1" />
                      <Translation i18nkey="Create" language={this.props.currentLanguage}>
                        Create
                      </Translation>
                    </span>
                  )}
                </button>
              </div>
            </div>
          </Can>
        )}
      </UserBackOffice>
    );
  }
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  openSaveOrCancelModal: (modalProps) => openSaveOrCancelModal(modalProps),
};

export const TenantEdit = connect(mapStateToProps, mapDispatchToProps)(TenantEditComponent);
