import { IUser, TeamPermission, TeamUser } from './team';
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
}
