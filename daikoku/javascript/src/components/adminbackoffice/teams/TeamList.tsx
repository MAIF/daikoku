import React, { useContext, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import sortBy from 'lodash/sortBy';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { PaginatedComponent, AvatarWithAction, Can, manage, tenant, Spinner } from '../../utils';
import { I18nContext, openFormModal } from '../../../core';
import { ModalContext, useTenantBackOffice } from '../../../contexts';
import { teamSchema } from '../../backoffice/teams/TeamEdit';
import { ITeamSimple } from '../../../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export const TeamList = () => {
  const dispatch = useDispatch();
  useTenantBackOffice();

  const { translate, Translation } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const queryClient = useQueryClient();
  const teamRequest = useQuery(['teams'], () => Services.teams());

  const [search, setSearch] = useState<string>();

  const navigate = useNavigate();

  const createNewTeam = () => {
    Services.fetchNewTeam()
      .then((newTeam) => {
        dispatch(openFormModal({
          title: translate('Create a new team'),
          actionLabel: translate('Create'),
          schema: teamSchema(newTeam, translate),
          onSubmit: (data: ITeamSimple) => Services.createTeam(data)
            .then(r => {
              if (r.error) {
                toastr.error(translate('Error'), r.error)
              } else {
                queryClient.invalidateQueries(['teams']);
                toastr.success(translate('Success'), translate({ key: "team.created.success", replacements: [data.name] }))
              }
            }),
          value: newTeam
        }))
      });
  };


  const deleteTeam = (teamId: string) => {
    confirm({ message: translate('delete team') })
      .then((ok) => {
        if (ok) {
          Services.deleteTeam(teamId)
            .then(() => {
              queryClient.invalidateQueries(['teams']);
            });
        }
      });
  };


  if (teamRequest.isLoading) {
    return <Spinner />
  } else if (teamRequest.data) {
    const filteredTeams = search
      ? teamRequest.data.filter(({ name }) => name.toLowerCase().includes(search))
      : teamRequest.data;

    const actions = (team: any) => {
      const basicActions = [
        {
          action: () => deleteTeam(team._id),
          variant: 'error',
          iconClass: 'fas fa-trash delete-icon',
          tooltip: translate('Delete team'),
        },
        {
          redirect: () => dispatch(openFormModal({
            title: translate('Update team'),
            actionLabel: translate('Update'),
            schema: teamSchema(team, translate),
            onSubmit: (data: any) => Services.updateTeam(data)
              .then(r => {
                if (r.error) {
                  toastr.error(translate('Error'), r.error)
                } else {
                  toastr.success(translate('Success'), translate({ key: "team.updated.success", replacements: [data.name] }))
                  queryClient.invalidateQueries(['teams']);
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
          action: () => navigate(`/settings/teams/${team._humanReadableId}/members`),
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
            <button
              className="btn btn-sm btn-access-negative mb-1 ms-1"
              title={translate('Create a new team')}
              onClick={createNewTeam}>
              <i className="fas fa-plus-circle" />
            </button>
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
  } else {
    //FIXME: better display of error
    return (
      <div>Error while fetching teams</div>
    )
  }


};
