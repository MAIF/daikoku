import Select from 'react-select';
import { useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import sortBy from 'lodash/sortBy';

import * as Services from '../../../services';
import { IApi, isError, ISubscriptionExtended, ITeamSimple } from '../../../types';
import { Spinner } from '../../utils/Spinner';
import { ApiKeyCard, ApiKeysListForApi } from '../../backoffice/apikeys/TeamApiKeysForApi';
import { PaginatedComponent } from '../../utils/PaginatedComponent';
import { I18nContext } from '../../../contexts';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatPlanType } from '../../utils/formatters';
import { apikey, Can, read } from '../../utils/permissions';

type ISubscriptionWithChildren = ISubscriptionExtended & {
  children: Array<ISubscriptionExtended>;
};

type ApiSubscriptions = {
  api: IApi
  ownerTeam: ITeamSimple
  subscribingTeams: ITeamSimple[]
}


export const ApiSubscriptions = (props: ApiSubscriptions) => {
  const navigate = useNavigate();

  const { translate, Translation } = useContext(I18nContext);

  const [selectedTeam, setSelectedTeam] = useState<ITeamSimple>()

  const subscriptionsQuery = useQuery({
    queryKey: ["subscriptions", selectedTeam?._id],
    queryFn: () => Services.getTeamSubscriptions(props.api._id, selectedTeam!._id, props.api.currentVersion),
    enabled: !!selectedTeam
  })

  return (
    <div>
      <Select
        options={props.subscribingTeams.map(value => ({ label: value.name, value: value }))}
        onChange={t => setSelectedTeam(t?.value)} />

      {!selectedTeam && (<span>please select a team</span>)}

      {subscriptionsQuery.isLoading && <Spinner />}

      {selectedTeam && subscriptionsQuery.data && !isError(subscriptionsQuery.data) && (
        <ApiKeysListForApi
          team={selectedTeam}
          api={props.api}
          ownerTeam={props.ownerTeam}
          linkToChildren={(api, team) => `/${team}/${api._humanReadableId}/${api!.currentVersion}/apikeys`} />
      )}
    </div>
  )
}
