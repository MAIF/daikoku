import React, { useContext } from 'react';
import { useNavigate, useMatch } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import faker from 'faker';

import * as Services from '../../../../services';
import { openCreationTeamModal, openTeamSelectorModal } from '../../../../core/modal'
import { manage, CanIDoAction, api as API, Option } from '../..';
import { I18nContext } from '../../../../locales/i18n-context';
import { NavContext } from '../../../../contexts';

export const AddPanel = ({ teams }) => {
  const { translateMethod } = useContext(I18nContext);
  const { team } = useContext(NavContext);

  const { tenant, connectedUser, apiCreationPermitted } = useSelector((state) => state.context)
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/*')

  const myTeams = teams.filter(t => connectedUser.isDaikokuAdmin || t.users.some(u => u.userId === connectedUser._id))

  const createTeam = () => {
    Services.fetchNewTeam()
      .then((team) => openCreationTeamModal({ team })(dispatch));
  };

  const createApi = (teamId) => {
    if (apiCreationPermitted) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translateMethod('api.creation.title.modal'),
          description: translateMethod('api.creation.description.modal'),
          teams: myTeams
            .filter((t) => t.type !== 'Admin')
            .filter((t) => !tenant.creationSecurity || t.apisCreationPermission)
            .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: teams => createApi(teams[0]),
        })(dispatch)
      } else {
        const team = myTeams.find((t) => teamId === t._id);

        return Services.fetchNewApi()
          .then((e) => {
            const verb = faker.hacker.verb();
            const name =
              verb.charAt(0).toUpperCase() +
              verb.slice(1) +
              ' ' +
              faker.hacker.adjective() +
              ' ' +
              faker.hacker.noun() +
              ' api';

            const _humanReadableId = name.replace(/\s/gi, '-').toLowerCase().trim();
            return { ...e, name, _humanReadableId, team: team._id };
          })
          .then((newApi) => navigate(`/${team._humanReadableId}/settings/apis/${newApi._id}/infos`,
            { state: { newApi } })
          );
      }
    }
  };

  const maybeTeam = Option(match)
    .map(m => m.params)
    .map(p => p.teamId)
    .map(id => myTeams.find(t => t._humanReadableId === id))
    .filter(t => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted))
    .map(t => t._id)
    .getOrNull();

  return (
    <div className='ms-3 mt-2 col-8 d-flex flex-column panel'>
      {/* todo: add a title if API page or tenant or Team */}
      <div className='mb-3' style={{ height: '40px' }}></div>
      <div className="blocks">
        <div className="mb-3 block">
          <div className="mb-1 block__category">create</div>
          <div className='ms-2 block__entries d-flex flex-column'>
            {connectedUser.isDaikokuAdmin && <strong className='block__entry__link'>tenant</strong>}
            <strong className='block__entry__link' onClick={createTeam}>team</strong>
            <strong className='block__entry__link' onClick={() => createApi(maybeTeam)}>API</strong>
          </div>
        </div>
        {/* todo: add a block in function of context to create plan...otoroshi or whatever */}
      </div>
    </div>
  )
}