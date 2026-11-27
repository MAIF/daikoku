import type { IApiWithAuthorization, ITeamSimple } from '../../types';

type BatchApi = {
  api: Pick<IApiWithAuthorization['api'], 'visibility'> & {
    team: Pick<ITeamSimple, '_id'>;
  };
  authorizations: IApiWithAuthorization['authorizations'];
};

export const eligibleBatchTeams = <T extends Pick<ITeamSimple, '_id' | 'type'>>(
  teams: T[],
  apis: BatchApi[],
  subscriptionSecurity: boolean
): T[] =>
  teams.filter(
    (team) =>
      team.type !== 'Admin' &&
      (!subscriptionSecurity || team.type !== 'Personal') &&
      apis.every(({ api, authorizations }) =>
        api.visibility !== 'AdminOnly' &&
        (api.visibility === 'Public' ||
          api.team._id === team._id ||
          authorizations.some((authorization) =>
            authorization.team === team._id && authorization.authorized
          ))
      )
  );
