import React, { Component, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { AssetChooserByModal, MimeTypeFilter } from '../../frontend';

import { UserBackOffice } from '../../backoffice';
import * as Services from '../../../services';

import { LDAPConfig, LocalConfig, OAuth2Config, OtoroshiConfig } from './auth';
import {
  ConsoleConfig,
  MailgunConfig,
  MailjetConfig,
  SmtpClientConfig,
  SendGridConfig,
} from './mailer';
import { Can, manage, tenant, Spinner } from '../../utils';
import { Translation, configuration } from '../../../locales';
import { BooleanInput } from '../../inputs/BooleanInput';
import { openSaveOrCancelModal, updateTenant } from '../../../core';
import { I18nContext } from '../../../core/context';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

function LazyFormInput(props) {
  return (
    <React.Suspense fallback={<Spinner />}>
      <LazyForm {...props} />
    </React.Suspense>
  );
}

function AuthConfig(props) {

  if (props.rawValue.authProvider === 'Local') {
    return <LocalConfig {...props} />;
  } else if (props.rawValue.authProvider === 'Otoroshi') {
    return <OtoroshiConfig {...props} />;
  } else if (props.rawValue.authProvider === 'LDAP') {
    return <LDAPConfig {...props} />;
  } else if (props.rawValue.authProvider === 'OAuth2') {
    return <OAuth2Config {...props} />;
  } else {
    return (
      <span>
        <Translation i18nkey="Unsupported auth. type">
          Unsupported auth. type
        </Translation>{' '}
        ({props.rawValue.authProvider})
      </span>
    );
  }
}

class MailerConfig extends Component {
  render() {
    const { rawValue } = props;
    const mailerSettings = rawValue.mailerSettings;

    if (!mailerSettings) return null;

    if (mailerSettings.type === 'console') return <ConsoleConfig {...props} />;
    else if (mailerSettings.type === 'mailgun') return <MailgunConfig {...props} />;
    else if (mailerSettings.type === 'mailjet') return <MailjetConfig {...props} />;
    else if (mailerSettings.type === 'smtpClient') return <SmtpClientConfig {...props} />;
    else if (mailerSettings.type === 'sendgrid') return <SendGridConfig {...props} />;
    else return null;
  }
}

function StyleLogoAssetButton(props) {
  const { t } = useContext(I18nContext)

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin = window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  return (
    <div className="form-group d-flex justify-content-end">
      <AssetChooserByModal
        typeFilter={MimeTypeFilter.image}
        onlyPreview
        tenantMode
        label={t('Set tenant logo from asset')}
        currentLanguage={props.currentLanguage}
        onSelect={(asset) => props.changeValue('style.logo', origin + asset.link)}
      />
    </div>
  );
}

function StyleJsUrlAssetButton(props) {
  const { t } = useContext(I18nContext)

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin = window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  return (
    <div className="form-group d-flex justify-content-end">
      <AssetChooserByModal
        typeFilter={MimeTypeFilter.javascript}
        tenantMode
        label={t('Set js from asset')}
        currentLanguage={props.currentLanguage}
        onSelect={(asset) => props.changeValue('style.jsUrl', origin + asset.link)}
      />
    </div>
  );
}

function StyleCssUrlAssetButton(props) {
  const { t } = useContext(I18nContext)

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin = window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;

  return (
    <div className="form-group d-flex justify-content-end">
      <AssetChooserByModal
        typeFilter={MimeTypeFilter.css}
        tenantMode
        label={t('Set css from asset')}
        currentLanguage={props.currentLanguage}
        onSelect={(asset) => props.changeValue('style.cssUrl', origin + asset.link)}
      />
    </div>
  );
}


function StyleFaviconUrlAssetButton(props) {
  const { t } = useContext(I18nContext)

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin = window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  return (
    <div className="form-group d-flex justify-content-end">
      <AssetChooserByModal
        typeFilter={MimeTypeFilter.image}
        onlyPreview
        tenantMode
        label={t('Set favicon from asset')}
        currentLanguage={props.currentLanguage}
        onSelect={(asset) => props.changeValue('style.faviconUrl', origin + asset.link)}
      />
    </div>
  );
}

function StyleFontFamilyUrlAssetButton(props) {
  const { t } = useContext(I18nContext)

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  return (
    <div className="form-group d-flex justify-content-end">
      <AssetChooserByModal
        typeFilter={MimeTypeFilter.font}
        tenantMode
        label={t('Set font family from asset')}
        currentLanguage={props.currentLanguage}
        onSelect={(asset) => props.changeValue('style.fontFamilyUrl', origin + asset.link)}
      />
    </div>
  );
}

function ThemeUpdatorFromUI(props) {
  const { t } = useContext(I18nContext)

  return (
    <div className="form-group d-flex justify-content-end">
      <button
        type="button"
        className="btn btn-access-negative"
        onClick={() => {
          const RedirectToUI = () =>
            props.history.push(`/settings/tenants/${props.tenant()._id}/style`);
          if (props.isTenantUpdated()) {
            props.openModal({
              open: true,
              dontsave: () => RedirectToUI(),
              save: () => props.save().then(() => RedirectToUI()),
              title: t(
                'unsaved.modifications.title',
                false,
                'Unsaved modifications'
              ),
              message: t(
                'unsaved.modifications.message',
                false,
                'Your have unsaved modifications, do you want to save it before continue ?'
              ),
            });
          } else {
            RedirectToUI();
          }
        }}>
        <Translation i18nkey="Set Color Theme from UI">
          Set Color Theme from UI
        </Translation>
      </button>
    </div>
  );
}

function HomePageVisibilitySwitch(props) {

  if (props.rawValue.isPrivate) {
    return null;
  }
  return (
    <BooleanInput
      key="style.homePageVisible"
      {...props}
      value={props.rawValue.style.homePageVisible}
      onChange={(v) => props.changeValue('style.homePageVisible', v)}
    />
  );
}

export function TenantEditComponent(props) {
  const { t } = useContext(I18nContext)

  const [state, setState] = useState({
    tenant: null,
    create: false,
    updated: false,
  })

  const flow = [
    '_id',
    'enabled',
    'name',
    'domain',
    'exposedPort',
    'defaultLanguage',
    'contact',
    'tenantMode',
    `>>> ${t('Tenant Style')}`,
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
    `>>> ${t('Authentication')}`,
    'authProvider',
    'authProviderSettings',
    `>>> ${t('Security')}`,
    'isPrivate',
    'creationSecurity',
    'subscriptionSecurity',
    'aggregationApiKeysSecurity',
    'apiReferenceHideForGuest',
    'hideTeamsPage',
    `>>> ${t('Audit trail (Elastic)')}`,
    'auditTrailConfig.elasticConfigs',
    `>>> ${t('Audit trail (Webhooks)')}`,
    'auditTrailConfig.auditWebhooks',
    `>>> ${t('Audit trail (Kafka)')}`,
    'auditTrailConfig.kafkaConfig.servers',
    'auditTrailConfig.kafkaConfig.keyPass',
    'auditTrailConfig.kafkaConfig.keystore',
    'auditTrailConfig.kafkaConfig.truststore',
    'auditTrailConfig.kafkaConfig.auditTopic',
    'auditTrailConfig.kafkaConfig.hostValidation',
    `>>> ${t('Alerting')}`,
    'auditTrailConfig.alertsEmails',
    `>>> ${t('Mailer')}`,
    'mailerSettings.type',
    'mailerSettings',
    `>>> ${t('Bucket')}`,
    'bucketSettings.bucket',
    'bucketSettings.endpoint',
    'bucketSettings.region',
    'bucketSettings.access',
    'bucketSettings.secret',
    'bucketSettings.chunkSize',
    'bucketSettings.v4auth',
    `>>> ${t('Message', true)}`,
    'defaultMessage',
    `>>> ${t('Footer')}`,
    'style.footer',
    `>>> ${t('Unlogged home description')}`,
    'style.homePageVisible',
    'style.unloggedHome',
  ];

  const elasticConfigFormFlow = ['clusterUri', 'index', 'type', 'user', 'password'];

  const elasticConfigFormSchema = {
    clusterUri: {
      type: 'string',
      props: {
        label: t('Cluster URI'),
        placeholder: t('Elastic cluster URI'),
      },
    },
    index: {
      type: 'string',
      props: {
        label: t('Index'),
        placeholder: t('Elastic index'),
      },
    },
    type: {
      type: 'string',
      props: {
        label: t('Type'),
        placeholder: t('Event type'),
      },
    },
    user: {
      type: 'string',
      props: {
        label: t('User'),
        placeholder: t('Elastic User (optional)'),
      },
    },
    password: {
      type: 'string',
      props: {
        label: t('Password'),
        placeholder: t('Elastic password (optional)'),
      },
    },
  };

  const webhooksFormSchema = {
    url: {
      type: 'string',
      props: {
        label: t('Analytics webhook URL'),
        placeholder: t('URL of the webhook target'),
      },
    },
    headers: {
      type: 'object',
      props: {
        label: t('Webhook Headers'),
        placeholderKey: t('Header name'),
        placeholderValue: t('Header value'),
      },
    },
  };

  const webhooksFormFlow = ['url', 'headers'];

  const schema = {
    _id: {
      type: 'string',
      props: { label: t('Id') },
    },
    enabled: {
      type: 'bool',
      props: { label: t('Enabled') },
    },
    name: {
      type: 'string',
      props: { label: t('Name') },
    },
    domain: {
      type: 'string',
      props: { label: t('Domain name') },
    },
    exposedPort: {
      type: 'string',
      props: {
        label: t('Exposed port'),
      },
    },
    defaultLanguage: {
      type: 'select',
      props: {
        label: t('Default  language'),
        possibleValues: Object.keys(configuration).map((key) => ({
          label: key,
          value: key,
        })),
      },
    },
    contact: {
      type: 'string',
      props: {
        label: t('Contact'),
      },
    },
    'style.title': {
      type: 'string',
      props: { label: t('Title') },
    },
    'style.description': {
      type: 'markdown',
      props: { label: t('Description') },
    },
    'style.unloggedHome': {
      type: 'markdown',
      props: {
        tenantMode: true,
        label: t('Unlogged description'),
      },
    },
    'style.homePageVisible': {
      type: HomePageVisibilitySwitch,
      props: {
        label: t('Enabled'),
      },
    },
    'style.logo': {
      type: 'string',
      props: { label: t('Logo') },
    },
    'style.logoFromAssets': {
      type: StyleLogoAssetButton,
      props: {
        tenant: () => state.tenant,
        currentLanguage: props.currentLanguage,
        onChangeLogo: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.cssUrlFromAssets': {
      type: StyleCssUrlAssetButton,
      props: {
        tenant: () => state.tenant,
        currentLanguage: props.currentLanguage,
        onChangeLogo: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.jsUrlFromAssets': {
      type: StyleJsUrlAssetButton,
      props: {
        tenant: () => state.tenant,
        currentLanguage: props.currentLanguage,
        onChangeLogo: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.faviconUrlFromAssets': {
      type: StyleFaviconUrlAssetButton,
      props: {
        tenant: () => state.tenant,
        currentLanguage: props.currentLanguage,
        onChangeLogo: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.css': {
      type: 'text',
      props: { label: t('CSS') },
    },
    'style.colorTheme': {
      type: 'text',
      props: { label: t('CSS color theme') },
    },
    'style.colorThemeFromUI': {
      type: ThemeUpdatorFromUI,
      props: {
        tenant: () => state.tenant,
        save: () => save(),
        history: props.history,
        currentLanguage: props.currentLanguage,
        isTenantUpdated: () => !!state.updated,
        openModal: (props) => props.openSaveOrCancelModal({ ...props }),
      },
    },
    'style.js': {
      type: 'text',
      props: { label: t('Javascript') },
    },
    'style.jsUrl': {
      type: 'string',
      props: { label: t('Js URL') },
    },
    'style.cssUrl': {
      type: 'string',
      props: { label: t('CSS URL') },
    },
    'style.faviconUrl': {
      type: 'string',
      props: { label: t('Favicon URL') },
    },
    'style.fontFamilyUrl': {
      type: 'string',
      props: { label: t('Font family') },
    },
    'style.fontFamilyUrlFromAssets': {
      type: StyleFontFamilyUrlAssetButton,
      props: {
        tenant: () => state.tenant,
        currentLanguage: props.currentLanguage,
        onChangeFont: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.footer': {
      type: 'markdown',
      props: { label: t('Footer') },
    },
    defaultMessage: {
      type: 'markdown',
      props: { label: t('Default message') },
    },
    isPrivate: {
      type: 'bool',
      props: {
        label: t('Private tenant'),
      },
    },
    authProvider: {
      type: 'select',
      props: {
        label: t('Authentication type'),
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
        currentLanguage: props.currentLanguage,
        label: t('Settings'),
      },
    },
    creationSecurity: {
      type: 'bool',
      props: {
        currentLanguage: props.currentLanguage,
        label: t('creation security'),
        help: t(
          'creation.security.help',
          false,
          'if enabled, only authorized teams will be able to create APIs'
        ),
      },
    },
    subscriptionSecurity: {
      type: 'bool',
      props: {
        currentLanguage: props.currentLanguage,
        label: t('subscription security'),
        help: t(
          'subscription.security.help',
          false,
          'if enabled, personnal teams will not be able to subscribed to an API'
        ),
      },
    },
    aggregationApiKeysSecurity: {
      type: () => (
        <BooleanInput
          key="aggregationApiKeysSecurity"
          value={state.tenant.aggregationApiKeysSecurity}
          label={t('aggregation api keys security')}
          help={t('aggregation_apikeys.security.help')}
          onChange={(e) => {
            if (e)
              window.alert(
                t('aggregation.api_key.security.notification'),
                undefined,
                undefined,
                t('I understood'),
                props.currentLanguage
              );

            setState({
              ...state,
              tenant: {
                ...state.tenant,
                aggregationApiKeysSecurity: e,
              },
            });
          }}
        />
      ),
    },
    apiReferenceHideForGuest: {
      type: 'bool',
      props: {
        currentLanguage: props.currentLanguage,
        label: t('Api reference visibility'),
        help: t(
          'appi.reference.visibility.help',
          false,
          "if enabled, guest user can't see api reference on public api"
        ),
      },
    },
    hideTeamsPage: {
      type: 'bool',
      props: {
        currentLanguage: props.currentLanguage,
        label: t('Hide teams page'),
        help: t(
          'hide.teams.page.help',
          false,
          'if enabled, /teams will be inaccessible'
        ),
      },
    },
    'mailerSettings.type': {
      type: 'select',
      props: {
        label: t('Mailer type'),
        possibleValues: [
          { label: 'Console', value: 'console' },
          { label: 'SMTP Client', value: 'smtpClient' },
          { label: 'Mailgun', value: 'mailgun' },
          { label: 'Mailjet', value: 'mailjet' },
          { label: 'Sendgrid', value: 'sendgrid' },
        ],
      },
    },
    mailerSettings: {
      type: MailerConfig,
      props: {
        label: t('Mailer'),
        currentLanguage: props.currentLanguage,
      },
    },
    'daikokuHeader.name': {
      type: 'string',
      props: { label: t('Header name') },
      disabled: true,
    },
    'daikokuHeader.value': {
      type: 'string',
      props: { label: t('Header value') },
      disabled: true,
    },
    'auditTrailConfig.auditWebhooks': {
      type: LazyFormInput,
      props: { flow: webhooksFormFlow, schema: webhooksFormSchema },
    },
    'auditTrailConfig.alertsEmails': {
      type: 'array',
      props: {
        label: t('Alert emails'),
        placeholder: t('Email address to receive alerts'),
        help: t(
          'Alert.email.help',
          false,
          'Every email address will be notified with a summary of Otoroshi alerts'
        ),
      },
    },
    'auditTrailConfig.elasticConfigs': {
      type: LazyFormInput,
      props: {
        flow: elasticConfigFormFlow,
        schema: elasticConfigFormSchema,
      },
    },
    'auditTrailConfig.kafkaConfig.servers': {
      type: 'array',
      props: {
        label: t('Kafka Servers'),
        placeholder: '127.0.0.1:9092',
        help: t(
          'kafka.servers.help',
          false,
          'The list of servers to contact to connect the Kafka client with the Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.keyPass': {
      type: 'string',
      props: {
        label: t('Kafka keypass'),
        placeholder: t('Secret'),
        help: t(
          'kafka.secret.help',
          false,
          'The keystore password if you use a keystore/truststore to connect to Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.keystore': {
      type: 'string',
      props: {
        label: t('Kafka keystore path'),
        placeholder: '/home/bas/client.keystore.jks',
        help: t(
          'kafka.keystore.path.help',
          false,
          'The keystore path on the server if you use a keystore/truststore to connect to Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.truststore': {
      type: 'string',
      props: {
        label: t('Kafka truststore path'),
        placeholder: '/home/bas/client.truststore.jks',
        help: t(
          'kafka.truststore.path.help',
          false,
          'The truststore path on the server if you use a keystore/truststore to connect to Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.auditTopic': {
      type: 'string',
      props: {
        label: t('Kafka audits topic'),
        placeholder: t('daikoku-audit'),
        help: t(
          'kafka.audit.topic.help',
          false,
          'The topic on which Otoroshi audits will be sent'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.hostValidation': {
      type: 'bool',
      props: {
        label: t('Kafka host validation'),
        help: t(
          'kafka.audit.hostValidation.help',
          false,
          'Disable kafka to validate server hostname using server certificate.'
        ),
      },
    },
    'bucketSettings.bucket': {
      type: 'string',
      props: {
        label: t('Bucket name'),
        placeholder: 'daikoku-tenant-1',
        help: t('The name of the S3 bucket'),
      },
    },
    'bucketSettings.endpoint': {
      type: 'string',
      props: {
        label: t('Bucket url'),
        help: t('The url of the bucket'),
      },
    },
    'bucketSettings.region': {
      type: 'string',
      props: {
        label: t('S3 region'),
        placeholder: 'us-west-2',
        help: t('The region of the bucket'),
      },
    },
    'bucketSettings.access': {
      type: 'string',
      props: {
        label: t('Bucket access key'),
        help: t('The access key to access bucket'),
      },
    },
    'bucketSettings.secret': {
      type: 'string',
      props: {
        label: t('Bucket secret'),
        help: t('The secret to access the bucket'),
      },
    },
    'bucketSettings.chunkSize': {
      type: 'number',
      props: {
        label: t('Chunk size'),
        placeholder: 1024 * 1024 * 8,
        help: t('The size of each chunk sent'),
      },
    },
    'bucketSettings.v4auth': {
      type: 'bool',
      props: {
        label: t('Use V4 auth.'),
      },
    },
    tenantMode: {
      type: 'select',
      props: {
        label: t('Modes'),
        possibleValues: [
          { label: t('Default mode'), value: 'default' },
          { label: t('Maintenance mode'), value: 'maintenance' },
          { label: t('Construction mode'), value: 'construction' },
          { label: t('Translation mode'), value: 'translation' },
        ],
      },
    },
  };

  useEffect(() => {
    if (props.location && props.location.state && props.location.state.newTenant) {
      setState({
        ...state,
        tenant: {
          ...props.location.state.newTenant,
          bucketSettings: props.location.state.newTenant.bucketSettings || {},
        },
        create: true,
      });
    } else {
      Services.oneTenant(props.match.params.tenantId).then((tenant) => {
        setState({
          ...state,
          tenant: { ...tenant, bucketSettings: tenant.bucketSettings || {} }
        });
      });
    }
  }, [])

  const save = () => {
    if (state.create) {
      return Services.createTenant(state.tenant).then((tenant) => {
        setState(
          {
            ...state,
            create: false,
            tenant: { ...tenant, bucketSettings: tenant.bucketSettings || {} },
          },
          () =>
            toastr.success(
              t(
                'tenant.created.success',
                false,
                `Tenant "${tenant.name}" created`,
                tenant.name
              )
            )
        );
      });
    } else {
      if (state.tenant.tenantMode === "translation")
        window.alert(
          <p>
            {t('tenant_edit.translation_mode_message')}
          </p>
        )
      return Services.saveTenant(state.tenant)
        .then(({ uiPayload }) => props.updateTenant(uiPayload))
        .then(() => toastr.success(t('Tenant updated successfully')));
    }
  };

  const disabled = {}; //TODO: deepEqual(state.originalApi, state.api) ? { disabled: 'disabled' } : {};
  return (
    <UserBackOffice tab="Tenants" isLoading={!state.tenant}>
      {state.tenant && (
        <Can I={manage} a={tenant} dispatchError>
          <div className="row">
            <div className="col-12 d-flex justify-content-start align-items-center mb-2">
              <div className="avatar__container">
                <img
                  style={{ width: '100%', height: 'auto' }}
                  src={state.tenant.style.logo}
                  alt="avatar"
                />
              </div>
              <h1 className="h1-rwd-reduce ml-2">{state.tenant.name}</h1>
            </div>
            <React.Suspense fallback={<Spinner />}>
              <LazyForm
                currentLanguage={props.currentLanguage}
                flow={flow}
                schema={schema}
                value={state.tenant}
                onChange={(tenant) => setState({ ...state, tenant, updated: true })}
                style={{ marginBottom: 100, paddingTop: 20 }}
              />
            </React.Suspense>
            <div style={{ height: 60 }} />
            <div className="row form-back-fixedBtns">
              <Link className="btn btn-outline-primary mr-1" to={'/settings/tenants'}>
                <i className="fas fa-chevron-left mr-1" />
                <Translation i18nkey="Back">
                  Back
                </Translation>
              </Link>
              {!state.create && (
                <Link
                  className="btn btn-outline-primary mr-1"
                  to={`/settings/tenants/${state.tenant._humanReadableId}/admins`}>
                  <i className="fas fa-user-shield mr-1" />
                  <Translation i18nkey="Admins">
                    Admins
                  </Translation>
                </Link>
              )}
              <button
                type="button"
                className="btn btn-outline-success"
                {...disabled}
                onClick={save}>
                {!state.create && (
                  <span>
                    <i className="fas fa-save mr-1" />
                    <Translation i18nkey="Save">
                      Save
                    </Translation>
                  </span>
                )}
                {state.create && (
                  <span>
                    <i className="fas fa-save mr-1" />
                    <Translation i18nkey="Create">
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

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  openSaveOrCancelModal: (modalProps) => openSaveOrCancelModal(modalProps),
  updateTenant: (t) => updateTenant(t),
};

export const TenantEdit = connect(mapStateToProps, mapDispatchToProps)(TenantEditComponent);
