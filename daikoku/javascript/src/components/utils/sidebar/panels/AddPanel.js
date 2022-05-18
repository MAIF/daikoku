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

  const createApiGroup = (teamId) => {
    if (apiCreationPermitted) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translateMethod('apigroup.creation.title.modal'),
          description: translateMethod('apigroup.creation.description.modal'),
          teams: myTeams
            .filter((t) => t.type !== 'Admin')
            .filter((t) => !tenant.creationSecurity || t.apisCreationPermission)
            .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: teams => createApiGroup(teams[0]),
        })(dispatch)
      } else {
        const team = myTeams.find((t) => teamId === t._id);

        return Services.fetchNewApiGroup()
          .then((e) => {
            const verb = faker.hacker.verb();
            const name =
              verb.charAt(0).toUpperCase() +
              verb.slice(1) +
              ' ' +
              faker.hacker.adjective() +
              ' ' +
              faker.hacker.noun() +
              ' apigroup';

            const _humanReadableId = name.replace(/\s/gi, '-').toLowerCase().trim();
            return { ...e, name, _humanReadableId, team: team._id };
          })
          .then((newApiGroup) => navigate(`/${team._humanReadableId}/settings/apigroups/${newApiGroup._id}/infos`,
            { state: { newApiGroup } })
          );
      }
    }
  }

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
      <div><h3>{translateMethod("Create")}</h3></div>
      <div className="blocks">
        <div className="mb-3 block">
          <div className='block__entries d-flex flex-column'>
            {connectedUser.isDaikokuAdmin && 
            <span className='block__entry__link d-flex align-items-center justify-content-between'>
              <span>{translateMethod('Tenant')}</span>
              <button className="btn btn-sm btn-access-negative me-1">
                <i className="fas fa-plus-circle" />
              </button>
            </span>
            }
            <span className='block__entry__link d-flex align-items-center justify-content-between' onClick={createTeam}>
              <span>{translateMethod('Team')}</span>
              <button className="btn btn-sm btn-access-negative me-1">
                <i className="fas fa-plus-circle" />
              </button>
            </span>
            <span className='block__entry__link d-flex align-items-center justify-content-between' onClick={() => createApi(maybeTeam)}>
              <span>{translateMethod('API')}</span>
              <button className="btn btn-sm btn-access-negative me-1">
                <i className="fas fa-plus-circle" />
              </button>
            </span>
            <span className='block__entry__link d-flex align-items-center justify-content-between' onClick={() => createApiGroup(maybeTeam)}>
              <span>{translateMethod('API group')}</span>
              <button className="btn btn-sm btn-access-negative me-1">
                <i className="fas fa-plus-circle" />
              </button>
            </span>
          </div>
        </div>
        {/* todo: add a block in function of context to create plan...otoroshi or whatever */}
      </div>
    </div>
  )
}