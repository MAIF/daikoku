import React, { useContext, useState } from 'react';

import { I18nContext } from '../../../core';

export const TeamInvitationModal = (props: any) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(undefined);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  function invitUser() {
    const { members, pendingUsers } = props;

    // const validator = ValidateEmail(email, translateMethod);
    const validator = true; //FIXME: use constraints instead of validation function
    if (validator) {
      if (members.find((f: any) => f.email === email)) setError(translateMethod('User already in team'));
      else if (pendingUsers.find((f: any) => f.email === email))
        setError(translateMethod('User already invited'));
      else if (props.tenant && props.tenant.authProvider == 'LDAP') {
        props.searchLdapMember(email).then((res: any) => {
          if (res.error) setError(res.error);
          else confirmInvitation();
        });
      } else confirmInvitation();
    } else setError((validator as any).error);
  }

  function confirmInvitation() {
    props.closeModal();
    props.invitUser(email);
  }

  const isLDAPProvider = props.tenant && props.tenant.authProvider === 'LDAP';

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="modal-content mx-auto p-3" style={{ maxWidth: '448px' }}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-header d-flex flex-column align-items-center">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn-close" aria-label="Close" onClick={props.closeModal} />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <i className="fas fa-users fa-2x mb-3" />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h5 className="modal-title text-center">
          {translateMethod('team_member.invite_user_to')}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span style={{ fontWeight: 'bold', display: 'block' }}>{props.team.name}</span>
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
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <input
          type="text"
          className="form-control"
          value={email}
          placeholder={translateMethod('Email')}
          onChange={(e) => {
            // @ts-expect-error TS(2345): Argument of type '""' is not assignable to paramet... Remove this comment to see the full error message
            setError('');
            setEmail(e.target.value);
          }}
        />

        {isLDAPProvider ? (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <button
            onClick={invitUser}
            className="btn btn-success mt-3 btn-block btn-lg"
            type="button"
          >
            {translateMethod('Search')}
          </button>
        ) : (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <button
            className="btn btn-success mt-3 btn-block btn-lg"
            type="button"
            onClick={invitUser}
          >
            {translateMethod('team_member.send_email')}
          </button>
        )}
      </div>
    </div>
  );
};
