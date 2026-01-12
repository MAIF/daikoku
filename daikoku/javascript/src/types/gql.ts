import { IApiSubscriptionGql } from '../components';
import {
  ApiState,
  IApi,
  IAuthorizedEntities,
  ISubscriptionDemandState,
  IValidationStep,
} from './api';
import { TeamPermission } from './team';
import { ITenant } from './tenant';

export interface ITeamFullGql {
  _id: string;
  _humanReadableId: string;
  _deleted: boolean;
  tenant: ITenant & { id: string };
  type: 'Personal' | 'Organization' | 'Admin';
  name: string;
  description: string;
  avatar: string;
  contact: string;
  users: Array<{ user: { userId: string }; teamPermission: TeamPermission }>;
  apiKeyVisibility: TeamPermission;
  apisCreationPermission?: boolean;
  verified: boolean;
  metadata: object;
  authorizedOtoroshiEntities?: Array<{
    otoroshiSettingsId: string;
    authorizedEntities: IAuthorizedEntities;
  }>;
}

type IUsagePlanGQL = {
  _id: string;
  customName: string;
  customDescription: string;
  visibility: 'Public' | 'Private';
  maxPerSecond: number;
  maxPerDay: number;
  maxPerMonth: number;
  subscriptionProcess: Array<{ name: string }>;
  allowMutlipleApikeys: boolean;
  otoroshiTarget: {
    otoroshiSettings: string;
    authorizedEntitites: Array<IAuthorizedEntities>;
  };
  aggregationApiKeysSecurity: boolean;
};
export interface IApiGQL {
  _id: string;
  _humanReadableId: string;
  _deleted: boolean;
  lastUpdate: number;
  state: ApiState;
  currentVersion: string;
  isDefault: boolean;
  name: string;
  smallDescription: string;
  description: string;
  tags: Array<string>;
  categories: Array<string>;
  visibility: 'Public' | 'Private' | 'PublicWithAuthorisation' | 'AdminOnly';
  team: {
    _id: string;
    _humanReadableId: string;
    name: string;
  };
  possibleUsagePlans: Array<IUsagePlanGQL>;
  defaultUsagePlan: string;
  apis: Array<IApi>;
  authorizedTeams: Array<{ _id: string; name: string }>;
  stars: number;
  metadata?: object;
}

export interface IApiSubscriptionDetails {
  apiSubscription: IApiSubscriptionGql;
  parentSubscription?: IApiSubscriptionGql;
  accessibleResources: Array<{
    apiSubscription: IApiSubscriptionGql;
    api: IApiGQL;
    usagePlan: IUsagePlanGQL;
  }>;
}

export interface IUserAuditEvent {
  _id: string;
  mail: string;
  name: string;
  isDaikokuAdmin: boolean;
}
export interface IAuditTrailEventGQL {
  _tenant: string;
  event_id: string;
  event_type: string;
  event_userId: string;
  event_tenantId: string;
  event_timestamp: number;
  id: string;
  url: string;
  user: IUserAuditEvent;
  verb: string;
  tenant: {
    id: string;
    name: string;
  };
  authorized: string;
  message: string;
  impersonator?: {
    id: string;
    name: string;
    email: string;
    isDaikokuAdmin: boolean;
  };
}

export interface ICmsPageGQL {
  id: string;
  name: string;
  path: string;
  body: string;
  exact: boolean;
  visible: boolean;
  authenticated: boolean;
  metadata: object;
  contentType: string;
  tags: String[];
  lastPublishedDate: number;
}

export interface ISubscriptionDemandGQL {
  _id: string;
  api: IApiGQL;
  plan: IUsagePlanGQL;
  steps: Array<{
    id: string;
    state: ISubscriptionDemandState;
    step: IValidationStep;
  }>;
  state: string;
  team: ITeamFullGql;
  from: {
    name: string;
  };
  date: number;
  motivation?: string;
}

export interface IAccountCreationGQL {
  id: string;
  deleted: boolean;
  randomId: string;
  email: string;
  name: string;
  avatar: string;
  password: string;
  creationDate: number;
  validUntil: number;
  steps: Array<{
    id: string;
    state: ISubscriptionDemandState;
    step: IValidationStep;
  }>;
  state: ISubscriptionDemandState;
  value: object;
  fromTenant: ITenant;
  metadata: object;
}
