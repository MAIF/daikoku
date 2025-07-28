import { ITeamSimple, ITenant } from '../../types';
import { ITeamFullGql } from '../../types/gql';

export const teamGQLToLegitTeam = (teamGQL: ITeamFullGql): ITeamSimple => {
  return {
    _id: teamGQL._id,
    _humanReadableId: teamGQL._humanReadableId,
    _tenant: teamGQL.tenant._id,
    type: teamGQL.type,
    name: teamGQL.name,
    description: teamGQL.description,
    avatar: teamGQL.avatar,
    contact: teamGQL.contact,
    users: teamGQL.users.map((u) => ({ userId: u.user.userId, teamPermission: u.teamPermission })),
    apiKeyVisibility: teamGQL.apiKeyVisibility,
    apisCreationPermission: teamGQL.apisCreationPermission,
    verified: teamGQL.verified,
    authorizedOtoroshiEntities: teamGQL.authorizedOtoroshiEntities,
  };
};
