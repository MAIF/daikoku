import {useContext} from 'react';
import Select from 'react-select';

import {I18nContext} from '../../../contexts';
import {IApi, ITeamSimple} from '../../../types';
import {ApiKeysListForApi} from '../../backoffice/apikeys/TeamApiKeysForApi';
import {useSearchParams} from 'react-router-dom';

type ApiSubscriptions = {
  api: IApi
  ownerTeam: ITeamSimple
  subscribingTeams: ITeamSimple[]
}


export const ApiSubscriptions = (props: ApiSubscriptions) => {

  const {translate} = useContext(I18nContext);
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTeamId = searchParams.get("team")

  const selectedTeam = props.subscribingTeams.find(t => t._id === urlTeamId)
    ?? props.subscribingTeams[0];

  if (!selectedTeam) {
    return <div className="alert alert-info" role="status">
      {translate('api.subscriptions.team.empty')}
    </div>;
  }

  return (
    <div>
      <Select
        className='col-3'
        classNamePrefix="reactSelect"
        placeholder={translate('api.subscriptions.team.select.placeholder')}
        options={props.subscribingTeams.map(value => ({label: value.name, value: value}))}
        onChange={t => {
          if (!t) return;
          setSearchParams((searchParams) => {
            searchParams.set("team", t.value._id);
            return searchParams;
          });
        }}
        value={{label: selectedTeam?.name, value: selectedTeam}}
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
              <span className={`badge --primary`}>
                {translate('Team')}
              </span>{props.data.label}
            </div>
          }
        }}/>
      <ApiKeysListForApi
        key={selectedTeam._id}
        team={selectedTeam}
        api={props.api}
        ownerTeam={props.ownerTeam}
        linkToChildren={(api, team) => `/${team}/${api._humanReadableId}/${api!.currentVersion}/keyrings`}
      />
    </div>
  )
}
