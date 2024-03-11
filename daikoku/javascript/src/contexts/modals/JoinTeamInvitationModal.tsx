import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

import { I18nContext } from '../../contexts';
import * as Services from '../../services';
import { IBaseModalProps } from './types';
import { isError } from '../../types';

export const JoinTeamInvitationModal = (props: IBaseModalProps) => {
  const [error, setError] = useState<string>();
  const [team, setTeam] = useState<string>();
  const [notificationId, setNotificationId] = useState('');
  const navigate = useNavigate();

  const { translate, Translation } = useContext(I18nContext);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('token')) setError(translate('team_member.missing_token'));
    else {
      Services.validateInvitationToken(params.get('token'))
        .then((res) => {
          if (isError(res)) {
            setError(res.error);
          } else {
            setTeam(res.team);
            setNotificationId(res.notificationId);
          }
        });
    }
  }, []);

  function accept() {
    Services.acceptNotificationOfTeam(notificationId)
      .then(() => {
        Services.removeTeamInvitation().then(() => {
          toast.success(translate('team_member.has_joined'));
          goToHome();
        });
      });
  }

  function refuse() {
    Services.rejectNotificationOfTeam(notificationId)
      .then(() => {
        Services.removeTeamInvitation();
        goToHome();
      });
  }

  function goToHome() {
    props.close();
    navigate('/apis');
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
            {translate(error)}
          </div>
        )}
        {error ? (
          <button
            className="btn btn-info btn-block btn-lg"
            type="button"
            onClick={() => {
              props.close();
              navigate('/apis');
            }}
          >
            {translate('Home')}
          </button>
        ) : (
          <div className="d-flex mt-3">
            <button className="btn btn-success btn-block" type="button" onClick={accept}>
              {translate('team_member.accept_invitation')}
            </button>
            <button className="btn btn-danger ms-2" type="button" onClick={refuse}>
              {translate('team_member.refuse_invitation')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
