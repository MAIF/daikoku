import React, { useContext, useState } from 'react';
import { CheckSquare, Square } from 'react-feather';
import classNames from 'classnames';
import { closeModal, I18nContext } from '../../../core';
import { useDispatch } from 'react-redux';

export type TeamSelectorModalProps = {
  title: string;
  description?: string;
  teams: any[];
  pendingTeams?: any[];
  acceptedTeams?: any[];
  action: (...args: any[]) => any;
  allTeamSelector?: boolean;
  allowMultipleDemand?: boolean;
  actionLabel: string
};

export const TeamSelectorModal = ({ title, description, teams, pendingTeams = [], acceptedTeams = [], action, allTeamSelector, allowMultipleDemand, actionLabel }: TeamSelectorModalProps) => {
  const [selectedTeams, setSelectedTeams] = useState<Array<any>>([]);


  const dispatch = useDispatch();

  const allTeams = teams.filter(
    (team) => allowMultipleDemand || ![...pendingTeams, ...acceptedTeams].includes(team._id)
  );

  const { translate, Translation } = useContext(I18nContext);

  const finalAction = () => {
    if (selectedTeams.length) {
      actionAndClose(selectedTeams);
    }
  };

  const toggleAllTeam = () => {
    if (selectedTeams.length === allTeams.length) {
      setSelectedTeams([]);
    } else {
      setSelectedTeams([...allTeams.map((t) => t._id)]);
    }
  };

  const getButton = (team: any) => {
    if (!allowMultipleDemand && pendingTeams.includes(team._id)) {
      return (
        <button type="button" className="btn btn-sm btn-access disabled">
          <Translation i18nkey="Request in progress" />
        </button>
      );
    } else if (allowMultipleDemand || !acceptedTeams.includes(team._id)) {
      if (selectedTeams.includes(team._id)) {
        return <CheckSquare />;
      }

      if (allTeamSelector) {
        return <Square />;
      }
    }
  };

  const getTeamLabel = (team: any) => {
    return team.name;
  };

  const doTeamAction = (team: any) => {
    if (
      allowMultipleDemand ||
      (!pendingTeams.includes(team._id) && !acceptedTeams.includes(team._id))
    ) {
      if (allTeamSelector) {
        if (selectedTeams.includes(team._id)) {
          setSelectedTeams(selectedTeams.filter((t) => t !== team._id));
        } else {
          setSelectedTeams([...selectedTeams, team._id]);
        }
      } else {
        actionAndClose([team._id]);
      }
    }
  };

  const actionAndClose = (teams: any) => {
    if (action instanceof Promise) {
      action(teams)
        .then(() => dispatch(closeModal()));
    } else {
      dispatch(closeModal());
      action(teams);
    }
  };

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{title}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={() => dispatch(closeModal())} />
      </div>
      <div className="modal-body">
        <div className="modal-description">{description}</div>
        <div className="team-selection__container">
          {!!allTeamSelector && !!allTeams.length && (
            <div
              key={'all'}
              className="team-selection team-selection__all-team selectable"
              onClick={() => toggleAllTeam()}
            >
              {selectedTeams.length === allTeams.length ? <CheckSquare /> : <Square />}
              <span className="ms-2">
                <Translation i18nkey="All">All</Translation>
              </span>
            </div>
          )}
          {teams.map((team) => {
            return (
              <div
                key={team._id}
                className={classNames('team-selection team-selection__team', {
                  selectable:
                    allowMultipleDemand ||
                    (!pendingTeams.includes(team._id) && !acceptedTeams.includes(team._id)),
                  'cursor-forbidden': !(
                    allowMultipleDemand ||
                    (!pendingTeams.includes(team._id) && !acceptedTeams.includes(team._id))
                  ),
                })}
                onClick={() => doTeamAction(team)}
              >
                {getButton(team)}
                <span className="ms-2">{getTeamLabel(team)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => dispatch(closeModal())}>
          {translate('Close')}
        </button>
        {!!allTeamSelector && (
          <button
            type="button"
            className={classNames('btn btn-outline-success', {
              disabled: !selectedTeams.length,
            })}
            onClick={() => finalAction()}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
};
