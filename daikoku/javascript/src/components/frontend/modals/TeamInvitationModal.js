import React, { useContext, useState } from 'react';

import { ValidateEmail } from '../../utils/validation';
import { I18nContext } from '../../../core';

export const TeamInvitationModal = (props) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(undefined);

  const { translateMethod } = useContext(I18nContext);

  function invitUser() {
    const { members, pendingUsers } = props;

    const validator = ValidateEmail(email, translateMethod);
    if (validator.ok) {
      if (members.find((f) => f.email === email)) setError(translateMethod('User already in team'));
      else if (pendingUsers.find((f) => f.email === email))
        setError(translateMethod('User already invited'));
      else if (props.tenant && props.tenant.authProvider == 'LDAP') {
        props.searchLdapMember(email).then((res) => {
          if (res.error) setError(res.error);
          else confirmInvitation();
        });
      } else confirmInvitation();
    } else setError(validator.error);
  }

  function confirmInvitation() {
    props.closeModal();
    props.invitUser(email);
  }

  const isLDAPProvider = props.tenant && props.tenant.authProvider === 'LDAP';

  return (
    <div className="modal-content mx-auto p-3" style={{ maxWidth: '448px' }}>
      <div className="modal-header d-flex flex-column align-items-center">
        <button type="button" className="btn-close" aria-label="Close" onClick={props.closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
        <i className="fas fa-users fa-2x mb-3" />
        <h5 className="modal-title text-center">
          {translateMethod('team_member.invite_user_to')}
          <span style={{ fontWeight: 'bold', display: 'block' }}>{props.team.name}</span>
        </h5>
      </div>
      <div className="modal-body">
        {error && (
          <div className="alert alert-danger" role="alert">
            {translateMethod(error)}
          </div>
        )}
        <input
          type="text"
          className="form-control"
          value={email}
          placeholder={translateMethod('Email')}
          onChange={(e) => {
            setError('');
            setEmail(e.target.value);
          }}
        />

        {isLDAPProvider ? (
          <button
            onClick={invitUser}
            className="btn btn-success mt-3 btn-block btn-lg"
            type="button">
            {translateMethod('Search')}
          </button>
        ) : (
          <button
            className="btn btn-success mt-3 btn-block btn-lg"
            type="button"
            onClick={invitUser}>
            {translateMethod('team_member.send_email')}
          </button>
        )}
      </div>
    </div>
  );
};
