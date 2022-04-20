import { read, manage } from './actions';
import { api, apikey, asset, stat, team, backoffice } from './subjects';
import { Option } from '..';

export const administrator = 'Administrator';
export const user = 'User';
export const apiEditor = 'ApiEditor';

export const isUserIsTeamAdmin = (user, team) =>
  Option(team.users.find((u) => u.userId === user._id))
    .map((user) => user.teamPermission)
    .fold(
      () => false,
      (perm) => perm === administrator
    );

export const permissions = {
  User: [
    {
      action: manage,
      what: apikey,
      condition: (team) => !team.apiKeyVisibility || team.apiKeyVisibility === 'User',
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
      condition: (team) => team.apiKeyVisibility !== 'Administrator',
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
