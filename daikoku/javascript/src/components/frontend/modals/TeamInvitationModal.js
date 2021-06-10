import React, { useState } from 'react';

import { ValidateEmail } from '../../utils/validation';
import { t } from '../../../locales';

export const TeamInvitationModal = (props) => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(undefined);

  function invitUser() {
    const { members, pendingUsers } = props;

    const validator = ValidateEmail(email, props.currentLanguage)
    if (validator.ok) {
      if (members.find((f) => f.email === email))
        setError(t('User already in team', props.currentLanguage))
      else if (pendingUsers.find((f) => f.email === email))
        setError(t('User already invited', props.currentLanguage))
      else if (props.tenant.authProvider == "LDAP") {
        props.searchLdapMember(email)
          .then(res => {
            if (res.error)
              setError(res.error);
            else
              confirmInvitation();
          });
      }
      else
        confirmInvitation();
    }
    else
      setError(validator.error);
  }

  function confirmInvitation() {
    props.closeModal()
    props.invitUser(email)
  }

  const isLDAPProvider = props.tenant.authProvider === "LDAP"

  return (
    <div className="modal-content mx-auto p-3" style={{ maxWidth: '448px' }}>
      <div className="modal-header d-flex flex-column align-items-center">
        <button type="button" className="close" aria-label="Close" onClick={props.closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
        <i className="fas fa-users fa-2x mb-3" />
        <h5 className="modal-title text-center">
          {t('team_member.invite_user_to', props.currentLanguage)}
          <span style={{ fontWeight: 'bold', display: 'block' }}>{props.team.name}</span>
        </h5>
      </div>
      <div className="modal-body">
        {error &&
          <div className="alert alert-danger" role="alert">
            {t(error, props.currentLanguage)}
          </div>
        }
        <input
          type="text" className="form-control"
          value={email}
          placeholder={t('Email', props.currentLanguage)}
          onChange={e => {
            setError("")
            setEmail(e.target.value)
          }} />

        {isLDAPProvider ?
          <button onClick={invitUser} className="btn btn-success mt-3 btn-block btn-lg" type="button">
            {t('Search', props.currentLanguage)}
          </button> :
          <button className="btn btn-success mt-3 btn-block btn-lg" type="button" onClick={invitUser}>
            {t('team_member.send_email', props.currentLanguage)}
          </button>}
      </div>
    </div>
  );
};