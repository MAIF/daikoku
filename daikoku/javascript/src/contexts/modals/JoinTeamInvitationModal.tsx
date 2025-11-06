import {useContext, useEffect, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';

import {I18nContext, ModalContext} from '../../contexts';
import * as Services from '../../services';
import {isError} from '../../types';
import {GlobalContext} from '../globalContext';
import {IBaseModalProps} from './types';

export const JoinTeamInvitationModal = (props: IBaseModalProps) => {
  const [team, setTeam] = useState<string>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const {translate, Translation} = useContext(I18nContext);
  const {tenant} = useContext(GlobalContext);
  const {close} = useContext(ModalContext);

  useEffect(() => {
    Services.validateInvitationToken(searchParams.get('invitation-token'))
      .then((res) => {
        if (isError(res)) {
          close();
          setSearchParams({error: res.error})
        } else {
          setTeam(res.team)
        }
      });
  }, []);

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
          close()
          setSearchParams({error: r.error})
        } else {
          setSearchParams({message: 'team-invitation-decline'})
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
        <Translation i18nkey="team_member.invitation" replacements={[team]} />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => decline()}>
          {translate('team_member.refuse_invitation')}
        </button>
        {tenant.loginProvider === 'Local' &&
            <button type="button" className="btn btn-outline-success" onClick={() => signup()}>
              {translate('team_member.accept_invitation')}
            </button>}
        {tenant.loginProvider !== 'Local' &&
            <a className="btn btn-outline-success" href={`/auth/${tenant.loginProvider}/login`}>
              {translate('team_member.accept_invitation')}
            </a>}
      </div>
    </div>
  );
};
