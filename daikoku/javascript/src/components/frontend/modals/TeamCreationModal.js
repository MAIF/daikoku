import React, { useState, useEffect } from 'react';
import { PropTypes } from 'prop-types';

import { TeamEditForm } from '../../backoffice/teams/TeamEdit';
import {t, Translation} from '../../../locales';
import * as Services from '../../../services';
import { setError } from '../../../core';

export const TeamCreationModal = props => {

  const [team, setTeam] = useState(props.team)
  const [created, setCreated] = useState(false)
  const [error, setError] = useState(undefined)

  useEffect(() => {
    if (created) {
      setError(undefined);
    }
  }, [created])

  const members = () => {
    props.closeModal();
    props.history.push(`/${team._humanReadableId}/settings/members`);
  };

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">Team creation</h5>
        <button type="button" className="close" aria-label="Close" onClick={props.closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="modal-body">
        {!!error && <div class="alert alert-danger" role="alert">
          {error}
        </div>}
        {!created && <TeamEditForm team={team} updateTeam={setTeam} currentLanguage={props.currentLanguage} />}
        {created && (
          <>
            <div>Team {team.name} created successfully</div>
            <div>Would you want to add some members to your new team ?</div>
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={members}>
              <span>
                <i className="fas fa-users mr-1" />
                <Translation i18nkey="Members" language={props.currentLanguage}>
                  Add Members
                </Translation>
              </span>
            </button>
          </>
        )}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={props.closeModal}>
          Close
        </button>
        {!created && <button
          type="button"
          className="btn btn-outline-success"
          onClick={() => Services.createTeam(team)
            .then(r => {
              if(r.error) {
                return Promise.reject(r)
              } else {
                return r
              }
            })
            .then(newteam => setTeam(newteam))
            .then(() => setCreated(true))
            .then(() => props.postAction())
            .catch(e => {
              console.debug({e})
              setError(e.error)
            }
              )}>
          Create
        </button>}
      </div>
    </div>
  );
};

TeamCreationModal.propTypes = {
  closeModal: PropTypes.func.isRequired,
  team: PropTypes.object.isRequired,
  currentLanguage: PropTypes.string,
  postAction: PropTypes.func
};
