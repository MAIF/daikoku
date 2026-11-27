import { useContext } from 'react';
import { useSearchParams } from 'react-router-dom';

import { I18nContext } from '../../../contexts';
import { IApi, ITeamSimple } from '../../../types';
import { ApiKeysListForApi } from '../../backoffice/apikeys/TeamApiKeysForApi';
import { ScopeSelect } from '../../inputs';

type ApiSubscriptions = {
  api: IApi;
  ownerTeam: ITeamSimple;
  subscribingTeams: ITeamSimple[];
};

export const ApiSubscriptions = (props: ApiSubscriptions) => {
  const { translate } = useContext(I18nContext);
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedTeam =
    props.subscribingTeams.find((team) => team._id === searchParams.get('team')) ?? props.subscribingTeams[0];

  if (!selectedTeam) {
    return (
      <div className="alert alert-info" role="status">
        {translate('api.subscriptions.team.empty')}
      </div>
    );
  }

  return (
    <div>
      <ScopeSelect
        badge={translate('Team')}
        ariaLabel={translate('api.subscriptions.team.select.placeholder')}
        options={props.subscribingTeams.map((team) => ({ label: team.name, value: team._id }))}
        value={selectedTeam._id}
        onChange={(teamId) =>
          setSearchParams((params) => {
            params.set('team', teamId);
            return params;
          })
        }
      />
      <ApiKeysListForApi key={selectedTeam._id} team={selectedTeam} api={props.api} ownerTeam={props.ownerTeam} />
    </div>
  );
};
