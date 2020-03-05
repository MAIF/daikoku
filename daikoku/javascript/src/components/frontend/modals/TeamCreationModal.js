import React, { useState } from 'react';
import { PropTypes } from 'prop-types';

import { TeamEditForm } from '../../backoffice/teams/TeamEdit';

export const TeamCreationModal = props => {

  const [team, setTeam] = useState(props.team)

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">Team creation</h5>
        <button type="button" className="close" aria-label="Close" onClick={props.closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="modal-body">
        <TeamEditForm team={team} updateTeam={setTeam} currentLanguage={props.currentLanguage} />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => props.closeModal()}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-outline-success"
          onClick={() => props.createTeam(team).then(() => props.closeModal())}>
          Create
        </button>
      </div>
    </div>
  );
};

TeamCreationModal.propTypes = {
  closeModal: PropTypes.func.isRequired,
  createTeam: PropTypes.func.isRequired,
  team: PropTypes.object.isRequired,
  currentLanguage: PropTypes.string
};
