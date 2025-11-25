import { useQuery } from '@tanstack/react-query';
import { useContext, useState } from 'react';
import Select from 'react-select';

import { I18nContext } from '../../../contexts';
import * as Services from '../../../services';
import { IApi, isError, ITeamSimple } from '../../../types';
import { ApiKeysListForApi } from '../../backoffice/apikeys/TeamApiKeysForApi';
import { Spinner } from '../../utils/Spinner';

type ApiSubscriptions = {
  api: IApi
  ownerTeam: ITeamSimple
  subscribingTeams: ITeamSimple[]
}


export const ApiSubscriptions = (props: ApiSubscriptions) => {

  const { translate } = useContext(I18nContext);

  const [selectedTeam, setSelectedTeam] = useState<ITeamSimple | null>(props.subscribingTeams[0])

  const subscriptionsQuery = useQuery({
    queryKey: ["subscriptions", selectedTeam?._id],
    queryFn: () => Services.getTeamSubscriptions(props.api._id, selectedTeam!._id, props.api.currentVersion),
    enabled: !!selectedTeam
  })

  return (
    <div>
      <Select
        className='col-3'
        placeholder={translate('api.subscriptions.team.select.placeholder')}
        options={props.subscribingTeams.map(value => ({ label: value.name, value: value }))}
        onChange={t => setSelectedTeam(t?.value!)}
        value={{ label: selectedTeam?.name, value: selectedTeam }}
        styles={{
          valueContainer: (baseStyles) => ({
            ...baseStyles,
            display: 'flex'
          }),
        }}
        components={{
          IndicatorSeparator: () => null,
          SingleValue: (props) => {
            return <div className='d-flex align-items-center m-0' style={{
              gap: '.5rem'
            }}>
              <span className={`badge badge-custom`}>
                {'TEAM'}
              </span>{props.data.label}
            </div>
          }
        }} />

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
