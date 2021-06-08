import React, { useState, useEffect } from 'react';

import { TeamEditForm } from '../../backoffice/teams/TeamEdit';
import { t, Translation } from '../../../locales';
import * as Services from '../../../services';

export const TeamInvitationModal = (props) => {
  const [team, setTeam] = useState(props.team);
  const [error, setError] = useState(undefined);

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">
          
        </h5>
        <button type="button" className="close" aria-label="Close" onClick={props.closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="modal-body">
        {!!error && (
          <div className="alert alert-danger" role="alert">
            {t(error, props.currentLanguage)}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={props.closeModal}>
          <Translation i18nkey="Close" language={props.currentLanguage}>
            Close
          </Translation>
        </button>
      </div>
    </div>
  );
};