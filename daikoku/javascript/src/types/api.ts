import { constraints, Schema } from '@maif/react-forms';
import { IFastTeam, ITeamSimple, IUserSimple } from './team';
import { ThirdPartyPaymentType } from './tenant';
import { INotification } from './types';
import { IApiGQL, ISubscriptionDemandGQL, ITeamFullGql } from './gql';
import { IApiSubscriptionGql } from '../components';

export type ApiState = 'created' | 'published' | 'deprecated' | 'blocked' | 'deleted';

export interface IWithDocumentation {
  _id: string;
  documentation?: IDocumentation;
  tenant: string
}
export interface IWithSwagger {
  _id: string;
  swagger?: ISwagger;
}

export interface IWithTesting {
  testing?: ITesting;
  _id: string;
  name?: string;
  customName?: string;
}

export interface IBaseApi extends IWithSwagger, IWithTesting, IWithDocumentation {
  _id: string;
  _humanReadableId: string;
  _tenant: string;
  _deleted: boolean;
  lastUpdate: number;
  name: string;
  smallDescription: string;
  descriptionCmsPage?: string;
  customHeaderCmsPage?: string;
  header?: string;
  image?: string;
  description: string;
  currentVersion: string;
  supportedVersions: Array<string>;
  tags: Array<string>;
  categories: Array<string>;
  visibility: 'Public' | 'Private' | 'PublicWithAuthorisation' | 'AdminOnly';
  possibleUsagePlans: Array<string>;
  defaultUsagePlan?: string;
  authorizedTeams: Array<string>;
  posts: Array<string>;
  issues: Array<string>;
  issuesTags: Array<IIssuesTag>;
  stars: number;
  parent?: string;
  isDefault: boolean;
  apis: Array<string>;
  state: ApiState;
}

export interface IIssuesTag {
  id: string;
  name: string;
  color: string;
}

export interface IApiWithTeam extends IApiGQL {
  team: ITeamFullGql;
}

export interface IApi extends IBaseApi, IWithSwagger {
  team: string;
}

/*export interface IApiWithAuthorization extends IApiWithSimpleTeam {
  authorizations: Array<{
    team: string;
    authorized: boolean;
    pending: boolean;
  }>;
}*/

export type IApiWithAuthorization = {
  api: IApiWithTeam;
  authorizations: Array<{
    team: string;
    authorized: boolean;
    pending: boolean;
  }>;
  plans: Array<IUsagePlan>;
  subscriptionDemands: Array<ISubscriptionDemandGQL>;
  subscriptions: Array<IApiSubscriptionGql>;
}

export interface IApiExtended extends IApi {
  pendingRequests: INotification;
  subscriptions: ISafeSubscription;
  myTeams: Array<ITeamSimple>;
  authorizations: Array<{ team: string; authorized: boolean; pending: boolean }>;
}

export type IApiAuthoWithCount = {
  apis: Array<IApiWithAuthorization>;
  producers: Array<{team: ITeamSimple, total: number}>;
  tags: Array<{value: string, total: number}>;
  categories: Array<{value: string, total: number}>;
  total: number;
  totalFiltered: number;
}

export interface ITesting {
  enabled: boolean;
  auth: 'ApiKey' | 'Basic';
  name?: string;
  username?: string;
  password?: string;
  config?: ITestingConfig;
}

export function isApi(obj: any): obj is IApi {
  return (<IApi>obj).possibleUsagePlans !== undefined;
}

export function isUsagePlan(obj: any): obj is IUsagePlan {
  return (<IUsagePlan>obj).subscriptionProcess !== undefined;
}

export interface ITestingConfig {
  otoroshiSettings?: string;
  authorizedEntities?: IAuthorizedEntities;
  clientName: string;
  api: string;
  tag: string;
  customMetadata?: object;
  customMaxPerSecond?: number;
  customMaxPerDay?: number;
  customMaxPerMonth?: number;
  customReadOnly?: boolean;
}

export type IDocumentationPages = IDocumentationPage[];
export interface IDocumentationPage {
  id: string;
  title: string;
  children: IDocumentationPages;
}
export interface IDocumentation {
  _id: string;
  _tenant: string;
  pages: IDocumentationPages;
  lastModificationAt: number;
}

export interface IImportingDocumentation {
  from: string;
  _id: string;
  pages: Array<{
    _id: string;
    title: string;
  }>;
}

export enum SpecificationType {
  openapi = 'openapi',
  asyncapi = 'asyncapi',
}
export interface ISwagger {
  url?: string;
  content?: string;
  headers: { [key: string]: string };
  additionalConf?: object;
  specificationType: SpecificationType;
}

export type IValidationStep =
  | {
      type: 'email';
      id: string;
      emails: Array<string>;
      message: string;
      title: string;
    }
  | {
      type: 'httpRequest';
      id: string;
      title: string;
      url: string;
      headers: object;
    }
  | {
      type: 'form';
      id: string;
      schema: Schema;
      formatter: string;
      title: string;
      formKeysToMetadata?: Array<string>;
      info?: string;
    }
  | {
      type: 'payment';
      id: string;
      thirdPartyPaymentSettingsId: string;
      title?: string;
    }
  | {
      type: 'teamAdmin';
      id: string;
      title?: string;
      team: string;
    };

export interface IBaseUsagePlan {
  _id: string;
  _tenant: string;
  _deleted: boolean;
  customDescription?: string;
  customName: string;
  subscriptionProcess: Array<IValidationStep>;
  currency?: ICurrency;
  otoroshiTarget?: IOtoroshiTarget;
}

export enum UsagePlanVisibility {
  public = 'Public',
  private = 'Private',
}

export interface IPaymentSettings {
  thirdPartyPaymentSettingsId: string;
  type: ThirdPartyPaymentType;
}

export interface IStripePaymentSettings extends IPaymentSettings {
  productId: string;
  priceIds: Array<string>;
}

export interface IUsagePlan extends IBaseUsagePlan, IWithSwagger, IWithTesting, IWithDocumentation {
  _id: string;
  _tenant: string;
  _deleted: boolean;
  customDescription?: string;
  customName: string;
  subscriptionProcess: Array<IValidationStep>;
  otoroshiTarget?: IOtoroshiTarget;
  allowMultipleKeys?: boolean;
  aggregationApiKeysSecurity?: boolean;
  integrationProcess: 'Automatic' | 'ApiKey';
  autoRotation?: boolean;
  rotation: boolean;
  currency?: ICurrency;
  billingDuration?: IBillingDuration;
  visibility: UsagePlanVisibility;
  authorizedTeams: Array<string>;
  costPerRequest?: number;
  costPerMonth?: number;
  maxPerMonth?: number;
  maxPerSecond?: number;
  maxPerDay?: number;
  paymentSettings?: IPaymentSettings;
  trialPeriod?: IBillingDuration;
}

export interface IAuthorizedEntities {
  groups: Array<string>;
  services: Array<string>;
  routes: Array<string>;
}

interface IBillingDuration {
  value: number;
  unit: 'Hour' | 'Day' | 'Month' | 'Year';
}

export interface ICurrency {
  code: string;
}

export interface IOtoroshiTarget {
  otoroshiSettings?: string;
  authorizedEntities?: IAuthorizedEntities;
  apikeyCustomization?: {
    clientIdOnly: boolean;
    constrainedServicesOnly: boolean;
    tags: Array<string>;
    metadata: { [key: string]: string };
    customMetadata: Array<{ key: string; possibleValues: Array<string> }>;
    restrictions: {
      enabled: boolean;
      allowLast: boolean;
      allowed: Array<IPath>;
      forbidden: Array<IPath>;
      notFound: Array<IPath>;
    };
    validUntil?: string;
  };
}

interface IPath {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'OPTIONS' | 'HEAD' | 'PATCH';
  path: string;
}
export interface IDocTitle {
  _id: string;
  title: string;
  level: string;
}

export interface IApiDoc {
  currentVersion: string;
  apiId: string;
  pages: Array<IDocTitle>;
}
export interface IDocDetail {
  pages: Array<string>;
  titles: Array<IDocTitle>;
}
export interface IDocPage {
  _id: string;
  _humanReadableId: string;
  _tenant: string;
  _deleted: boolean;
  title: string;
  lastModificationAt: number;
  content: string;
  contentType: string;
  remoteContentEnabled: boolean;
  remoteContentUrl: string | null;
  remoteContentHeaders: object;
  linked?: boolean;
  cmsPage?: string;
}

export interface IOtoroshiApiKey {
  clientId: string;
  clientSecret: string;
  clientName: String;
  authorizedEntities: IAuthorizedEntities;
  enabled: boolean;
  allowClientIdOnly: boolean;
  readOnly: boolean;
  constrainedServicesOnly: boolean;
  throttlingQuota: number;
  dailyQuota: number;
  monthlyQuota: number;
  tags: Array<string>;
  metadata: { [x: string]: string };
}

export interface IApiKey {
  clientName: string;
  clientId: string;
  clientSecret: string;
}

export interface IRotation {
  enabled: boolean;
  rotationEvery: number;
  gracePeriod: number;
  pendingRotation: boolean;
}
export interface IBaseSubscription {
  _id: string;
  _tenant: string;
  _deleted: boolean;
  plan: string;
  team: string;
  api: string;
  createdAt: string;
  validUntil?: number;
  by: string;
  customName: string | null;
  enabled: boolean;
  rotation: IRotation;
  metadata?: object;
  tags: Array<string>;
  customMetadata?: object;
  customMaxPerSecond?: number;
  customMaxPerMonth?: number;
  customMaxPerDay?: number;
  customReadOnly?: boolean;
  adminCustomName?: string;
  parent: string | null;
  parentUp: boolean;
}

export const isPayPerUse = (plan: IUsagePlan | IFastPlan) => {
  return !!plan.costPerRequest && !plan.maxPerMonth;
};

export const isQuotasWitoutLimit = (plan: IUsagePlan | IFastPlan) => {
  return !!plan.costPerRequest && !!plan.maxPerMonth;
};

export const isMiniFreeWithQuotas = (plan: IUsagePlan | IFastPlan) => {
  return !!plan.maxPerSecond && !plan.costPerMonth;
};

export type ResponseError = {
  error: string;
};

export type ResponseDone = {
  done: boolean;
};

export function isError(obj: any): obj is ResponseError {
  return (<ResponseError>obj).error !== undefined;
}

export function isConstraint(obj: any): obj is constraints.Constraint {
  //@ts-ignore
  return (<constraints.Constraint>obj).type === undefined;
}

export function isPromise<T>(obj: any): obj is Promise<T> {
  return (<Promise<T>>obj).then !== undefined && typeof (<Promise<T>>obj).then === 'function';
}

export interface ISafeSubscription extends IBaseSubscription, ISubscriptionCustomization {
  apiKey: { clientName: string };
}

export interface ISubscription extends IBaseSubscription {
  apiKey: IApiKey;
  integrationToken: string;
  bearerToken?: string;
}

export interface ISubscriptionCustomization {
  customMetadata?: object;
  customMaxPerSecond?: number;
  customMaxPerMonth?: number;
  customMaxPerDay?: number;
  customReadOnly?: boolean;
  adminCustomName?: string;
  validUntil?: number;
}

export interface ISubscriptionExtended extends ISubscription {
  parentUp: boolean;
  planType: string;
  planName: string;
  apiName: string;
  _humanReadableId: string;
  apiLink: string;
  planLink: string;
}

export interface ISubscriptionWithApiInfo extends ISubscription {
  apiName: string;
  planName: string;
}

export interface IQuotas {
  authorizedCallsPerSec: number;
  currentCallsPerSec: number;
  remainingCallsPerSec: number;
  authorizedCallsPerDay: number;
  currentCallsPerDay: number;
  remainingCallsPerDay: number;
  authorizedCallsPerMonth: number;
  currentCallsPerMonth: number;
  remainingCallsPerMonth: number;
}

export interface ISubscriptionInformation {
  simpleApi: IApi;
  simpleSubscription: ISubscription;
  plan: IUsagePlan;
}

export interface IFastPlan extends IBaseUsagePlan {
  maxPerSecond?: number;
  maxPerMonth?: number;
  costPerMonth?: number;
  costPerAdditionalRequest?: number;
  costPerRequest?: number;
  allowMultipleKeys: boolean;
  aggregationApiKeysSecurity: boolean;
}

export interface IFastSubscription {
  planId: string;
  isPending: boolean;
  subscriptionsCount: number;
}

export interface IFastApiParent {
  _id: string;
  currentVersion: string;
}

export interface IFastApi {
  api: {
    name: string;
    _humanReadableId: string;
    _id: string;
    isDefault: boolean;
    visibility: 'Public' | 'Private' | 'PublicWithAuthorisation' | 'AdminOnly';
    possibleUsagePlans: Array<IFastPlan>;
    currentVersion: string;
    team: IFastTeam;
    parent: IFastApiParent;
  };
  subscriptionsWithPlan: Array<IFastSubscription>;
}

export interface IApiPostCursor {
  posts: Array<IApiPost>;
  total: number;
  nextCursor: number;
  prevCursor: number;
}
export interface IApiPost {
  _id: string;
  _humanReadableId: string;
  _tenant: string;
  _deleted: string;
  title: string;
  lastModificationAt: string;
  content: string;
}

export type ISubscriptionDemandState =
  | 'accepted'
  | 'refused'
  | 'canceled'
  | 'inProgress'
  | 'waiting'
  | 'blocked';

export interface SubscriptionDemandStep {
  id: string;
  state: ISubscriptionDemandState;
  step: IValidationStep;
  metadata: object;
}

export interface ISubscriptionDemand {
  _id: string;
  _tenant: string;
  _deleted: boolean;
  api: string;
  plan: string;
  steps: Array<SubscriptionDemandStep>;
  state: ISubscriptionDemandState;
  team: string;
  from: string;
  date: string;
  motivation?: object;
  parentSubscriptionId?: string;
  customReadOnly?: boolean;
  customMetadata?: object;
  customMaxPerSecond?: number;
  customMaxPerDay?: number;
  customMaxPerMonth?: number;
  adminCustomName?: string;
}

export interface IGlobalInformations {
  avgDuration?: number;
  avgOverhead?: number;
  dataIn: number;
  dataOut: number;
  hits: number;
}

export interface IConsumption {
  _id: string;
  _deleted: boolean;
  _tenant: string;
  team: string;
  api: string;
  plan: string;
  clientId: string;
  hits: number;
  globalInformation: IGlobalInformations;
  quotas: IQuotas;
  billing: { hits: number; total: number };
  from: number;
  to: number;
  state: 'inProgress' | 'completed';
}

export type Comment = {
  by: IUserSimple;
  createdAt: number;
  lastModificationAt: number;
  content: string;
};
export type Issue = {
  _id: string;
  _humanReadableId: string;
  seqId: number;
  _tenant: string;
  _deleted: boolean;
  lastModificationAt: number;
  open: boolean;
  createdAt: number;
  closedAt: number;
  apiVersion: string;
  comments: Array<Comment>;
  title: string;
  by: IUserSimple;
  tags: Array<IIssuesTag>;
};
