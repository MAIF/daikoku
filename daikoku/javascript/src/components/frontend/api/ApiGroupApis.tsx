import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import * as Services from '../../../services';
import { IApi, IApiWithAuthorization, ITeamFullGql, ITeamSimple } from '../../../types';
import { ApiList } from '../team';
import { NavContext } from '../../../contexts/navUtils';
import { GlobalContext } from '../../../contexts/globalContext';
import { teamGQLToLegitTeam } from '../../utils/graphqlUtils';

type ApiGroupApisProps = {
  apiGroup: IApi
  ownerTeam: ITeamSimple
}
export const ApiGroupApis = ({
  apiGroup,
  ownerTeam
}: ApiGroupApisProps) => {
  const { setApiGroup } = useContext(NavContext);
  const { customGraphQLClient } = useContext(GlobalContext);
  const navigate = useNavigate();
  const [myTeams, setMyTeams] = useState<Array<ITeamSimple>>([]);


  useEffect(() => {
    customGraphQLClient.request<{ myTeams: Array<ITeamFullGql> }>(Services.graphql.myTeams)
      .then((data) => 
        setMyTeams(
          data.myTeams.map(teamGQLToLegitTeam))
        );
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
