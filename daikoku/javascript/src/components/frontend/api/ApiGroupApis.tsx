import { getApolloContext } from '@apollo/client';
import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { NavContext } from '../../../contexts';
import * as Services from '../../../services';
import { IApi, IApiWithAuthorization, ITeamSimple } from '../../../types';
import { ApiList } from '../team';

type ApiGroupApisProps = {
  apiGroup: IApi
  ownerTeam: ITeamSimple
}
export const ApiGroupApis = ({
  apiGroup,
  ownerTeam
}: ApiGroupApisProps) => {
  const { setApiGroup } = useContext(NavContext);
  const navigate = useNavigate();
  const [myTeams, setMyTeams] = useState<Array<ITeamSimple>>([]);

  const { client } = useContext(getApolloContext());

  useEffect(() => {
    if (!client) {
      return;
    }
    Promise.all([
      client.query<{ myTeams: Array<ITeamSimple> }>({
        query: Services.graphql.myTeams,
      }),
    ]).then(([{ data }]) => {
      setMyTeams(
        data.myTeams.map(({
          users,
          ...data
        }: any) => ({
          ...data,
          users: users.map(({
            teamPermission,
            user
          }: any) => ({ ...user, teamPermission })),
        }))
      );
    });
  }, [apiGroup]);

  const redirectToApiPage = (apiWithAuthorization: IApiWithAuthorization) => {
    setApiGroup(apiGroup)
    navigate(`/${ownerTeam._humanReadableId}/${apiWithAuthorization.api._humanReadableId}/${apiWithAuthorization.api.currentVersion}/description`);
  };

  return (
    <ApiList
      myTeams={myTeams}
      teamVisible={true}
      redirectToApiPage={redirectToApiPage}
      groupView={true}
      apiGroupId={apiGroup._id}
    />
  );
};
