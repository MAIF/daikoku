import React, { useContext, useState } from 'react';
import { PropTypes } from 'prop-types';
import { CheckSquare, Square } from 'react-feather';
import classNames from 'classnames';
import { I18nContext } from '../../../core';

export const TeamSelectorModal = ({
  closeModal,
  title,
  description,
  teams,
  pendingTeams = [],
  acceptedTeams = [],
  action,
  allTeamSelector,
  allowMultipleDemand,
}) => {
  const [selectedTeams, setSelectedTeams] = useState([]);
  const allTeams = teams.filter(
    (team) => allowMultipleDemand || ![...pendingTeams, ...acceptedTeams].includes(team._id)
  );

  const { translateMethod, Translation } = useContext(I18nContext);

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

  const getButton = (team) => {
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

  const getTeamLabel = (team) => {
    return team.name;
  };

  const doTeamAction = (team) => {
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

  const actionAndClose = (teams) => {
    if (action instanceof Promise) {
      action(teams).then(() => closeModal());
    } else {
      closeModal();
      action(teams);
    }
  };

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{title}</h5>
        <button type="button" className="close" aria-label="Close" onClick={closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="modal-body">
        <div className="modal-description">{description}</div>
        <div className="team-selection__container">
          {!!allTeamSelector && !!allTeams.length && (
            <div
              key={'all'}
              className="team-selection team-selection__all-team selectable"
              onClick={() => toggleAllTeam()}>
              {selectedTeams.length === allTeams.length ? <CheckSquare /> : <Square />}
              <span className="ml-2">
                <Translation i18nkey="All">
                  All
                </Translation>
              </span>
            </div>
          )}
          {teams
            .filter(
              (team) =>
                allowMultipleDemand ||
                (!pendingTeams.includes(team._id) && !acceptedTeams.includes(team._id))
            )
            .map((team) => {
              return (
                <div
                  key={team._id}
                  className={classNames('team-selection team-selection__team', {
                    selectable:
                      allowMultipleDemand ||
                      (!pendingTeams.includes(team._id) && !acceptedTeams.includes(team._id)),
                  })}
                  onClick={() => doTeamAction(team)}>
                  {getButton(team)}
                  <span className="ml-2">{getTeamLabel(team)}</span>
                </div>
              );
            })}
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => closeModal()}>
          {translateMethod('Close')}
        </button>
        {!!allTeamSelector && (
          <button
            type="button"
            className={classNames('btn btn-outline-success', {
              disabled: !selectedTeams.length,
            })}
            onClick={() => finalAction()}>
            {translateMethod('Subscribe')}
          </button>
        )}
      </div>
    </div>
  );
};

TeamSelectorModal.propTypes = {
  closeModal: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  teams: PropTypes.array.isRequired,
  pendingTeams: PropTypes.array,
  acceptedTeams: PropTypes.array,
  action: PropTypes.func.isRequired,
  allTeamSelector: PropTypes.bool,
  allowMultipleDemand: PropTypes.bool,
};
