import React, { useContext, useState } from 'react';
import { CheckSquare, Square } from 'react-feather';
import classNames from 'classnames';
import { I18nContext } from '../../../core';

type Props = {
    closeModal: (...args: any[]) => any;
    title: string;
    description?: string;
    teams: any[];
    pendingTeams?: any[];
    acceptedTeams?: any[];
    action: (...args: any[]) => any;
    allTeamSelector?: boolean;
    allowMultipleDemand?: boolean;
};

export const TeamSelectorModal = ({ closeModal, title, description, teams, pendingTeams = [], acceptedTeams = [], action, allTeamSelector, allowMultipleDemand, }: Props) => {
  const [selectedTeams, setSelectedTeams] = useState([]);
  const allTeams = teams.filter(
    (team) => allowMultipleDemand || ![...pendingTeams, ...acceptedTeams].includes(team._id)
  );

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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
      // @ts-expect-error TS(2345): Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
      setSelectedTeams([...allTeams.map((t) => t._id)]);
    }
  };

  const getButton = (team: any) => {
    if (!allowMultipleDemand && pendingTeams.includes(team._id)) {
      return (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <button type="button" className="btn btn-sm btn-access disabled">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Request in progress" />
        </button>
      );
    } else if (allowMultipleDemand || !acceptedTeams.includes(team._id)) {
      // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
      if (selectedTeams.includes(team._id)) {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return <CheckSquare />;
      }

      if (allTeamSelector) {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
        // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        if (selectedTeams.includes(team._id)) {
          setSelectedTeams(selectedTeams.filter((t) => t !== team._id));
        } else {
          // @ts-expect-error TS(2322): Type 'any' is not assignable to type 'never'.
          setSelectedTeams([...selectedTeams, team._id]);
        }
      } else {
        actionAndClose([team._id]);
      }
    }
  };

  const actionAndClose = (teams: any) => {
    if (action instanceof Promise) {
      action(teams).then(() => closeModal());
    } else {
      closeModal();
      action(teams);
    }
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="modal-content">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-header">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h5 className="modal-title">{title}</h5>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-body">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="modal-description">{description}</div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="team-selection__container">
          {!!allTeamSelector && !!allTeams.length && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div
              key={'all'}
              className="team-selection team-selection__all-team selectable"
              onClick={() => toggleAllTeam()}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {selectedTeams.length === allTeams.length ? <CheckSquare /> : <Square />}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className="ms-2">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="All">All</Translation>
              </span>
            </div>
          )}
          {teams.map((team) => {
            return (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <span className="ms-2">{getTeamLabel(team)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-footer">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-danger" onClick={() => closeModal()}>
          {translateMethod('Close')}
        </button>
        {!!allTeamSelector && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <button
            type="button"
            className={classNames('btn btn-outline-success', {
              disabled: !selectedTeams.length,
            })}
            onClick={() => finalAction()}
          >
            {translateMethod('Subscribe')}
          </button>
        )}
      </div>
    </div>
  );
};
