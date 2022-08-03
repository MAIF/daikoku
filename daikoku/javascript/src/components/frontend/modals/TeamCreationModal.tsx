import React, { useState, useEffect, useContext } from 'react';

// @ts-expect-error TS(6142): Module '../../backoffice/teams/TeamEdit' was resol... Remove this comment to see the full error message
import { TeamEditForm } from '../../backoffice/teams/TeamEdit';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';
import { useNavigate } from 'react-router-dom';

type Props = {
    closeModal: (...args: any[]) => any;
    team: any;
};

export const TeamCreationModal = (props: Props) => {
  const [team, setTeam] = useState(props.team);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState(undefined);
  const navigate = useNavigate();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  useEffect(() => {
    if (created) {
      props.closeModal();
      navigate(`/${team._humanReadableId}/settings/members`);
    }
  }, [created]);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="modal-content">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-header">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h5 className="modal-title">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="New team">New team</Translation>
        </h5>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn-close" aria-label="Close" onClick={props.closeModal} />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-body">
        {!!error && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="alert alert-danger" role="alert">
            {translateMethod(error)}
          </div>
        )}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <TeamEditForm team={team} updateTeam={setTeam} />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-footer">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-danger" onClick={props.closeModal}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Close">Close</Translation>
        </button>
        {!created && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <button
            type="button"
            className="btn btn-outline-success"
            onClick={() =>
              Services.createTeam(team)
                .then((r) => {
                  if (r.error) {
                    return Promise.reject(r);
                  } else {
                    return r;
                  }
                })
                .then((newteam) => setTeam(newteam))
                .then(() => setCreated(true))
                .catch((e) => {
                  setError(e.error);
                })
            }
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Create">Create</Translation>
          </button>
        )}
      </div>
    </div>
  );
};
