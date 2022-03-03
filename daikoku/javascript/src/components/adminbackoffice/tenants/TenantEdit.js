import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
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
import { BooleanInput } from '../../inputs/BooleanInput';
import { openSaveOrCancelModal, updateTenant } from '../../../core';
import { I18nContext } from '../../../locales/i18n-context';
import { getApolloContext, gql } from '@apollo/client';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

function LazyFormInput(props) {
  return (
    <React.Suspense fallback={<Spinner />}>
      <LazyForm {...props} />
    </React.Suspense>
  );
}

function AuthConfig(props) {
  const { Translation } = useContext(I18nContext);

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
        <Translation i18nkey="Unsupported auth. type">Unsupported auth. type</Translation> (
        {props.rawValue.authProvider})
      </span>
    );
  }
}

function MailerConfig(props) {
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

function StyleLogoAssetButton(props) {
  const { translateMethod } = useContext(I18nContext);

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  return (
    <div className="mb-3 d-flex justify-content-end">
      <AssetChooserByModal
        typeFilter={MimeTypeFilter.image}
        onlyPreview
        tenantMode
        label={translateMethod('Set tenant logo from asset')}
        onSelect={(asset) => props.changeValue('style.logo', origin + asset.link)}
      />
    </div>
  );
}

function StyleJsUrlAssetButton(props) {
  const { translateMethod } = useContext(I18nContext);

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  return (
    <div className="mb-3 d-flex justify-content-end">
      <AssetChooserByModal
        typeFilter={MimeTypeFilter.javascript}
        tenantMode
        label={translateMethod('Set js from asset')}
        onSelect={(asset) => props.changeValue('style.jsUrl', origin + asset.link)}
      />
    </div>
  );
}

function StyleCssUrlAssetButton(props) {
  const { translateMethod } = useContext(I18nContext);

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;

  return (
    <div className="mb-3 d-flex justify-content-end">
      <AssetChooserByModal
        typeFilter={MimeTypeFilter.css}
        tenantMode
        label={translateMethod('Set css from asset')}
        onSelect={(asset) => props.changeValue('style.cssUrl', origin + asset.link)}
      />
    </div>
  );
}

function StyleFaviconUrlAssetButton(props) {
  const { translateMethod } = useContext(I18nContext);

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  return (
    <div className="mb-3 d-flex justify-content-end">
      <AssetChooserByModal
        typeFilter={MimeTypeFilter.image}
        onlyPreview
        tenantMode
        label={translateMethod('Set favicon from asset')}
        onSelect={(asset) => props.changeValue('style.faviconUrl', origin + asset.link)}
      />
    </div>
  );
}

function StyleFontFamilyUrlAssetButton(props) {
  const { translateMethod } = useContext(I18nContext);

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  return (
    <div className="mb-3 d-flex justify-content-end">
      <AssetChooserByModal
        typeFilter={MimeTypeFilter.font}
        tenantMode
        label={translateMethod('Set font family from asset')}
        onSelect={(asset) =>
          props.changeValue('style.fontFamilyUrl', origin + asset.link + '?streamed=true')
        }
      />
    </div>
  );
}

function ThemeUpdatorFromUI(props) {
  const { translateMethod, Translation } = useContext(I18nContext);
  const navigate = useNavigate();

  return (
    <div className="mb-3 d-flex justify-content-end">
      <button
        type="button"
        className="btn btn-access-negative"
        onClick={(e) => {
          const RedirectToUI = () => navigate(`/settings/tenants/${props.tenant()._id}/style`);
          if (props.isTenantUpdated()) {
            props.openModal({
              open: true,
              dontsave: () => RedirectToUI(),
              save: () => props.save().then(() => RedirectToUI()),
              title: translateMethod('unsaved.modifications.title', false, 'Unsaved modifications'),
              message: translateMethod(
                'unsaved.modifications.message',
                false,
                'Your have unsaved modifications, do you want to save it before continue ?'
              ),
            });
          } else {
            RedirectToUI();
          }
        }}
      >
        <Translation i18nkey="Set Color Theme from UI">Set Color Theme from UI</Translation>
      </button>
    </div>
  );
}

function HomePageVisibilitySwitch(props) {
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
  const { translateMethod, language, Translation, languages, setTranslationMode } =
    useContext(I18nContext);

  const params = useParams();
  const location = useLocation();

  const [state, setState] = useState({
    tenant: null,
    create: false,
    updated: false
  });

  const [cmsPages, setCmsPages] = useState([])

  const { client } = useContext(getApolloContext())

  useEffect(() => {
    client.query({
      query: gql`
        query CmsPages {
          pages {
              id
              name
              path
              contentType
          }
        }
      `,
    })
      .then(r => setCmsPages(r.data.pages))
  }, [])

  const flow = [
    '_id',
    'enabled',
    'name',
    'domain',
    'defaultLanguage',
    'contact',
    'tenantMode',
    `>>> ${translateMethod('Tenant Style')}`,
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
    `>>> ${translateMethod('Authentication')}`,
    'authProvider',
    'authProviderSettings',
    `>>> ${translateMethod('Security')}`,
    'isPrivate',
    'creationSecurity',
    'subscriptionSecurity',
    'aggregationApiKeysSecurity',
    'apiReferenceHideForGuest',
    'hideTeamsPage',
    `>>> ${translateMethod('Audit trail (Elastic)')}`,
    'auditTrailConfig.elasticConfigs',
    `>>> ${translateMethod('Audit trail (Webhooks)')}`,
    'auditTrailConfig.auditWebhooks',
    `>>> ${translateMethod('Audit trail (Kafka)')}`,
    'auditTrailConfig.kafkaConfig.servers',
    'auditTrailConfig.kafkaConfig.keyPass',
    'auditTrailConfig.kafkaConfig.keystore',
    'auditTrailConfig.kafkaConfig.truststore',
    'auditTrailConfig.kafkaConfig.auditTopic',
    'auditTrailConfig.kafkaConfig.hostValidation',
    `>>> ${translateMethod('Alerting')}`,
    'auditTrailConfig.alertsEmails',
    `>>> ${translateMethod('Mailer')}`,
    'mailerSettings.type',
    'mailerSettings',
    `>>> ${translateMethod('Bucket')}`,
    'bucketSettings.bucket',
    'bucketSettings.endpoint',
    'bucketSettings.region',
    'bucketSettings.access',
    'bucketSettings.secret',
    'bucketSettings.chunkSize',
    'bucketSettings.v4auth',
    `>>> ${translateMethod('Message', true)}`,
    'defaultMessage',
    `>>> ${translateMethod('Footer')}`,
    'style.footer',
    `>>> ${translateMethod('tenant_edit.cms_pages')}`,
    'style.homePageVisible',
    'style.homeCmsPage',
    'style.notFoundCmsPage',
    'style.authenticatedCmsPage',
    'style.cmsHistoryLength',
    'style.cacheTTL',
    'linkToCmsPages',
    `>>> ${translateMethod('SEO')}`,
    'robotTxt',
  ];

  const elasticConfigFormFlow = ['clusterUri', 'index', 'type', 'user', 'password'];

  const elasticConfigFormSchema = {
    clusterUri: {
      type: 'string',
      props: {
        label: translateMethod('Cluster URI'),
        placeholder: translateMethod('Elastic cluster URI'),
      },
    },
    index: {
      type: 'string',
      props: {
        label: translateMethod('Index'),
        placeholder: translateMethod('Elastic index'),
      },
    },
    type: {
      type: 'string',
      props: {
        label: translateMethod('Type'),
        placeholder: translateMethod('Event type'),
      },
    },
    user: {
      type: 'string',
      props: {
        label: translateMethod('User'),
        placeholder: translateMethod('Elastic User (optional)'),
      },
    },
    password: {
      type: 'string',
      props: {
        label: translateMethod('Password'),
        placeholder: translateMethod('Elastic password (optional)'),
      },
    },
  };

  const webhooksFormSchema = {
    url: {
      type: 'string',
      props: {
        label: translateMethod('Analytics webhook URL'),
        placeholder: translateMethod('URL of the webhook target'),
      },
    },
    headers: {
      type: 'object',
      props: {
        label: translateMethod('Webhook Headers'),
        placeholderKey: translateMethod('Header name'),
        placeholderValue: translateMethod('Header value'),
      },
    },
  };

  const webhooksFormFlow = ['url', 'headers'];

  const schema = {
    _id: {
      type: 'string',
      props: { label: translateMethod('Id') },
    },
    enabled: {
      type: 'bool',
      props: { label: translateMethod('Enabled') },
    },
    name: {
      type: 'string',
      props: { label: translateMethod('Name') },
    },
    domain: {
      type: 'string',
      props: { label: translateMethod('Domain name') },
    },
    defaultLanguage: {
      type: 'select',
      props: {
        label: translateMethod('Default language'),
        possibleValues: languages,
      },
    },
    contact: {
      type: 'string',
      props: {
        label: translateMethod('Contact'),
      },
    },
    'style.title': {
      type: 'string',
      props: { label: translateMethod('Title') },
    },
    'style.description': {
      type: 'markdown',
      props: { label: translateMethod('Description') },
    },
    'style.homePageVisible': {
      type: HomePageVisibilitySwitch,
      props: {
        label: translateMethod('Enabled'),
      },
    },
    'style.homeCmsPage': {
      type: 'select',
      visible: () => state.tenant?.style.homePageVisible,
      props: {
        isClearable: true,
        label: translateMethod('tenant_edit.home_page'),
        disabled: !state.tenant?.style.homePageVisible,
        possibleValues: cmsPages.map(t => ({ label: `${t.name}`, value: t.id }))
      }
    },
    'style.notFoundCmsPage': {
      type: 'select',
      visible: () => state.tenant?.style.homePageVisible,
      props: {
        isClearable: true,
        label: translateMethod('tenant_edit.404_page'),
        disabled: !state.tenant?.style.homePageVisible,
        possibleValues: cmsPages.map(t => ({ label: `${t.name}`, value: t.id }))
      }
    },
    'style.authenticatedCmsPage': {
      type: 'select',
      visible: () => state.tenant?.style.homePageVisible,
      props: {
        isClearable: true,
        label: translateMethod('tenant_edit.authenticated_cmspage'),
        help: translateMethod('tenant_edit.authenticated_cmspage_help'),
        disabled: !state.tenant?.style.homePageVisible,
        possibleValues: cmsPages.map(t => ({ label: `${t.name}`, value: t.id }))
      }
    },
    'style.cacheTTL': {
      type: 'number',
      visible: () => state.tenant?.style.homePageVisible,
      props: {
        label: translateMethod('tenant_edit.cache'),
        help: translateMethod('tenant_edit.cache_help'),
        disabled: !state.tenant?.style.homePageVisible
      }
    },
    'style.cmsHistoryLength': {
      type: 'number',
      visible: () => state.tenant?.style.homePageVisible,
      props: {
        label: translateMethod('tenant_edit.cms_history_length'),
        help: translateMethod('tenant_edit.cms_history_length.help')
      }
    },
    linkToCmsPages: {
      type: () => (
        <div className="mb-3 row">
          <label className="col-xs-12 col-sm-2 col-form-label" />
          <div className="col-sm-10">
            <>
              <Link to="/settings/pages" className='btn btn-sm btn-outline-success'>
                <Translation i18nkey="tenant_edit.link_to_cmspages" />
              </Link>
              {state.tenant?.style.homePageVisible && state.tenant?.style?.homeCmsPage &&
                <button className='btn btn-sm btn-outline-primary ms-1'
                  type='button'
                  onClick={() => {
                    client.query({
                      query: gql`
                query GetCmsPage {
                    cmsPage(id: "${state.tenant?.style.homeCmsPage}") {
                        path
                    }
                }`}).then(r => window.open(`/_${r.data.cmsPage.path}`, '_blank'))
                  }}>
                  <Translation i18nkey="tenant_edit.view_home_page" />
                </button>}
            </>
          </div>
        </div>
      )
    },
    'style.logo': {
      type: 'string',
      props: { label: translateMethod('Logo') },
    },
    'style.logoFromAssets': {
      type: StyleLogoAssetButton,
      props: {
        tenant: () => state.tenant,
        onChangeLogo: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.cssUrlFromAssets': {
      type: StyleCssUrlAssetButton,
      props: {
        tenant: () => state.tenant,
        onChangeLogo: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.jsUrlFromAssets': {
      type: StyleJsUrlAssetButton,
      props: {
        tenant: () => state.tenant,
        onChangeLogo: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.faviconUrlFromAssets': {
      type: StyleFaviconUrlAssetButton,
      props: {
        tenant: () => state.tenant,
        onChangeLogo: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.css': {
      type: 'text',
      props: { label: translateMethod('CSS') },
    },
    'style.colorTheme': {
      type: 'text',
      props: { label: translateMethod('CSS color theme') },
    },
    'style.colorThemeFromUI': {
      type: ThemeUpdatorFromUI,
      props: {
        tenant: () => state.tenant,
        save: () => save(),
        isTenantUpdated: () => !!state.updated,
        openModal: (p) => props.openSaveOrCancelModal({ ...p }),
      },
    },
    'style.js': {
      type: 'text',
      props: { label: translateMethod('Javascript') },
    },
    'style.jsUrl': {
      type: 'string',
      props: { label: translateMethod('Js URL') },
    },
    'style.cssUrl': {
      type: 'string',
      props: { label: translateMethod('CSS URL') },
    },
    'style.faviconUrl': {
      type: 'string',
      props: { label: translateMethod('Favicon URL') },
    },
    'style.fontFamilyUrl': {
      type: 'string',
      props: { label: translateMethod('Font family') },
    },
    'style.fontFamilyUrlFromAssets': {
      type: StyleFontFamilyUrlAssetButton,
      props: {
        tenant: () => state.tenant,
        onChangeFont: (obj) => {
          console.log(obj);
        },
      },
    },
    'style.footer': {
      type: 'markdown',
      props: { label: translateMethod('Footer') },
    },
    defaultMessage: {
      type: 'markdown',
      props: { label: translateMethod('Default message') },
    },
    isPrivate: {
      type: 'bool',
      props: {
        label: translateMethod('Private tenant'),
      },
    },
    authProvider: {
      type: 'select',
      props: {
        label: translateMethod('Authentication type'),
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
        label: translateMethod('Settings'),
      },
    },
    creationSecurity: {
      type: 'bool',
      props: {
        label: translateMethod('creation security'),
        help: translateMethod(
          'creation.security.help',
          false,
          'if enabled, only authorized teams will be able to create APIs'
        ),
      },
    },
    subscriptionSecurity: {
      type: 'bool',
      props: {
        label: translateMethod('subscription security'),
        help: translateMethod(
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
          label={translateMethod('aggregation api keys security')}
          help={translateMethod('aggregation_apikeys.security.help')}
          onChange={(e) => {
            if (e)
              window.alert(
                translateMethod('aggregation.api_key.security.notification'),
                undefined,
                undefined,
                translateMethod('I understood'),
                language
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
        label: translateMethod('Api reference visibility'),
        help: translateMethod(
          'appi.reference.visibility.help',
          false,
          "if enabled, guest user can't see api reference on public api"
        ),
      },
    },
    hideTeamsPage: {
      type: 'bool',
      props: {
        label: translateMethod('Hide teams page'),
        help: translateMethod(
          'hide.teams.page.help',
          false,
          'if enabled, /teams will be inaccessible'
        ),
      },
    },
    'mailerSettings.type': {
      type: 'select',
      props: {
        label: translateMethod('Mailer type'),
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
        label: translateMethod('Mailer'),
        tenant: () => state.tenant,
        save: () => save(),
        isTenantUpdated: () => !!state.updated,
        openModal: (p) => props.openSaveOrCancelModal({ ...p }),
      },
    },
    'daikokuHeader.name': {
      type: 'string',
      props: { label: translateMethod('Header name') },
      disabled: true,
    },
    'daikokuHeader.value': {
      type: 'string',
      props: { label: translateMethod('Header value') },
      disabled: true,
    },
    'auditTrailConfig.auditWebhooks': {
      type: LazyFormInput,
      props: { flow: webhooksFormFlow, schema: webhooksFormSchema },
    },
    'auditTrailConfig.alertsEmails': {
      type: 'array',
      props: {
        label: translateMethod('Alert emails'),
        placeholder: translateMethod('Email address to receive alerts'),
        help: translateMethod(
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
        label: translateMethod('Kafka Servers'),
        placeholder: '127.0.0.1:9092',
        help: translateMethod(
          'kafka.servers.help',
          false,
          'The list of servers to contact to connect the Kafka client with the Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.keyPass': {
      type: 'string',
      props: {
        label: translateMethod('Kafka keypass'),
        placeholder: translateMethod('Secret'),
        help: translateMethod(
          'kafka.secret.help',
          false,
          'The keystore password if you use a keystore/truststore to connect to Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.keystore': {
      type: 'string',
      props: {
        label: translateMethod('Kafka keystore path'),
        placeholder: '/home/bas/client.keystore.jks',
        help: translateMethod(
          'kafka.keystore.path.help',
          false,
          'The keystore path on the server if you use a keystore/truststore to connect to Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.truststore': {
      type: 'string',
      props: {
        label: translateMethod('Kafka truststore path'),
        placeholder: '/home/bas/client.truststore.jks',
        help: translateMethod(
          'kafka.truststore.path.help',
          false,
          'The truststore path on the server if you use a keystore/truststore to connect to Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.auditTopic': {
      type: 'string',
      props: {
        label: translateMethod('Kafka audits topic'),
        placeholder: translateMethod('daikoku-audit'),
        help: translateMethod(
          'kafka.audit.topic.help',
          false,
          'The topic on which Otoroshi audits will be sent'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.hostValidation': {
      type: 'bool',
      props: {
        label: translateMethod('Kafka host validation'),
        help: translateMethod(
          'kafka.audit.hostValidation.help',
          false,
          'Disable kafka to validate server hostname using server certificate.'
        ),
      },
    },
    'bucketSettings.bucket': {
      type: 'string',
      props: {
        label: translateMethod('Bucket name'),
        placeholder: 'daikoku-tenant-1',
        help: translateMethod('The name of the S3 bucket'),
      },
    },
    'bucketSettings.endpoint': {
      type: 'string',
      props: {
        label: translateMethod('Bucket url'),
        help: translateMethod('The url of the bucket'),
      },
    },
    'bucketSettings.region': {
      type: 'string',
      props: {
        label: translateMethod('S3 region'),
        placeholder: 'us-west-2',
        help: translateMethod('The region of the bucket'),
      },
    },
    'bucketSettings.access': {
      type: 'string',
      props: {
        label: translateMethod('Bucket access key'),
        help: translateMethod('The access key to access bucket'),
      },
    },
    'bucketSettings.secret': {
      type: 'string',
      props: {
        label: translateMethod('Bucket secret'),
        help: translateMethod('The secret to access the bucket'),
      },
    },
    'bucketSettings.chunkSize': {
      type: 'number',
      props: {
        label: translateMethod('Chunk size'),
        placeholder: 1024 * 1024 * 8,
        help: translateMethod('The size of each chunk sent'),
      },
    },
    'bucketSettings.v4auth': {
      type: 'bool',
      props: {
        label: translateMethod('Use V4 auth.'),
      },
    },
    tenantMode: {
      type: 'select',
      props: {
        label: translateMethod('Mode'),
        possibleValues: [
          { label: translateMethod('Default mode'), value: 'default' },
          { label: translateMethod('Maintenance mode'), value: 'maintenance' },
          { label: translateMethod('Construction mode'), value: 'construction' },
        ],
      },
    },
    robotTxt: {
      type: 'text',
      props: {
        label: translateMethod('Robot.txt.label'),
        Help: translateMethod('Robot.txt.help'),
      },
    },
  };

  useEffect(() => {
    if (location && location.state && location.state.newTenant) {
      setState({
        ...state,
        tenant: {
          ...location.state.newTenant,
          bucketSettings: location.state.newTenant.bucketSettings || {},
        },
        create: true,
      });
    } else {
      Services.oneTenant(params.tenantId).then((tenant) => {
        setState({
          ...state,
          tenant: { ...tenant, bucketSettings: tenant.bucketSettings || {} },
        });
      });
    }
  }, []);

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
              translateMethod(
                'tenant.created.success',
                false,
                `Tenant "${tenant.name}" created`,
                tenant.name
              )
            )
        );
      });
    } else {
      if (state.tenant.tenantMode === 'translation') {
        window.alert(<p>{translateMethod('tenant_edit.translation_mode_message')}</p>);
        setTranslationMode(true);
      }
      return Services.saveTenant(state.tenant)
        .then(({ uiPayload }) => props.updateTenant(uiPayload))
        .then(() => toastr.success(translateMethod('Tenant updated successfully')));
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
                  src={state.tenant?.style?.logo}
                  alt="avatar"
                />
              </div>
              <h1 className="h1-rwd-reduce ms-2">{state.tenant.name}</h1>
            </div>
            <React.Suspense fallback={<Spinner />}>
              <LazyForm
                flow={flow}
                schema={schema}
                value={state.tenant}
                onChange={(tenant) => setState({ ...state, tenant, updated: true })}
                style={{ marginBottom: 100, paddingTop: 20 }}
              />
            </React.Suspense>
            <div style={{ height: 60 }} />
            <div className="d-flex form-back-fixedBtns">
              <Link className="btn btn-outline-primary me-1" to={'/settings/tenants'}>
                <i className="fas fa-chevron-left me-1" />
                <Translation i18nkey="Back">Back</Translation>
              </Link>
              <button
                type="button"
                className="btn btn-outline-success"
                {...disabled}
                onClick={save}
              >
                {!state.create && (
                  <span>
                    <i className="fas fa-save me-1" />
                    <Translation i18nkey="Save">Save</Translation>
                  </span>
                )}
                {state.create && (
                  <span>
                    <i className="fas fa-save me-1" />
                    <Translation i18nkey="Create">Create</Translation>
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
