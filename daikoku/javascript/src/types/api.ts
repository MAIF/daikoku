import { TreeItem, TreeItems } from "../components/utils/dnd/types";
import { ITeamSimple } from "./team";

interface IBaseApi {
  _id: string;
  _humanReadableId: string;
  _tenant: string;
  _deleted: boolean;
  lastUpdate: string;
  name: string;
  smallDescription: string;
  header?: string;
  image?: string;
  description: string;
  currentVersion: string;
  supportedVersions: Array<string>;
  published: boolean;
  testing: ITesting;
  documentation: IDocumentation;
  swagger?: ISwagger;
  tags: Array<string>;
  categories: Array<string>;
  visibility: 'Public' | 'Private' | 'PublicWithAuthorisation' | 'AdminOnly';
  possibleUsagePlans: Array<IUsagePlan>;
  defaultUsagePlan: string;
  authorizedTeams: Array<string>;
  posts: Array<string>;
  issues: Array<string>;
  issuesTags: Array<IIssuesTag>;
  stars: number;
  parent?: string;
  isDefault: boolean;
  apis: Array<string>;
}

export interface IIssuesTag {
  id: string
  name: string
  color: string
}

export interface IApiWithSimpleTeam extends IBaseApi {
  team: {
    _humanReadableId: string
    _id: string
    avatar: string
    name: string
  };
}
export interface IApi extends IBaseApi {
  team: string
}

export interface IApiWithAuthorization extends IApiWithSimpleTeam {
  authorizations: Array<{
    team: string;
    authorized: boolean;
    pending: boolean;
  }>;
}

export interface ITesting {
  enabled: boolean;
  auth: {
    name: 'ApiKey' | 'Basic';
  };
  name?: string;
  username?: string;
  password?: string;
  config?: ITestingConfig;
}

export interface ITestingConfig {
  otoroshiSettings: string;
  authorizedEntities: IAuthorizedEntities;
  clientName: string;
  api: string;
  tag: string;
  customMetadata?: object;
  customMaxPerSecond?: number;
  customMaxPerDay?: number;
  customMaxPerMonth?: number;
  customReadOnly?: boolean;
}

export type IDocumentationPages =  IDocumentationPage[]
export interface IDocumentationPage {
  id: string;
  title: string;
  children: IDocumentationPages
}
export interface IDocumentation {
  _id: string;
  _tenant: string;
  pages: IDocumentationPages;
  lastModificationAt: string;
}

export interface ISwagger {
  url: string;
  content?: string;
  headers: { [key: string]: string };
}

export interface IUsagePlan {
  _id: string;
  type: string;
  customDescription?: string;
  customName?: string;
  allowMultipleKeys?: boolean;
  otoroshiTarget?: IOtoroshiTarget;
  aggregationApiKeysSecurity?: boolean;
  subscriptionProcess: 'Automatic' | 'manual';
  integrationProcess: 'Automatic' | 'ApiKey';
  autoRotation?: boolean;
  rotation: boolean;
  currency: ICurrency;
  billingDuration: IBillingDuration;
  visibility: 'Public' | 'Private';
  authorizedTeams: Array<string>;
  costPerMonth?: number;
}

export interface IUsagePlanAdmin extends IUsagePlan {}

export interface IUsagePlanFreeWithoutQuotas extends IUsagePlan {}
export interface IUsagePlanFreeWithQuotas extends IUsagePlanFreeWithoutQuotas {
  maxPerSecond: number;
  maxPerDay: number;
  maxPerMonth: number;
}
export interface IUsagePlanQuotasWithLimits extends IUsagePlanFreeWithQuotas {
  costPerMonth: number;
  trialPeriod: IBillingDuration;
}
export interface IUsagePlanQuotasWitoutLimit extends IUsagePlanQuotasWithLimits {
  costPerAdditionalRequest: number;
}
export interface IUsagePlanPayPerUse extends IUsagePlan {
  costPerMonth: number;
  costPerRequest: number;
  trialPeriod: IBillingDuration;

  currency: ICurrency;
  billingDuration: IBillingDuration;
  visibility: 'Public' | 'Private';
  authorizedTeams: Array<string>;
  autoRotation?: boolean;
  subscriptionProcess: 'Automatic' | 'manual';
  integrationProcess: 'Automatic' | 'ApiKey';
  rotation: boolean;
}

interface IAuthorizedEntities {
  groups: Array<string>;
  services: Array<string>;
}

interface IBillingDuration {
  value: number;
  unit: 'Hour' | 'Day' | 'Month' | 'Year';
}

interface ICurrency {
  code: string;
}

interface IOtoroshiTarget {
  otoroshiSettings?: string;
  authorizedEntities: IAuthorizedEntities;
  apikeyCustomization: {
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
}

interface IApiKey {
  clientName: string;
  clientId: string;
  clientSecret: string;
}

interface IRotation {
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
  by: string;
  customName: string | null;
  enabled: boolean;
  rotation: IRotation;
  customMetadata?: object;
  metadata?: object;
  tags: Array<string>;
  customMaxPerSecond: number | null;
  customMaxPerMonth: number | null;
  customMaxPerDay: number | null;
  customReadOnly: boolean | null;
  parent: string | null;
}

export const isPayPerUse = (obj: IUsagePlan): obj is IUsagePlanPayPerUse => {
  return (<IUsagePlanPayPerUse>obj).costPerRequest !== undefined;
};

export const isQuotasWitoutLimit = (obj: IUsagePlan): obj is IUsagePlanQuotasWitoutLimit => {
  return (<IUsagePlanQuotasWitoutLimit>obj).costPerAdditionalRequest !== undefined;
};

export const isMiniFreeWithQuotas = (obj: IUsagePlan): obj is IUsagePlanFreeWithQuotas => {
  return (<IUsagePlanFreeWithQuotas>obj).maxPerSecond !== undefined;
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

export interface ISafeSubscription extends IBaseSubscription{
  apiKey: {clientName: string};

}

export interface ISubscription extends IBaseSubscription{
  apiKey?: IApiKey;
  integrationToken: string;

}

export interface IQuotas {
  currentCallsPerSec:number,
  remainingCallsPerSec: number,
  currentCallsPerDay: number,
  authorizedCallsPerDay: number,
  currentCallsPerMonth: number,
  remainingCallsPerMonth: number,
  authorizedCallsPerSec: number,
  authorizedCallsPerMonth: number,
  remainingCallsPerDay: number
}

export interface ISubscriptionInformation {
  simpleApi: IApi,
  simpleSubscription: ISubscription
  plan: IUsagePlan
}