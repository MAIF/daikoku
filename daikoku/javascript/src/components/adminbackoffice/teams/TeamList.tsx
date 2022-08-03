import React, { useContext, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import sortBy from 'lodash/sortBy';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { PaginatedComponent, AvatarWithAction, Can, manage, tenant } from '../../utils';
import { I18nContext, openFormModal } from '../../../core';
import { useTenantBackOffice } from '../../../contexts';
// @ts-expect-error TS(6142): Module '../../backoffice/teams/TeamEdit' was resol... Remove this comment to see the full error message
import { teamSchema } from '../../backoffice/teams/TeamEdit';

export const TeamList = () => {
  const dispatch = useDispatch();
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  useTenantBackOffice();

  const [state, setState] = useState({
    teams: [],
  });
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

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  const deleteTeam = (teamId: any) => {
    (window
    .confirm(translateMethod('delete team', 'Are you sure you want to delete this team ?')) as any).then((ok: any) => {
    if (ok) {
        Services.deleteTeam(teamId).then(() => {
            updateTeams();
        });
    }
});
  };

  const updateTeams = () => {
    Services.teams().then((teams) => setState({ ...state, teams }));
  };

  const filteredTeams = (state as any).search
    ? state.teams.filter(({ name }) => (name as any).toLowerCase().includes((state as any).search))
    : state.teams;

  const actions = (team: any) => {
    const basicActions = [
      {
        action: () => deleteTeam(team._id),
        iconClass: 'fas fa-trash delete-icon',
        tooltip: translateMethod('Delete team'),
      },
      {
        redirect: () => dispatch(openFormModal({
          title: translateMethod('Create a new team'),
          schema: teamSchema(team, translateMethod),
          onSubmit: (data: any) => Services.updateTeam(data)
            .then(r => {
              if (r.error) {
                toastr.error(r.error)
              } else {
                updateTeams()
                toastr.success(translateMethod("Team %s updated successfully", false, "", data.name))
              }
            }),
          value: team
        })),
        iconClass: 'fas fa-pen',
        tooltip: translateMethod('Edit team'),
        actionLabel: translateMethod('Create')
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
        tooltip: translateMethod('Team members'),
      },
    ];
  };

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<Can I={manage} a={tenant} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex justify-content-between align-items-center">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h1>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Teams">Teams</Translation>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <a className="btn btn-sm btn-access-negative mb-1 ms-1" title={translateMethod('Create a new team')} href="#" onClick={(e) => {
        e.preventDefault();
        createNewTeam();
    }}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-plus-circle"/>
            </a>
          </h1>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="col-5">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input placeholder={translateMethod('Find a team')} className="form-control" onChange={(e) => {
        // @ts-expect-error TS(2345): Argument of type '{ search: string; teams: never[]... Remove this comment to see the full error message
        setState({ ...state, search: e.target.value });
    }}/>
          </div>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <PaginatedComponent items={sortBy(filteredTeams, [(team) => (team as any).name.toLowerCase()])} count={8} formatter={(team) => {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return (<AvatarWithAction key={team._id} avatar={team.avatar} infos={<>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span className="team__name text-truncate">{team.name}</span>
                  </>} actions={actions(team)}/>);
    }}/>
      </div>
    </Can>);
};
