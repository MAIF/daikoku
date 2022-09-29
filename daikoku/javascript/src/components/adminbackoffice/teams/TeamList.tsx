import React, { useContext, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import sortBy from 'lodash/sortBy';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { PaginatedComponent, AvatarWithAction, Can, manage, tenant } from '../../utils';
import { I18nContext, openFormModal } from '../../../core';
import { useTenantBackOffice } from '../../../contexts';
import { teamSchema } from '../../backoffice/teams/TeamEdit';

export const TeamList = () => {
  const dispatch = useDispatch();
  useTenantBackOffice();

  const [teams, setTeams] = useState<Array<any>>([]);
  const [search, setSearch] = useState<string>();

  const navigate = useNavigate();

  const createNewTeam = () => {
    Services.fetchNewTeam().then((newTeam) => {
      navigate(`/settings/teams/${newTeam._id}`, {
        state: {
          newTeam,
        },
      });
    });
  };

  useEffect(() => {
    updateTeams();
  }, []);

  const { translate, Translation } = useContext(I18nContext);

  const deleteTeam = (teamId: any) => {
    //@ts-ignore //FIXME when monkey patch & ts will be compatible
    (window.confirm(translate('delete team', 'Are you sure you want to delete this team ?'))).then((ok: any) => {
      if (ok) {
        Services.deleteTeam(teamId).then(() => {
          updateTeams();
        });
      }
    });
  };

  const updateTeams = () => {
    Services.teams()
      .then((teams) => setTeams(teams));
  };

  const filteredTeams = search
    ? teams.filter(({ name }) => name.toLowerCase().includes(search))
    : teams;

  const actions = (team: any) => {
    const basicActions = [
      {
        action: () => deleteTeam(team._id),
        iconClass: 'fas fa-trash delete-icon',
        tooltip: translate('Delete team'),
      },
      {
        redirect: () => dispatch(openFormModal({
          title: translate('Create a new team'),
          schema: teamSchema(team, translate),
          onSubmit: (data: any) => Services.updateTeam(data)
            .then(r => {
              if (r.error) {
                toastr.error(translate('Error'), r.error)
              } else {
                updateTeams()
                toastr.success(translate('Success'), translate({ key: "team.updated.success", replacements: [data.name] }))
              }
            }),
          value: team
        })),
        iconClass: 'fas fa-pen',
        tooltip: translate('Edit team'),
        actionLabel: translate('Create')
      },
    ];

    if (team.type === 'Personal') {
      return basicActions;
    }

    return [
      ...basicActions,
      {
        redirect: () => navigate(`/settings/teams/${team._humanReadableId}/members`),
        iconClass: 'fas fa-users',
        tooltip: translate('Team members'),
      },
    ];
  };

  return (<Can I={manage} a={tenant} dispatchError>
    <div className="row">
      <div className="d-flex justify-content-between align-items-center">
        <h1>
          <Translation i18nkey="Teams">Teams</Translation>
          <a className="btn btn-sm btn-access-negative mb-1 ms-1" title={translate('Create a new team')} href="#" onClick={(e) => {
            e.preventDefault();
            createNewTeam();
          }}>
            <i className="fas fa-plus-circle" />
          </a>
        </h1>
        <div className="col-5">
          <input
            placeholder={translate('Find a team')}
            className="form-control"
            onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <PaginatedComponent items={sortBy(filteredTeams, [(team) => (team as any).name.toLowerCase()])} count={8} formatter={(team) => {
        return (<AvatarWithAction key={team._id} avatar={team.avatar} infos={<>
          <span className="team__name text-truncate">{team.name}</span>
        </>} actions={actions(team)} />);
      }} />
    </div>
  </Can>);
};
