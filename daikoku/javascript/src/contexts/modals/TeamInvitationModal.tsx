import { constraints, Form, FormRef, type } from '@maif/react-forms';
import { useContext, useRef } from 'react';

import { I18nContext } from '../../contexts';
import { IState, ITenant } from '../../types';
import { IBaseModalProps, ITeamInvitationModalProps } from './types';
import { CurrentUserContext } from '../userContext';

export const TeamInvitationModal = (props: ITeamInvitationModalProps & IBaseModalProps) => {
  const ref = useRef<FormRef>();
  
  const { translate } = useContext(I18nContext);
  const { tenant } = useContext(CurrentUserContext)
  
  const invitUser = (email: string) => {
    props.invitUser(email)
      .then(props.close)
  }

  const isLDAPProvider = tenant.authProvider === 'LDAP';

  return (
    <div className="modal-content mx-auto p-3" style={{ maxWidth: '448px' }}>
      <div className="modal-header d-flex flex-column align-items-center">
        <button type="button" className="btn-close" aria-label="Close" onClick={props.close} />
        <i className="fas fa-users fa-2x mb-3" />
        <h5 className="modal-title text-center">
          {translate('team_member.invite_user_to')}
          <span style={{ fontWeight: 'bold', display: 'block' }}>{props.team.name}</span>
        </h5>
      </div>
      <div className="modal-body">
        <Form<{email: string}>
          ref={ref}
          schema={{
            email: {
              type: type.string,
              label: null,
              placeholder: translate('Email'),
              constraints: [
                constraints.required(translate('constraints.required.email')),
                constraints.email(translate('constraints.matches.email')),
                constraints.test('test_members', translate('User already in team'), (email: string) => !props.members.some((f) => f.email.toLocaleLowerCase() === email.toLocaleLowerCase())),
                constraints.test('test_pending', translate('User already invited'), (email: string) => !props.pendingUsers.some((f) => f.email.toLocaleLowerCase() === email.toLocaleLowerCase()))
              ]
            }
          }}
          onSubmit={(data) => invitUser(data.email)}
          options={{
            actions: {
              submit: { display: false },
            }
          }}
        />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => props.close()}>
          {translate('Cancel')}
        </button>
        <button type="button" className="btn btn-outline-success" onClick={() => ref.current?.handleSubmit()}>
          {isLDAPProvider ? translate('Search') : translate('team_member.send_email')}
        </button>
      </div>
    </div>
  );
};
