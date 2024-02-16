import { useContext } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api as API, CanIDoAction, Option, Spinner, manage } from '../..';
import { ModalContext } from '../../../../contexts';
import { I18nContext } from '../../../../contexts/i18n-context';
import { CurrentUserContext } from '../../../../contexts/userContext';
import * as Services from '../../../../services';
import { isError } from '../../../../types';
import { teamSchema } from '../../../backoffice/teams/TeamEdit';

export const AddPanel = () => {
  const { translate } = useContext(I18nContext);
  const { openFormModal, openTeamSelectorModal } = useContext(ModalContext);

  const { tenant, connectedUser, apiCreationPermitted } = useContext(CurrentUserContext);
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/*');
  const queryClient = useQueryClient();

  const myTeamsRequest = useQuery({ queryKey: ['myTeams'], queryFn: () => Services.myTeams() })

  const createTeam = () => {
    Services.fetchNewTeam()
      .then((team) => openFormModal({
        title: translate('Create a new team'),
        schema: teamSchema(team, translate),
        onSubmit: (data) => Services.createTeam(data)
          .then(r => {
            if (r.error) {
              toast.error(r.error)
            } else {
              queryClient.invalidateQueries({ queryKey: ['teams'] })
              queryClient.invalidateQueries({ queryKey: ['myTeams'] })
              toast.info(translate("mailValidation.sent.body"))
              toast.success(translate({ key: "Team %s created successfully", replacements: [data.name] }))
            }
          }),
        actionLabel: translate('Create'),
        value: team
      }));
  };

  const createApi = (teamId?: string) => {
    if (apiCreationPermitted && !myTeamsRequest.isLoading && myTeamsRequest.data && !isError(myTeamsRequest.data)) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translate('api.creation.title.modal'),
          description: translate('api.creation.description.modal'),
          teams: myTeamsRequest.data
            .filter((t) => t.type !== 'Admin')
            .filter((t) => !tenant.creationSecurity || t.apisCreationPermission)
            .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: (teams) => createApi(teams[0]),
          actionLabel: translate('Create')
        });
      } else {
        const team = myTeamsRequest.data.find((t) => teamId === t._id);

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
    if (apiCreationPermitted && !myTeamsRequest.isLoading && myTeamsRequest.data && !isError(myTeamsRequest.data)) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translate('apigroup.creation.title.modal'),
          description: translate('apigroup.creation.description.modal'),
          teams: myTeamsRequest.data
            .filter((t) => t.type !== 'Admin')
            .filter((t) => !tenant.creationSecurity || t.apisCreationPermission)
            .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: (teams) => createApiGroup(teams[0]),
          actionLabel: translate('Create')
        });
      } else {
        const team = myTeamsRequest.data.find((t) => teamId === t._id);

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

  if (myTeamsRequest.isLoading) {
    return <Spinner />
  } else if (myTeamsRequest.data && !isError(myTeamsRequest.data)) {
    const teams = myTeamsRequest.data
    const maybeTeam: string | undefined = Option(match)
      .map((m) => m.params)
      .map((p) => p.teamId)
      .map((id) => teams.find((t) => t._humanReadableId === id))
      .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted))
      .map((t) => t._id)
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
  } else {
    return <span>Error while fetching teams</span>
  }

};
