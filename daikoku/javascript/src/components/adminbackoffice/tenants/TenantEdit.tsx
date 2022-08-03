import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
import { AssetChooserByModal, MimeTypeFilter } from '../../frontend';

import * as Services from '../../../services';

import { LDAPConfig, LocalConfig, OAuth2Config, OtoroshiConfig } from './auth';
import {
  ConsoleConfig,
  MailgunConfig,
  MailjetConfig,
  SmtpClientConfig,
  SendGridConfig,
} from './mailer';
import { Can, manage, tenant as TENANT, Spinner } from '../../utils';
// @ts-expect-error TS(6142): Module '../../inputs/BooleanInput' was resolved to... Remove this comment to see the full error message
import { BooleanInput } from '../../inputs/BooleanInput';
// @ts-expect-error TS(6142): Module '../../../locales/i18n-context' was resolve... Remove this comment to see the full error message
import { I18nContext } from '../../../locales/i18n-context';
import { getApolloContext, gql } from '@apollo/client';
import { updateTenant } from '../../../core';
import { useDaikokuBackOffice, useTenantBackOffice } from '../../../contexts';

// @ts-expect-error TS(6142): Module '../../inputs/Form' was resolved to '/Users... Remove this comment to see the full error message
const LazyForm = React.lazy(() => import('../../inputs/Form'));

const LazyFormInput = (props: any) => {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <React.Suspense fallback={<Spinner />}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <LazyForm {...props} />
    </React.Suspense>
  );
};

const AuthConfig = (props: any) => {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);

  if (props.rawValue.authProvider === 'Local') {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <LocalConfig {...props} />;
  } else if (props.rawValue.authProvider === 'Otoroshi') {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <OtoroshiConfig {...props} />;
  } else if (props.rawValue.authProvider === 'LDAP') {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <LDAPConfig {...props} />;
  } else if (props.rawValue.authProvider === 'OAuth2') {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <OAuth2Config {...props} />;
  } else {
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <span>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Unsupported auth. type">Unsupported auth. type</Translation> (
        {props.rawValue.authProvider})
      </span>
    );
  }
};

const MailerConfig = (props: any) => {
  const { rawValue } = props;
  const mailerSettings = rawValue.mailerSettings;

  if (!mailerSettings) return null;

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  if (mailerSettings.type === 'console') return <ConsoleConfig {...props} />;
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  else if (mailerSettings.type === 'mailgun') return <MailgunConfig {...props} />;
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  else if (mailerSettings.type === 'mailjet') return <MailjetConfig {...props} />;
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  else if (mailerSettings.type === 'smtpClient') return <SmtpClientConfig {...props} />;
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  else if (mailerSettings.type === 'sendgrid') return <SendGridConfig {...props} />;
  else return null;
};

const StyleLogoAssetButton = (props: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 d-flex justify-content-end">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <AssetChooserByModal
        // @ts-expect-error TS(2322): Type '{ typeFilter: (value: any) => any; onlyPrevi... Remove this comment to see the full error message
        typeFilter={MimeTypeFilter.image}
        onlyPreview
        tenantMode
        label={translateMethod('Set tenant logo from asset')}
        onSelect={(asset: any) => props.changeValue('style.logo', origin + asset.link)}
      />
    </div>
  );
};

const StyleJsUrlAssetButton = (props: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 d-flex justify-content-end">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <AssetChooserByModal
        // @ts-expect-error TS(2322): Type '{ typeFilter: (value: any) => boolean; tenan... Remove this comment to see the full error message
        typeFilter={MimeTypeFilter.javascript}
        tenantMode
        label={translateMethod('Set js from asset')}
        onSelect={(asset: any) => props.changeValue('style.jsUrl', origin + asset.link)}
      />
    </div>
  );
};

const StyleCssUrlAssetButton = (props: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 d-flex justify-content-end">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <AssetChooserByModal
        // @ts-expect-error TS(2322): Type '{ typeFilter: (value: any) => boolean; tenan... Remove this comment to see the full error message
        typeFilter={MimeTypeFilter.css}
        tenantMode
        label={translateMethod('Set css from asset')}
        onSelect={(asset: any) => props.changeValue('style.cssUrl', origin + asset.link)}
      />
    </div>
  );
};

const StyleFaviconUrlAssetButton = (props: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 d-flex justify-content-end">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <AssetChooserByModal
        // @ts-expect-error TS(2322): Type '{ typeFilter: (value: any) => any; onlyPrevi... Remove this comment to see the full error message
        typeFilter={MimeTypeFilter.image}
        onlyPreview
        tenantMode
        label={translateMethod('Set favicon from asset')}
        onSelect={(asset: any) => props.changeValue('style.faviconUrl', origin + asset.link)}
      />
    </div>
  );
};

const StyleFontFamilyUrlAssetButton = (props: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const tenant = props.tenant ? props.tenant() : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 d-flex justify-content-end">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <AssetChooserByModal
        // @ts-expect-error TS(2322): Type '{ typeFilter: (value: any) => boolean; tenan... Remove this comment to see the full error message
        typeFilter={MimeTypeFilter.font}
        tenantMode
        label={translateMethod('Set font family from asset')}
        onSelect={(asset: any) => props.changeValue('style.fontFamilyUrl', origin + asset.link + '?streamed=true')
        }
      />
    </div>
  );
};

const ThemeUpdatorFromUI = (props: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);
  const navigate = useNavigate();

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 d-flex justify-content-end">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <button
        type="button"
        className="btn btn-access-negative"
        onClick={() => {
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
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Set Color Theme from UI">Set Color Theme from UI</Translation>
      </button>
    </div>
  );
};

const HomePageVisibilitySwitch = (props: any) => {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <BooleanInput
      key="style.homePageVisible"
      {...props}
      value={props.rawValue.style.homePageVisible}
      onChange={(v: any) => props.changeValue('style.homePageVisible', v)}
    />
  );
};

const TenantEdition = (props: any) => {
  const { tenant } = useSelector((s) => (s as any).context);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, language, Translation, languages, setTranslationMode } =
    useContext(I18nContext);

  const params = useParams();
  const location = useLocation();
  const dispatch = useDispatch();

  const [state, setState] = useState({
    tenant: null,
    create: false,
    updated: false,
  });

  const [cmsPages, setCmsPages] = useState([]);

  const { client } = useContext(getApolloContext());

  useEffect(() => {
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    client
      .query({
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
      .then((r) => setCmsPages(r.data.pages));
  }, []);

  const flow = [
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
        visible: () => (state.tenant as any)?.style?.homePageVisible,
        props: {
            isClearable: true,
            label: translateMethod('tenant_edit.home_page'),
            disabled: !(state.tenant as any)?.style?.homePageVisible,
            possibleValues: cmsPages.map((t) => ({ label: `${(t as any).name}`, value: (t as any).id })),
        },
    },
    'style.notFoundCmsPage': {
        type: 'select',
        visible: () => (state.tenant as any)?.style?.homePageVisible,
        props: {
            isClearable: true,
            label: translateMethod('tenant_edit.404_page'),
            disabled: !(state.tenant as any)?.style?.homePageVisible,
            possibleValues: cmsPages.map((t) => ({ label: `${(t as any).name}`, value: (t as any).id })),
        },
    },
    'style.authenticatedCmsPage': {
        type: 'select',
        visible: () => (state.tenant as any)?.style?.homePageVisible,
        props: {
            isClearable: true,
            label: translateMethod('tenant_edit.authenticated_cmspage'),
            help: translateMethod('tenant_edit.authenticated_cmspage_help'),
            disabled: !(state.tenant as any)?.style?.homePageVisible,
            possibleValues: cmsPages.map((t) => ({ label: `${(t as any).name}`, value: (t as any).id })),
        },
    },
    'style.cacheTTL': {
        type: 'number',
        visible: () => (state.tenant as any)?.style?.homePageVisible,
        props: {
            label: translateMethod('tenant_edit.cache'),
            help: translateMethod('tenant_edit.cache_help'),
            disabled: !(state.tenant as any)?.style?.homePageVisible,
        },
    },
    'style.cmsHistoryLength': {
        type: 'number',
        visible: () => (state.tenant as any)?.style?.homePageVisible,
        props: {
            label: translateMethod('tenant_edit.cms_history_length'),
            help: translateMethod('tenant_edit.cms_history_length.help'),
        },
    },
    linkToCmsPages: {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        type: () => (<div className="mb-3 row">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <label className="col-xs-12 col-sm-2 col-form-label"/>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="col-sm-10">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Link to="/settings/pages" className="btn btn-sm btn-outline-success">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="tenant_edit.link_to_cmspages"/>
              </Link>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {(state.tenant as any)?.style.homePageVisible && (state.tenant as any)?.style?.homeCmsPage && (<button className="btn btn-sm btn-outline-primary ms-1" type="button" onClick={() => {
                    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                    client
                        .query({
                        query: gql `
                query GetCmsPage {
                    cmsPage(id: "${state.tenant?.                    
// @ts-expect-error TS(2339): Property 'style' does not exist on type 'never'.
style.homeCmsPage}") {
                        path
                    }
                }`,
                    })
                        .then((r) => window.open(`/_${r.data.cmsPage.path}`, '_blank'));
                }}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="tenant_edit.view_home_page"/>
                </button>)}
            </>
          </div>
        </div>),
    },
    'style.logo': {
        type: 'string',
        props: { label: translateMethod('Logo') },
    },
    'style.logoFromAssets': {
        type: StyleLogoAssetButton,
        props: {
            tenant: () => state.tenant,
            onChangeLogo: (obj: any) => {
                console.log(obj);
            },
        },
    },
    'style.cssUrlFromAssets': {
        type: StyleCssUrlAssetButton,
        props: {
            tenant: () => state.tenant,
            onChangeLogo: (obj: any) => {
                console.log(obj);
            },
        },
    },
    'style.jsUrlFromAssets': {
        type: StyleJsUrlAssetButton,
        props: {
            tenant: () => state.tenant,
            onChangeLogo: (obj: any) => {
                console.log(obj);
            },
        },
    },
    'style.faviconUrlFromAssets': {
        type: StyleFaviconUrlAssetButton,
        props: {
            tenant: () => state.tenant,
            onChangeLogo: (obj: any) => {
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
            openModal: (p: any) => props.openSaveOrCancelModal({ ...p })(dispatch),
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
            onChangeFont: (obj: any) => {
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
            help: translateMethod('creation.security.help', false, 'if enabled, only authorized teams will be able to create APIs'),
        },
    },
    subscriptionSecurity: {
        type: 'bool',
        props: {
            label: translateMethod('subscription security'),
            help: translateMethod('subscription.security.help', false, 'if enabled, personnal teams will not be able to subscribed to an API'),
        },
    },
    aggregationApiKeysSecurity: {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        type: () => (<BooleanInput key="aggregationApiKeysSecurity" value={state.tenant.aggregationApiKeysSecurity} label={translateMethod('aggregation api keys security')} help={translateMethod('aggregation_apikeys.security.help')} onChange={(e: any) => {
                if (e)
                    // @ts-expect-error TS(2554): Expected 0-1 arguments, but got 5.
                    window.alert(translateMethod('aggregation.api_key.security.notification'), undefined, undefined, translateMethod('I understood'), language);
                setState({
                    ...state,
                    tenant: {
                        // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
                        ...state.tenant,
                        aggregationApiKeysSecurity: e,
                    },
                });
            }}/>),
    },
    apiReferenceHideForGuest: {
        type: 'bool',
        props: {
            label: translateMethod('Api reference visibility'),
            help: translateMethod('appi.reference.visibility.help', false, "if enabled, guest user can't see api reference on public api"),
        },
    },
    hideTeamsPage: {
        type: 'bool',
        props: {
            label: translateMethod('Hide teams page'),
            help: translateMethod('hide.teams.page.help', false, 'if enabled, /teams will be inaccessible'),
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
            openModal: (p: any) => props.openSaveOrCancelModal({ ...p })(dispatch),
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
            help: translateMethod('Alert.email.help', false, 'Every email address will be notified with a summary of Otoroshi alerts'),
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
            help: translateMethod('kafka.servers.help', false, 'The list of servers to contact to connect the Kafka client with the Kafka cluster'),
        },
    },
    'auditTrailConfig.kafkaConfig.keyPass': {
        type: 'string',
        props: {
            label: translateMethod('Kafka keypass'),
            placeholder: translateMethod('Secret'),
            help: translateMethod('kafka.secret.help', false, 'The keystore password if you use a keystore/truststore to connect to Kafka cluster'),
        },
    },
    'auditTrailConfig.kafkaConfig.keystore': {
        type: 'string',
        props: {
            label: translateMethod('Kafka keystore path'),
            placeholder: '/home/bas/client.keystore.jks',
            help: translateMethod('kafka.keystore.path.help', false, 'The keystore path on the server if you use a keystore/truststore to connect to Kafka cluster'),
        },
    },
    'auditTrailConfig.kafkaConfig.truststore': {
        type: 'string',
        props: {
            label: translateMethod('Kafka truststore path'),
            placeholder: '/home/bas/client.truststore.jks',
            help: translateMethod('kafka.truststore.path.help', false, 'The truststore path on the server if you use a keystore/truststore to connect to Kafka cluster'),
        },
    },
    'auditTrailConfig.kafkaConfig.auditTopic': {
        type: 'string',
        props: {
            label: translateMethod('Kafka audits topic'),
            placeholder: translateMethod('daikoku-audit'),
            help: translateMethod('kafka.audit.topic.help', false, 'The topic on which Otoroshi audits will be sent'),
        },
    },
    'auditTrailConfig.kafkaConfig.hostValidation': {
        type: 'bool',
        props: {
            label: translateMethod('Kafka host validation'),
            help: translateMethod('kafka.audit.hostValidation.help', false, 'Disable kafka to validate server hostname using server certificate.'),
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
                    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                    client
    .query({
    query: gql `
                query GetCmsPage {
                    cmsPage(id: "${(state.tenant as any)?.style.homeCmsPage}") {
                        path
                    }
                }`,
})
    .then((r) => window.open(`/_${r.data.cmsPage.path}`, '_blank'));
                  }}
                >
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <Translation i18nkey="tenant_edit.view_home_page" />
                // @ts-expect-error TS(2304): Cannot find name 'button'.
                </button>
              )}
            </>
          // @ts-expect-error TS(2304): Cannot find name 'div'.
          </div>
        // @ts-expect-error TS(2304): Cannot find name 'div'.
        </div>
      ),
    },
    'style.logo': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { label: translateMethod('Logo') },
    },
    'style.logoFromAssets': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: StyleLogoAssetButton,
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
        tenant: () => state.tenant,
        // @ts-expect-error TS(2304): Cannot find name 'onChangeLogo'.
        onChangeLogo: (obj: any) => {
          console.log(obj);
        },
      },
    },
    'style.cssUrlFromAssets': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: StyleCssUrlAssetButton,
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
        tenant: () => state.tenant,
        // @ts-expect-error TS(2304): Cannot find name 'onChangeLogo'.
        onChangeLogo: (obj: any) => {
          console.log(obj);
        },
      },
    },
    'style.jsUrlFromAssets': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: StyleJsUrlAssetButton,
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
        tenant: () => state.tenant,
        // @ts-expect-error TS(2304): Cannot find name 'onChangeLogo'.
        onChangeLogo: (obj: any) => {
          console.log(obj);
        },
      },
    },
    'style.faviconUrlFromAssets': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: StyleFaviconUrlAssetButton,
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
        tenant: () => state.tenant,
        // @ts-expect-error TS(2304): Cannot find name 'onChangeLogo'.
        onChangeLogo: (obj: any) => {
          console.log(obj);
        },
      },
    },
    'style.css': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'text',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { label: translateMethod('CSS') },
    },
    'style.colorTheme': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'text',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { label: translateMethod('CSS color theme') },
    },
    'style.colorThemeFromUI': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: ThemeUpdatorFromUI,
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
        tenant: () => state.tenant,
        // @ts-expect-error TS(2448): Block-scoped variable 'save' used before its decla... Remove this comment to see the full error message
        save: () => save(),
        // @ts-expect-error TS(2304): Cannot find name 'isTenantUpdated'.
        isTenantUpdated: () => !!state.updated,
        // @ts-expect-error TS(2304): Cannot find name 'openModal'.
        openModal: (p: any) => props.openSaveOrCancelModal({ ...p })(dispatch),
      },
    },
    'style.js': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'text',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { label: translateMethod('Javascript') },
    },
    'style.jsUrl': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { label: translateMethod('Js URL') },
    },
    'style.cssUrl': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { label: translateMethod('CSS URL') },
    },
    'style.faviconUrl': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { label: translateMethod('Favicon URL') },
    },
    'style.fontFamilyUrl': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { label: translateMethod('Font family') },
    },
    'style.fontFamilyUrlFromAssets': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: StyleFontFamilyUrlAssetButton,
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
        tenant: () => state.tenant,
        // @ts-expect-error TS(2304): Cannot find name 'onChangeFont'.
        onChangeFont: (obj: any) => {
          console.log(obj);
        },
      },
    },
    'style.footer': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'markdown',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { label: translateMethod('Footer') },
    },
    defaultMessage: {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'markdown',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { label: translateMethod('Default message') },
    },
    isPrivate: {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'bool',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Private tenant'),
      },
    },
    authProvider: {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'select',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Authentication type'),
        // @ts-expect-error TS(2304): Cannot find name 'possibleValues'.
        possibleValues: [
          { label: 'Local', value: 'Local' },
          { label: 'LDAP', value: 'LDAP' },
          { label: 'OAuth2', value: 'OAuth2' },
          { label: 'Otoroshi', value: 'Otoroshi' },
        ],
      },
    },
    authProviderSettings: {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: AuthConfig,
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Settings'),
      },
    },
    creationSecurity: {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'bool',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('creation security'),
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod(
          'creation.security.help',
          false,
          'if enabled, only authorized teams will be able to create APIs'
        ),
      },
    },
    subscriptionSecurity: {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'bool',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('subscription security'),
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod(
          'subscription.security.help',
          false,
          'if enabled, personnal teams will not be able to subscribed to an API'
        ),
      },
    },
    aggregationApiKeysSecurity: {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: () => (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <BooleanInput
          key="aggregationApiKeysSecurity"
          // @ts-expect-error TS(2769): No overload matches this call.
          value={state.tenant.aggregationApiKeysSecurity}
          // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
          label={translateMethod('aggregation api keys security')}
          // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
          help={translateMethod('aggregation_apikeys.security.help')}
          onChange={(e: any) => {
            if (e)
              window.alert(
                // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
                translateMethod('aggregation.api_key.security.notification'),
                // @ts-expect-error TS(2554): Expected 0-1 arguments, but got 5.
                undefined,
                undefined,
                // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
                translateMethod('I understood'),
                // @ts-expect-error TS(2304): Cannot find name 'language'.
                language
              );

            // @ts-expect-error TS(2304): Cannot find name 'setState'.
            setState({
              // @ts-expect-error TS(2304): Cannot find name 'state'.
              ...state,
              tenant: {
                // @ts-expect-error TS(2304): Cannot find name 'state'.
                ...state.tenant,
                aggregationApiKeysSecurity: e,
              },
            });
          }}
        />
      ),
    },
    apiReferenceHideForGuest: {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'bool',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Api reference visibility'),
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod(
          'appi.reference.visibility.help',
          false,
          "if enabled, guest user can't see api reference on public api"
        ),
      },
    },
    hideTeamsPage: {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'bool',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Hide teams page'),
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod(
          'hide.teams.page.help',
          false,
          'if enabled, /teams will be inaccessible'
        ),
      },
    },
    'mailerSettings.type': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'select',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Mailer type'),
        // @ts-expect-error TS(2304): Cannot find name 'possibleValues'.
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
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: MailerConfig,
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Mailer'),
        // @ts-expect-error TS(2304): Cannot find name 'tenant'.
        tenant: () => state.tenant,
        // @ts-expect-error TS(2448): Block-scoped variable 'save' used before its decla... Remove this comment to see the full error message
        save: () => save(),
        // @ts-expect-error TS(2304): Cannot find name 'isTenantUpdated'.
        isTenantUpdated: () => !!state.updated,
        // @ts-expect-error TS(2304): Cannot find name 'openModal'.
        openModal: (p: any) => props.openSaveOrCancelModal({ ...p })(dispatch),
      },
    },
    'daikokuHeader.name': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { label: translateMethod('Header name') },
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      disabled: true,
    },
    'daikokuHeader.value': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { label: translateMethod('Header value') },
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      disabled: true,
    },
    'auditTrailConfig.auditWebhooks': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: LazyFormInput,
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: { flow: webhooksFormFlow, schema: webhooksFormSchema },
    },
    'auditTrailConfig.alertsEmails': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'array',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Alert emails'),
        // @ts-expect-error TS(2304): Cannot find name 'placeholder'.
        placeholder: translateMethod('Email address to receive alerts'),
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod(
          'Alert.email.help',
          false,
          'Every email address will be notified with a summary of Otoroshi alerts'
        ),
      },
    },
    'auditTrailConfig.elasticConfigs': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: LazyFormInput,
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'elasticConfigFormFlow'.
        flow: elasticConfigFormFlow,
        // @ts-expect-error TS(2304): Cannot find name 'schema'.
        schema: elasticConfigFormSchema,
      },
    },
    'auditTrailConfig.kafkaConfig.servers': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'array',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Kafka Servers'),
        // @ts-expect-error TS(2304): Cannot find name 'placeholder'.
        placeholder: '127.0.0.1:9092',
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod(
          'kafka.servers.help',
          false,
          'The list of servers to contact to connect the Kafka client with the Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.keyPass': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Kafka keypass'),
        // @ts-expect-error TS(2304): Cannot find name 'placeholder'.
        placeholder: translateMethod('Secret'),
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod(
          'kafka.secret.help',
          false,
          'The keystore password if you use a keystore/truststore to connect to Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.keystore': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Kafka keystore path'),
        // @ts-expect-error TS(2304): Cannot find name 'placeholder'.
        placeholder: '/home/bas/client.keystore.jks',
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod(
          'kafka.keystore.path.help',
          false,
          'The keystore path on the server if you use a keystore/truststore to connect to Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.truststore': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Kafka truststore path'),
        // @ts-expect-error TS(2304): Cannot find name 'placeholder'.
        placeholder: '/home/bas/client.truststore.jks',
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod(
          'kafka.truststore.path.help',
          false,
          'The truststore path on the server if you use a keystore/truststore to connect to Kafka cluster'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.auditTopic': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Kafka audits topic'),
        // @ts-expect-error TS(2304): Cannot find name 'placeholder'.
        placeholder: translateMethod('daikoku-audit'),
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod(
          'kafka.audit.topic.help',
          false,
          'The topic on which Otoroshi audits will be sent'
        ),
      },
    },
    'auditTrailConfig.kafkaConfig.hostValidation': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'bool',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Kafka host validation'),
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod(
          'kafka.audit.hostValidation.help',
          false,
          'Disable kafka to validate server hostname using server certificate.'
        ),
      },
    },
    'bucketSettings.bucket': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Bucket name'),
        // @ts-expect-error TS(2304): Cannot find name 'placeholder'.
        placeholder: 'daikoku-tenant-1',
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod('The name of the S3 bucket'),
      },
    },
    'bucketSettings.endpoint': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Bucket url'),
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod('The url of the bucket'),
      },
    },
    'bucketSettings.region': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('S3 region'),
        // @ts-expect-error TS(2304): Cannot find name 'placeholder'.
        placeholder: 'us-west-2',
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod('The region of the bucket'),
      },
    },
    'bucketSettings.access': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Bucket access key'),
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod('The access key to access bucket'),
      },
    },
    'bucketSettings.secret': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'string',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Bucket secret'),
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod('The secret to access the bucket'),
      },
    },
    'bucketSettings.chunkSize': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'number',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Chunk size'),
        // @ts-expect-error TS(2304): Cannot find name 'placeholder'.
        placeholder: 1024 * 1024 * 8,
        // @ts-expect-error TS(2304): Cannot find name 'help'.
        help: translateMethod('The size of each chunk sent'),
      },
    },
    'bucketSettings.v4auth': {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'bool',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Use V4 auth.'),
      },
    },
    tenantMode: {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'select',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Mode'),
        // @ts-expect-error TS(2304): Cannot find name 'possibleValues'.
        possibleValues: [
          // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
          { label: translateMethod('Default mode'), value: 'default' },
          // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
          { label: translateMethod('Maintenance mode'), value: 'maintenance' },
          // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
          { label: translateMethod('Construction mode'), value: 'construction' },
        ],
      },
    },
    robotTxt: {
      // @ts-expect-error TS(2695): Left side of comma operator is unused and has no s... Remove this comment to see the full error message
      type: 'text',
      // @ts-expect-error TS(2304): Cannot find name 'props'.
      props: {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        label: translateMethod('Robot.txt.label'),
        // @ts-expect-error TS(2304): Cannot find name 'Help'.
        Help: translateMethod('Robot.txt.help'),
      },
    },
  };

  useEffect(() => {
    // @ts-expect-error TS(2339): Property 'state' does not exist on type 'Location'... Remove this comment to see the full error message
    if (location && location.state && (location as any).state.newTenant) {
      // @ts-expect-error TS(2304): Cannot find name 'setState'.
      setState({
    // @ts-expect-error TS(2304): Cannot find name 'state'.
    ...state,
    tenant: {
        ...(location as any).state.newTenant,
        bucketSettings: (location as any).state.newTenant.bucketSettings || {},
    },
    create: true,
});
    } else {
      // @ts-expect-error TS(2304): Cannot find name 'params'.
      Services.oneTenant(params.tenantId || props.tenant._humanReadableId).then((tenant) => {
        // @ts-expect-error TS(2304): Cannot find name 'setState'.
        setState({
          // @ts-expect-error TS(2304): Cannot find name 'state'.
          ...state,
          tenant: { ...tenant, bucketSettings: tenant.bucketSettings || {} },
        });
      });
    }
  }, []);

  const save = () => {
    // @ts-expect-error TS(2304): Cannot find name 'state'.
    if (state.create) {
      // @ts-expect-error TS(2304): Cannot find name 'state'.
      return Services.createTenant(state.tenant).then((tenant) => {
        // @ts-expect-error TS(2304): Cannot find name 'setState'.
        setState(
          {
            // @ts-expect-error TS(2304): Cannot find name 'state'.
            ...state,
            create: false,
            tenant: { ...tenant, bucketSettings: tenant.bucketSettings || {} },
          },
          () =>
            toastr.success(
              // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
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
      // @ts-expect-error TS(2304): Cannot find name 'state'.
      if (state.tenant.tenantMode === 'translation') {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        window.alert(<p>{translateMethod('tenant_edit.translation_mode_message')}</p>);
        // @ts-expect-error TS(2304): Cannot find name 'setTranslationMode'.
        setTranslationMode(true);
      }
      // @ts-expect-error TS(2304): Cannot find name 'state'.
      return Services.saveTenant(state.tenant).then(({ uiPayload }) => {
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        toastr.success(translateMethod('Tenant updated successfully'));
        // @ts-expect-error TS(2304): Cannot find name 'tenant'.
        if (uiPayload._id === tenant._id) {
          // @ts-expect-error TS(2304): Cannot find name 'dispatch'.
          updateTenant(uiPayload)(dispatch);
        }
      });
    }
  };

  const disabled = {}; //TODO: deepEqual(state.originalApi, state.api) ? { disabled: 'disabled' } : {};
  // @ts-expect-error TS(2304): Cannot find name 'state'.
  if (!state.tenant) {
    return null;
  }

  return (<Can I={manage} a={TENANT} dispatchError>
      <div className="row">
        <div className="col-12 d-flex justify-content-start align-items-center mb-2">
          <div className="avatar__container">
            <img style={{ width: '100%', height: 'auto' }} src={(state.tenant as any)?.style?.logo} alt="avatar"/>
          </div>
          <h1 className="h1-rwd-reduce ms-2">{(state.tenant as any).name}</h1>
        </div>
        <React.Suspense fallback={<Spinner />}>
          <LazyForm flow={flow} schema={schema} value={state.tenant} onChange={(tenant) => setState({ ...state, tenant, updated: true })} style={{ paddingTop: 20 }}/>
        </React.Suspense>
        <div className="d-flex justify-content-end my-3">
          <Link className="btn btn-outline-primary me-1" to={'/settings/tenants'}>
            <i className="fas fa-chevron-left me-1"/>
            <Translation i18nkey="Back">Back</Translation>
          </Link>
          <button type="button" className="btn btn-outline-success" {...disabled} onClick={save}>
            {!state.create && (<span>
                <i className="fas fa-save me-1"/>
                <Translation i18nkey="Save">Save</Translation>
              </span>)}
            {state.create && (<span>
                <i className="fas fa-save me-1"/>
                <Translation i18nkey="Create">Create</Translation>
              </span>)}
          </button>
        </div>
      </div>
    </Can>);
};

export const TenantEdit = () => {
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  const { tenant } = useTenantBackOffice();

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <TenantEdition tenant={tenant} />;
};

export const TenantEditForAdmin = () => {
  useDaikokuBackOffice();

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <TenantEdition />;
};
