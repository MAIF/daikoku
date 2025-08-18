import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { I18nContext } from '../../contexts';
import * as Services from '../../services';
import { isError } from '../../types';
import { GlobalContext } from '../globalContext';
import { IBaseModalProps } from './types';
import { toast } from 'sonner';

export const JoinTeamInvitationModal = (props: IBaseModalProps) => {
  const [error, setError] = useState<string>();
  const [team, setTeam] = useState<string>();
  const navigate = useNavigate();

  const { translate, Translation } = useContext(I18nContext);
  const { tenant } = useContext(GlobalContext);

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
          }
        });
    }
  }, []);


  function goToHome() {
    props.close();
    navigate('/apis');
  }

  const signup = () => {
    props.close();
    if (tenant.loginProvider === 'Local') {
      navigate('/signup');
    } else {
      navigate(`/auth/${tenant.loginProvider}/login`)
    }
  }

  const decline = () => {
    const params = new URLSearchParams(window.location.search);
    Services.declineMyTeamInvitation(params.get('token') as string)
      .then(r => {
        if (isError(r)) {
          toast.error(r.error)
        } else {
          toast.success(translate('team_member.invitation.decline.successful'));
          goToHome();
        }
      })

  }

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title" id="modal-title">
          team invitation
        </h5>
      </div>
      <div className="modal-body">
        {!error && <Translation i18nkey="team_member.invitation" replacements={[team]} />}
        {error && (
          <div className="alert alert-danger" role="alert">
            {translate(error)}
          </div>
        )}

      </div>
      <div className="modal-footer">
        {!error && <>
          <button type="button" className="btn btn-outline-danger" onClick={() => decline()}>
            {translate('team_member.refuse_invitation')}
          </button>
          {tenant.loginProvider === 'Local' && <button type="button" className="btn btn-outline-success" onClick={() => signup()}>
            {translate('team_member.accept_invitation')}
          </button>}
          {tenant.loginProvider !== 'Local' && <a className="btn btn-outline-success" href={`/auth/${tenant.loginProvider}/login`}>
            {translate('team_member.accept_invitation')}
          </a>}
        </>}
        {error && (
          <button type="button" className="btn btn-outline-success" onClick={() => goToHome()}>
            {translate('Ok')}
          </button>
        )}
      </div>
    </div>
  );
};
