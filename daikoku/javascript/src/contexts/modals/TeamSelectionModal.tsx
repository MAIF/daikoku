import classNames from 'classnames';
import { useContext, useState } from 'react';
import Square from 'react-feather/dist/icons/square';
import CheckSquare from 'react-feather/dist/icons/check-square';

import { I18nContext } from '../../contexts';
import { ITeamSimple } from '../../types';
import { IBaseModalProps, TeamSelectorModalProps } from './types';

export const TeamSelectorModal = ({ title, description, teams, pendingTeams = [], acceptedTeams = [], action, allTeamSelector, allowMultipleDemand, actionLabel, close }: TeamSelectorModalProps & IBaseModalProps) => {
  const [selectedTeams, setSelectedTeams] = useState<Array<string>>([]);

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

  const getButton = (team: ITeamSimple) => {
    if (!allowMultipleDemand && pendingTeams.includes(team._id)) {
      return (
        <button type="button" className="btn btn-sm btn-outline-primary disabled">
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

  const getTeamLabel = (team: ITeamSimple) => {
    return team.name;
  };

  const doTeamAction = (team: ITeamSimple) => {
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

  const actionAndClose = (teams: Array<string>) => {
    const res = action(teams);
    if (res instanceof Promise) {
      res
        .then(() => close());
    } else {
      close();
    }
  };

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title" id='modal-title'>{title}</h5>
        <button type="button" className="btn-close" aria-label={translate("Close")} onClick={close} />
      </div>
      <div className="modal-body">
        <div className="modal-description" id="modal-description">{description}</div>
        <div className="team-selection__container" role='list' aria-labelledby='modal-title' aria-describedby='modal-description'>
          {!!allTeamSelector && !!allTeams.length && (
            <button
              role='listitem'
              key={'all'}
              className="team-selection team-selection__all-team selectable btn"
              onClick={() => toggleAllTeam()}
            >
              {selectedTeams.length === allTeams.length ? <CheckSquare /> : <Square />}
              <span className="ms-2">
                <Translation i18nkey="All">All</Translation>
              </span>
            </button>
          )}
          {teams.map((team) => {
            const teamName = getTeamLabel(team);
            return (
              <button
                type='button'
                role='listitem'
                aria-label={teamName}
                key={team._id}
                className={classNames('team-selection team-selection__team btn', {
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
                <span className="ms-2">{teamName}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={close} aria-label={translate('Close')}>
          {translate('Close')}
        </button>
        {!!allTeamSelector && (
          <button
            type="button"
            className={classNames('btn btn-outline-success', {
              disabled: !selectedTeams.length,
            })}
            onClick={() => finalAction()}
            aria-label={actionLabel}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
};
