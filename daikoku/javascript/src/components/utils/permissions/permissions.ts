import { read, manage } from './actions';
import { api, apikey, asset, stat, team, backoffice } from './subjects';
import { Option } from '..';
import { ITeamSimple, TeamPermission } from '../../../types';

export const administrator: TeamPermission = 'Administrator';
export const user: TeamPermission = 'User';
export const apiEditor: TeamPermission = 'ApiEditor';

export const isUserIsTeamAdmin = (user: any, team: any) =>
  Option(team.users.find((u: any) => u.userId === user._id))
    .map((user: any) => user.teamPermission)
    .fold(
      () => false,
      (perm: any) => perm === administrator
    );
export type TPermission = {
  action: number;
  what: string;
  condition?: (team: ITeamSimple) => boolean
}
export type TPermissions = Array<TPermission>;
export const permissions: {
  [key: string]: TPermissions;
} = {
  User: [
    {
      action: manage,
      what: apikey,
      condition: (team: ITeamSimple) => !team.apiKeyVisibility || team.apiKeyVisibility === 'User',
    },
    { action: read, what: api },
    { action: read, what: asset },
    { action: read, what: team },
    { action: read, what: stat },
    { action: read, what: backoffice },
  ],
  ApiEditor: [
    { action: manage, what: api },
    {
      action: manage,
      what: apikey,
      condition: (team: any) => team.apiKeyVisibility !== 'Administrator',
    },
    { action: manage, what: asset },
    { action: read, what: team },
    { action: read, what: stat },
    { action: read, what: backoffice },
  ],
  Administrator: [
    { action: manage, what: api },
    { action: manage, what: apikey },
    { action: manage, what: asset },
    { action: read, what: stat },
    { action: manage, what: team },
    { action: read, what: backoffice },
  ],
};
