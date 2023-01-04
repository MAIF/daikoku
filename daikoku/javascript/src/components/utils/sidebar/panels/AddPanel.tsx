import React, { useContext } from 'react';
import { useNavigate, useMatch, PathMatch, Params } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';

import * as Services from '../../../../services';
import { manage, CanIDoAction, api as API, Option } from '../..';
import { I18nContext } from '../../../../contexts/i18n-context';
import { teamSchema } from '../../../backoffice/teams/TeamEdit'
import { toastr } from 'react-redux-toastr';
import { useQueryClient } from '@tanstack/react-query';
import { IState, IStateContext, ITeamSimple } from '../../../../types';
import { ModalContext } from '../../../../contexts';

export const AddPanel = ({
  teams
}: {teams: Array<ITeamSimple>}) => {
  const { translate } = useContext(I18nContext);
  const { openFormModal, openTeamSelectorModal } = useContext(ModalContext);

  const { tenant, connectedUser, apiCreationPermitted } = useSelector<IState, IStateContext>((state) => state.context);
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/*');
  const queryClient = useQueryClient();

  const myTeams = teams.filter((t) => connectedUser.isDaikokuAdmin || t.users.some((u) => u.userId === connectedUser._id));

  const createTeam = () => {
    Services.fetchNewTeam()
      .then((team) => openFormModal({
        title: translate('Create a new team'),
        schema: teamSchema(team, translate),
        onSubmit: (data) => Services.createTeam(data)
          .then(r => {
            if (r.error) {
              toastr.error(translate('Error'), r.error)
            } else {
              queryClient.invalidateQueries(['teams'])
              queryClient.invalidateQueries(['myTeams'])
              toastr.success(translate('Success'), translate({ key: "Team %s created successfully", replacements: [data.name] }))
            }
          }),
        actionLabel: translate('Create'),
        value: team
      }));
  };

  const createApi = (teamId: string) => {
    if (apiCreationPermitted) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translate('api.creation.title.modal'),
          description: translate('api.creation.description.modal'),
          teams: myTeams
            .filter((t) => t.type !== 'Admin')
            .filter((t) => !tenant.creationSecurity || t.apisCreationPermission)
            .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: (teams) => createApi(teams[0]),
          actionLabel: translate('Create')
        });
      } else {
        const team = myTeams.find((t) => teamId === t._id);

        return Services.fetchNewApi()
          .then((e) => {
            return { ...e, team: team?._id };
          })
          .then((newApi) =>
            navigate(`/${team?._humanReadableId}/settings/apis/${newApi._id}/infos`, {
              state: { newApi },
            })
          );
      }
    }
  };

  const createApiGroup = (teamId) => {
    if (apiCreationPermitted) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translate('apigroup.creation.title.modal'),
          description: translate('apigroup.creation.description.modal'),
          teams: myTeams
            .filter((t) => t.type !== 'Admin')
            .filter((t) => !tenant.creationSecurity || t.apisCreationPermission)
            .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: (teams) => createApiGroup(teams[0]),
          actionLabel: translate('Create')
        });
      } else {
        const team = myTeams.find((t) => teamId === t._id);

        return Services.fetchNewApiGroup()
          .then((e) => {
            return { ...e, team: team?._id };
          })
          .then((newApiGroup) =>
            navigate(`/${team?._humanReadableId}/settings/apigroups/${newApiGroup._id}/infos`, {
              state: { newApiGroup },
            })
          );
      }
    }
  };

  const createTenant = () => {
    Services.fetchNewTenant()
      .then((newTenant) => {
        navigate(`/settings/tenants/${newTenant._id}/general`, {
          state: {
            newTenant,
          },
        });
      });
  }

  const maybeTeam = Option(match)
    .map((m: PathMatch) => m.params)
    .map((p: Params) => p.teamId)
    .map((id: string) => myTeams.find((t) => t._humanReadableId === id))
    .filter((t: ITeamSimple) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted))
    .map((t: ITeamSimple) => t._id)
    .getOrNull();

  return (
    <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
      {/* todo: add a title if API page or tenant or Team */}
      <div>
        <h3>{translate('Create')}</h3>
      </div>
      <div className="blocks">
        <div className="mb-3 block">
          <div className="block__entries d-flex flex-column">
            {connectedUser.isDaikokuAdmin && (
              <span
                className="block__entry__link d-flex align-items-center justify-content-between"
                onClick={createTenant}>
                <span>{translate('Tenant')}</span>
                <button className="btn btn-sm btn-access-negative me-1">
                  <i className="fas fa-plus-circle" />
                </button>
              </span>
            )}
            <span
              className="block__entry__link d-flex align-items-center justify-content-between"
              onClick={createTeam}
            >
              <span>{translate('Team')}</span>
              <button className="btn btn-sm btn-access-negative me-1">
                <i className="fas fa-plus-circle" />
              </button>
            </span>
            <span
              className="block__entry__link d-flex align-items-center justify-content-between"
              onClick={() => createApi(maybeTeam)}
            >
              <span>{translate('API')}</span>
              <button className="btn btn-sm btn-access-negative me-1">
                <i className="fas fa-plus-circle" />
              </button>
            </span>
            <span
              className="block__entry__link d-flex align-items-center justify-content-between"
              onClick={() => createApiGroup(maybeTeam)}
            >
              <span>{translate('API group')}</span>
              <button className="btn btn-sm btn-access-negative me-1">
                <i className="fas fa-plus-circle" />
              </button>
            </span>
          </div>
        </div>
        {/* todo: add a block in function of context to create plan...otoroshi or whatever */}
      </div>
    </div>
  );
};
