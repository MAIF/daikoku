import { constraints, Form, Schema, type } from '@maif/react-forms';
import { useContext } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { closeModal, I18nContext } from '../../../core';
import { IState, ITeamSimple, ITenant, IUserSimple, ResponseError } from '../../../types';

export interface ITeamInvitationModalProp {
  members: Array<IUserSimple>
  pendingUsers: Array<IUserSimple>
  searchLdapMember: (key: string) => Promise<ResponseError | any>
  invitUser: (string) => Promise<any>
  team: ITeamSimple
}
export const TeamInvitationModal = (props: ITeamInvitationModalProp) => {
  const { translate } = useContext(I18nContext);

  const dispatch = useDispatch();
  const tenant = useSelector<IState, ITenant>(s => s.context.tenant)

  const invitUser = (email: string) => {
    props.invitUser(email)
      .then(() => dispatch(closeModal()))
  }

  const isLDAPProvider = tenant.authProvider === 'LDAP';

  return (
    <div className="modal-content mx-auto p-3" style={{ maxWidth: '448px' }}>
      <div className="modal-header d-flex flex-column align-items-center">
        <button type="button" className="btn-close" aria-label="Close" onClick={() => dispatch(closeModal())} />
        <i className="fas fa-users fa-2x mb-3" />
        <h5 className="modal-title text-center">
          {translate('team_member.invite_user_to')}
          <span style={{ fontWeight: 'bold', display: 'block' }}>{props.team.name}</span>
        </h5>
      </div>
      <div className="modal-body">
        <Form<{email: string}>
          schema={{
            email: {
              type: type.string,
              label: null,
              placeholder: translate('Email'),
              constraints: [
                constraints.required(translate('constraints.required.email')),
                constraints.email(translate('constraints.matches.email')),
                constraints.test('test_members', translate('User already in team'), (email: string) => !props.members.some((f) => f.email === email)),
                constraints.test('test_pending', translate('User already invited'), (email: string) => !props.pendingUsers.some((f) => f.email === email))
              ]
            }
          }}
          onSubmit={(data) => invitUser(data.email)}
          options={{
            actions: {
              submit: { label: isLDAPProvider ? translate('Search') : translate('team_member.send_email') }
            }
          }}
        />
      </div>
    </div>
  );
};
