import { Language } from './types';
import {IFastApiParent} from "./api";

export type TeamPermission = 'Administrator' | 'ApiEditor' | 'User';

export type TeamUser = { userId: string; teamPermission: TeamPermission };
export interface ITeamSimple {
  _id: string;
  _humanReadableId: string;
  _tenant: string;
  type: 'Personal' | 'Organization' | 'Admin';
  name: string;
  description: string;
  avatar: string;
  contact: string;
  users: Array<TeamUser>;
  apiKeyVisibility: TeamPermission;
  apisCreationPermission?: boolean;
}

export interface ITeamFull extends ITeamSimple {
  _deleted: boolean;
  subscriptions: Array<string>;
  metadata: object;
}

export interface IUserSimple {
  _id: string;
  _humanReadableId: string;
  email: string;
  picture: string;
  isDaikokuAdmin: boolean;
  defaultLanguage?: string;
  isGuest: boolean;
  starredApis: Array<string>;
  twoFactorAuthentication: I2FA | null;
  name: string;
}

export interface IUser extends IUserSimple {
  pictureFromProvider: boolean;
  origins: Array<'Local' | 'Otoroshi' | 'LDAP' | 'OAuth2'>;
}

interface I2FA {
  enabled: boolean;
  secret: string;
  token: string;
  backupCodes: string;
}

export interface IFastTeam {
  _id: string;
  _humanReadableId: string;
  name: string;
}

export interface IFastApiSubscription {
  integrationToken: string
  apiKey: IFastApiKey;


}

export interface IFastApiKey {
  clientId: string;
  clientName: string;
  clientSecret: string;
}