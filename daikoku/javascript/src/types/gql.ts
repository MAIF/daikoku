import { ApiState, IApi, IAuthorizedEntities, IIssuesTag } from './api';
import { ITeamSimple, IUser, TeamPermission, TeamUser } from './team';
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
  authorizedOtoroshiEntities: Array<{
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
  subscriptionProcess: Array<{ name: string }>
  allowMutlipleApikeys: boolean;
  otoroshiTarget: {
    otoroshiSettings: string;
    authorizedEntitites: Array<IAuthorizedEntities>
  };
  aggregationApiKeysSecurity: boolean;
};
export interface IApiGQL {
  _id: string;
  _humanReadableId: string;
  _deleted: boolean;
  lastUpdate: string;
  state: ApiState;
  currentVersion: string;
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
}
