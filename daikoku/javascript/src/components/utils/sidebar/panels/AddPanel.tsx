import React, { useContext } from 'react';
import { useNavigate, useMatch } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';

import * as Services from '../../../../services';
import { openFormModal, openTeamSelectorModal } from '../../../../core/modal';
import { manage, CanIDoAction, api as API, Option } from '../..';
import { I18nContext } from '../../../../locales/i18n-context';
import { teamSchema } from '../../../backoffice/teams/TeamEdit'
import { toastr } from 'react-redux-toastr';

export const AddPanel = ({
  teams
}: any) => {
  const { translate } = useContext(I18nContext);

  const { tenant, connectedUser, apiCreationPermitted } = useSelector((state) => (state as any).context);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/*');

  const myTeams = teams.filter(
    (t: any) => connectedUser.isDaikokuAdmin || t.users.some((u: any) => u.userId === connectedUser._id)
  );

  const createTeam = () => {
    Services.fetchNewTeam()
      .then((team) => dispatch(openFormModal({
        title: translate('Create a new team'),
        schema: teamSchema(team, translate),
        onSubmit: (data: any) => Services.createTeam(data)
          .then(r => {
            if (r.error) {
              toastr.error(translate('Error'), r.error)
            } else {
              toastr.success(translate('Success'), translate({ key: "Team %s created successfully", replacements: [data.name] }))
            }
          }),
        actionLabel: translate('Create'),
        value: team
      })));
  };

  const createApi = (teamId: any) => {
    if (apiCreationPermitted) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translate('api.creation.title.modal'),
          description: translate('api.creation.description.modal'),
          teams: myTeams
            .filter((t: any) => t.type !== 'Admin')
            .filter((t: any) => !tenant.creationSecurity || t.apisCreationPermission)
            .filter((t: any) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: (teams: any) => createApi(teams[0]),
        })(dispatch);
      } else {
        const team = myTeams.find((t: any) => teamId === t._id);

        return Services.fetchNewApi()
          .then((e) => {
            return { ...e, team: team._id };
          })
          .then((newApi) =>
            navigate(`/${team._humanReadableId}/settings/apis/${newApi._id}/infos`, {
              state: { newApi },
            })
          );
      }
    }
  };

  const createApiGroup = (teamId: any) => {
    if (apiCreationPermitted) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translate('apigroup.creation.title.modal'),
          description: translate('apigroup.creation.description.modal'),
          teams: myTeams
            .filter((t: any) => t.type !== 'Admin')
            .filter((t: any) => !tenant.creationSecurity || t.apisCreationPermission)
            .filter((t: any) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: (teams: any) => createApiGroup(teams[0]),
        })(dispatch);
      } else {
        const team = myTeams.find((t: any) => teamId === t._id);

        return Services.fetchNewApiGroup()
          .then((e) => {
            return { ...e, team: team._id };
          })
          .then((newApiGroup) =>
            navigate(`/${team._humanReadableId}/settings/apigroups/${newApiGroup._id}/infos`, {
              state: { newApiGroup },
            })
          );
      }
    }
  };

  const maybeTeam = Option(match)
    .map((m: any) => m.params)
    .map((p: any) => p.teamId)
    .map((id: any) => myTeams.find((t: any) => t._humanReadableId === id))
    .filter((t: any) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted))
    .map((t: any) => t._id)
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
              <span className="block__entry__link d-flex align-items-center justify-content-between">
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
