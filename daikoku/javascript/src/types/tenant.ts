import { Language } from './types';

enum TenanMode {
  maintenance = 'Maintenance',
  construction = 'Construction',
  translation = 'Translation',
  default = 'Default',
}

enum AuthProvider {
  otoroshi = 'Otoroshi',
  LDAP = 'LDAP',
  OAuth2 = 'OAuth2',
  local = 'Local',
}

enum DaikokuMode {
  dev = 'Dev',
  prod = 'Prod',
}

interface IAuditWebhook {
  url: string;
  headers?: { [key: string]: string };
}

interface IElasticConfig {
  clusterUri: string;
  index?: string;
  type?: string;
  user?: string;
  password?: string;
  headers?: { [key: string]: string };
}

interface IKafkaConfig {
  servers: Array<string>;
  keyPass: string;
  keyStore: string;
  truststore: string;
  auditTopic: string;
  hostValidation?: boolean;
}
interface IAuditTrailConfig {
  alertEmails: Array<string>;
  auditWebhooks: Array<IAuditWebhook>;
  elasticConfigs?: IElasticConfig;
  kafkaConfig?: IKafkaConfig;
}

export interface IBucketSettings {
  access: string;
  bucket: string;
  chunkSize: number;
  endpoint: string;
  region: string;
  secret: string;
  v4auth: boolean;
}

enum MailerType {
  console = 'console',
  mailgun = 'mailgun',
  mailjet = 'mailjet',
  sendgrid = 'sendgrid',
  smtpClient = 'smtpClient',
}
export interface IMailerSettings {
  type: MailerType;
  template?: string;
}

interface IMailerConsole extends IMailerSettings {
  type: MailerType.console;
  fromTitle: string;
  fromEmail: string;
}
interface IMailerMailgun extends IMailerSettings {
  type: MailerType.mailgun;
  domain: string;
  eu: boolean;
  key: string;
  fromTitle: string;
  fromEmail: string;
}
interface IMailerMailjet extends IMailerSettings {
  type: MailerType.mailjet;
  apiKeyPublic: string;
  apiKeyPrivate: string;
  fromTitle: string;
  fromEmail: string;
}
interface IMailerSendgrid extends IMailerSettings {
  type: MailerType.sendgrid;
  apikey: string;
  fromEmail: string;
}
interface IMailerSmtpClient extends IMailerSettings {
  type: MailerType.smtpClient;
  host: string;
  port: string;
  fromTitle: string;
  fromEmail: string;
}

interface IOtoroshiSettings {
  _id: string;
  url: string;
  host: string;
  clientId: string;
  clientSecret: string;
}

interface ITenantStyle {
  js: string;
  css: string;
  colorTheme: string;
  jsUrl?: string;
  cssUrl?: string;
  faviconUrl?: string;
  fontFamilyUrl?: string;
  title: string;
  description: string;
  unloggedHome: string;
  homePageVisible: boolean;
  homeCmsPage?: string;
  notFoundCmsPage?: string;
  authenticatedCmsPage?: string;
  cacheTTL: number;
  cmsHistoryLength: number;
  logo: string;
  footer?: string;
}

export interface ITenant {
  _humanReadableId: string;
  _id: string;
  name: string;
  title?: string;
  description?: string;
  contact: string;
  unloggedHome?: string;
  footer?: string;
  logo?: string;
  defaultLanguage?: Language;
  creationSecurity: boolean;
  subscriptionSecurity: boolean;
  aggregationApiKeysSecurity: boolean;
  apiReferenceHideForGuest: boolean;
  hideTeamsPage: boolean;
  authProvider: AuthProvider;
  defaultMessage?: string;
  homePageVisible: boolean;
  mode: DaikokuMode;
  tenantMode: TenanMode;
}

export interface ITenantFull extends ITenant {
  _deleted: boolean;
  adminApi: string;
  adminSubscription: Array<string>;
  auditTrailConfig: IAuditTrailConfig;
  authProviderSettings: any; //todo handle differenbt case of authprovider
  bucketSettings: IBucketSettings;
  daikokuHeader: { name: string; value: string };
  domain: string;
  enabled: boolean;
  isPrivate: boolean;
  mailerSettings: IMailerSettings;
  otoroshiSettings: Array<IOtoroshiSettings>;
  style: ITenantStyle;
  translation: any;
}

export interface ITranslation {
  _id: string;
  _tenant: string;
  default: string;
  key: string;
  language: string;
  lastModificationAt?: number;
  value: string;
}
