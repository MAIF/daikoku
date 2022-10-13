import React, { useContext, useState } from 'react';

import { I18nContext } from '../../../core';

export const TeamInvitationModal = (props: any) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const { translate } = useContext(I18nContext);

  function invitUser() {
    const { members, pendingUsers } = props;

    // const validator = ValidateEmail(email, translate);
    const validator = true; //FIXME: use constraints instead of validation function
    if (validator) {
      if (members.find((f: any) => f.email === email)) {
        setError(translate('User already in team'));
      } else if (pendingUsers.find((f: any) => f.email === email)) {
        setError(translate('User already invited'));
      } else if (props.tenant && props.tenant.authProvider == 'LDAP') {
        props.searchLdapMember(email).then((res: any) => {
          if (res.error) setError(res.error);
          else confirmInvitation();
        });
      } else {
        confirmInvitation();
      }
    } else setError((validator as any).error);
  }

  function confirmInvitation() {
    props.closeModal();
    props.invitUser(email);
  }

  const isLDAPProvider = props.tenant && props.tenant.authProvider === 'LDAP';

  return (
    <div className="modal-content mx-auto p-3" style={{ maxWidth: '448px' }}>
      <div className="modal-header d-flex flex-column align-items-center">
        <button type="button" className="btn-close" aria-label="Close" onClick={props.closeModal} />
        <i className="fas fa-users fa-2x mb-3" />
        <h5 className="modal-title text-center">
          {translate('team_member.invite_user_to')}
          <span style={{ fontWeight: 'bold', display: 'block' }}>{props.team.name}</span>
        </h5>
      </div>
      <div className="modal-body">
        {error && (
          <div className="alert alert-danger" role="alert">
            {translate(error)}
          </div>
        )}
        <input
          type="text"
          className="form-control"
          value={email}
          placeholder={translate('Email')}
          onChange={(e) => {
            setError('');
            setEmail(e.target.value);
          }}
        />

        {isLDAPProvider ? (
          <button
            onClick={invitUser}
            className="btn btn-success mt-3 btn-block btn-lg"
            type="button"
          >
            {translate('Search')}
          </button>
        ) : (
          <button
            className="btn btn-success mt-3 btn-block btn-lg"
            type="button"
            onClick={invitUser}
          >
            {translate('team_member.send_email')}
          </button>
        )}
      </div>
    </div>
  );
};
