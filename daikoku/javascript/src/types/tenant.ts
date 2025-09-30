import { IValidationStep } from './api';
import { ITeamSimple, IUser, IUserSimple } from './team';
import { Language } from './types';

export enum TenanMode {
  maintenance = 'Maintenance',
  construction = 'Construction',
  translation = 'Translation',
  default = 'Default',
}

export enum Display {
  default = 'default',
  environment = 'environment',
}

export enum AuthProvider {
  otoroshi = 'Otoroshi',
  LDAP = 'LDAP',
  OAuth2 = 'OAuth2',
  local = 'Local',
}

export enum DaikokuMode {
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

export enum ThirdPartyPaymentType {
  stripe = 'Stripe',
}

export interface IThirdPartyPaymentSettings {
  _id: string;
  name: string;
  type: ThirdPartyPaymentType;
}

interface IThirdPartyPaymentStripe extends IThirdPartyPaymentSettings {
  publicKey: string;
  secretKey: string;
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
export interface ISafeOtoroshiSettings {
  _id: string;
  url: string;
  host: string;
}
export interface IOtoroshiSettings {
  _id: string;
  url: string;
  host: string;
  clientId: string;
  clientSecret: string;
}
export interface ISimpleOtoroshiSettings {
  _id: string;
  url: string;
  host: string;
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
  environmentAggregationApiKeysSecurity: boolean;
  apiReferenceHideForGuest: boolean;
  authProvider: AuthProvider;
  defaultMessage?: string;
  homePageVisible: boolean;
  homeCmsPage?: string;
  mode: DaikokuMode;
  tenantMode: TenanMode;
  display: Display;
  environments: Array<string>;
  loginProvider: string;
  colorTheme?: string;
  css?: string;
  cssUrl?: string;
  js?: string;
  jsUrl?: string;
  faviconUrl?: string;
  fontFamilyUrl?: string;
  otoroshiSettings: Array<ISafeOtoroshiSettings>;
  thirdPartyPaymentSettings: Array<IThirdPartyPaymentSettings>;
  accountCreationProcess: Array<IValidationStep>
  isPrivate: boolean
}

export interface ITenantFull extends ITenant {
  _deleted: boolean;
  adminApi: string;
  adminSubscription: Array<string>;
  auditTrailConfig: IAuditTrailConfig;
  authProviderSettings: any; //todo handle different case of authprovider
  bucketSettings: IBucketSettings;
  daikokuHeader: { name: string; value: string };
  domain: string;
  enabled: boolean;
  isPrivate: boolean;
  mailerSettings: IMailerSettings;
  otoroshiSettings: Array<IOtoroshiSettings>;
  style: ITenantStyle;
  translation: any;
  thirdPartyPaymentSettings: Array<IThirdPartyPaymentSettings>;
}

export type TranslationItem = string | { s: string; p: string };
export interface ITranslation {
  _id: string;
  _tenant: string;
  default?: TranslationItem;
  key: string;
  language: string;
  lastModificationAt?: number;
  value: TranslationItem;
}

export interface IMailingTranslation {
  _id: string;
  translations: Array<ITranslation>;
  content: string;
}

export interface IAsset {
  label: string;
  value: string;
  filename: string;
  title: string;
  desc: string;
  contentType: string;
  meta: { [key: string]: string };
  link: string;
  slug?: string;
}

export interface ITenantAdministration {
  team: ITeamSimple;
  admins: Array<IUser>;
}

export interface IAuditTrail {
  size: number;
  events: Array<IAuditTrailEvent>;
}

enum AuditEventType {
  AuditTrailEvent = 'AuditTrailEvent',
  AlertEvent = 'AlertEvent',
  JobEvent = 'JobEvent',
  ApiKeyRotationEvent = 'ApiKeyRotationEvent',
}
export interface IAuditTrailEvent {
  _id: string;
  '@type': AuditEventType;
  '@id': string;
  '@timestamp': number | { $long: number };
  '@tenantId': string;
  '@userId': string;
  message: string;
  url: string;
  verb: string;
  user: IUserSimple;
  tenant: {
    id: string;
    name: string;
  };
  authorized: string;
  impersonator?: {
    id: string;
    name: string;
    email: string;
    isDaikokuAdmin: boolean;
  };
  details: object;
}

export interface ISession {
  _id: string;
  sessionId: string;
  userId: string;
  userName: string;
  userEmail: string;
  impersonatorId?: string;
  impersonatorName?: string;
  impersonatorEmail?: string;
  impersonatorSessionId?: string;
  created: number;
  expires: number;
  ttl: number;
}

export interface ISimpleSession {
  created: number;
  expires: number;
  ttl: number;
}
