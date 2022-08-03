import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';

export const JoinTeamInvitationModal = (props: any) => {
  const [error, setError] = useState(undefined);
  const [team, setTeam] = useState('');
  const [notificationId, setNotificationId] = useState('');
  const navigate = useNavigate();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('token')) setError(translateMethod('team_member.missing_token'));
    else {
      Services.validateInvitationToken(params.get('token')).then((res) => {
        if (res.error) setError(res.error);
        else {
          setTeam(res.team);
          setNotificationId(res.notificationId);
        }
      });
    }
  }, []);

  function accept() {
    Services.acceptNotificationOfTeam(notificationId).then(() => {
      Services.removeTeamInvitation().then(() => {
        toastr.success(translateMethod('team_member.has_joined'));
        goToHome();
      });
    });
  }

  function refuse() {
    Services.rejectNotificationOfTeam(notificationId).then(() => {
      Services.removeTeamInvitation();
      goToHome();
    });
  }

  function goToHome() {
    props.closeModal();
    navigate('/apis');
  }

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="modal-content mx-auto p-3" style={{ maxWidth: '448px' }}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-header d-flex flex-column align-items-center">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <i className="fas fa-users fa-2x mb-3" />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h5 className="modal-title text-center">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="team_member.invitation" replacements={[team]} />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span style={{ fontWeight: 'bold', display: 'block' }}>{team}</span>
        </h5>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-body">
        {error && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="alert alert-danger" role="alert">
            {translateMethod(error)}
          </div>
        )}
        {error ? (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <button
            className="btn btn-info btn-block btn-lg"
            type="button"
            onClick={() => {
              props.closeModal();
              navigate('/apis');
            }}
          >
            {translateMethod('Home')}
          </button>
        ) : (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="d-flex mt-3">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button className="btn btn-success btn-block" type="button" onClick={accept}>
              {translateMethod('team_member.accept_invitation')}
            </button>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button className="btn btn-danger ms-2" type="button" onClick={refuse}>
              {translateMethod('team_member.refuse_invitation')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
