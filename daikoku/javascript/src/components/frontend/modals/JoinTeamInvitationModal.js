import React, { useContext, useEffect, useState } from 'react';
import { withRouter } from 'react-router-dom';
import * as Services from '../../../services';
import { toastr } from 'react-redux-toastr';
import { I18nContext } from '../../../core';

export const JoinTeamInvitationModal = withRouter((props) => {
  const [error, setError] = useState(undefined);
  const [team, setTeam] = useState('');
  const [notificationId, setNotificationId] = useState('');

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
    props.history.push('/apis');
  }

  return (
    <div className="modal-content mx-auto p-3" style={{ maxWidth: '448px' }}>
      <div className="modal-header d-flex flex-column align-items-center">
        <i className="fas fa-users fa-2x mb-3" />
        <h5 className="modal-title text-center">
          <Translation i18nkey="team_member.invitation" replacements={[team]} />
          <span style={{ fontWeight: 'bold', display: 'block' }}>{team}</span>
        </h5>
      </div>
      <div className="modal-body">
        {error && (
          <div className="alert alert-danger" role="alert">
            {translateMethod(error)}
          </div>
        )}
        {error ? (
          <button
            className="btn btn-info btn-block btn-lg"
            type="button"
            onClick={() => {
              props.closeModal();
              props.history.push('/apis');
            }}>
            {translateMethod('Home')}
          </button>
        ) : (
          <div className="d-flex mt-3">
            <button className="btn btn-success btn-block" type="button" onClick={accept}>
              {translateMethod('team_member.accept_invitation')}
            </button>
            <button className="btn btn-danger ml-2" type="button" onClick={refuse}>
              {translateMethod('team_member.refuse_invitation')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
