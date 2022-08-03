import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import sortBy from 'lodash/sortBy';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { PaginatedComponent, AvatarWithAction, Can, manage, daikoku } from '../../utils';
// @ts-expect-error TS(6142): Module '../../../locales/i18n-context' was resolve... Remove this comment to see the full error message
import { I18nContext } from '../../../locales/i18n-context';
import { useDaikokuBackOffice } from '../../../contexts';

export const UserList = () => {
  const { connectedUser, tenant } = useSelector((s) => (s as any).context);
  useDaikokuBackOffice();

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState();
  const navigate = useNavigate();

  useEffect(() => {
    updateUsers();
  }, []);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const updateUsers = () => {
    Services.fetchAllUsers()
    .then(setUsers);
  };

  const createNewUser = () => {
    const user = {
      _id: nanoid(32),
      tenants: [tenant._id],
      origins: ['Local'],
      picture: '/assets/images/anonymous.jpg',
      isDaikokuAdmin: false,
      hardwareKeyRegistrations: [],
    };
    navigate(`/settings/users/${user._id}`, {
      state: {
        newUser: user,
      },
    });
  };

  const removeUser = (user: any) => {
    (window
    .confirm(translateMethod('remove.user.confirm', false, 'Are you sure you want to delete this user ?')) as any).then((ok: any) => {
    if (ok) {
        Services.deleteUserById(user._id).then(() => {
            toastr.info(translateMethod('remove.user.success', false, `user ${user.name} is successfully deleted`, user.name));
            updateUsers();
        });
    }
});
  };

  const toggleAdmin = (member: any) => {
    if (member._id === connectedUser._id) {
      alert(translateMethod('toggle.admin.alert'));
    } else {
      Services.setAdminStatus(member, !member.isDaikokuAdmin).then(() => updateUsers());
    }
  };

  const filteredUsers = search
    ? users.filter(({ name, email }) => [name, email].some((item) => (item as any).toLowerCase().includes(search)))
    : users;
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<Can I={manage} a={daikoku} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex justify-content-between align-items-center">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <h1>
              {translateMethod('Users')}
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <a className="btn btn-sm btn-access-negative mb-1 ms-1" title={translateMethod('Create a new user')} href="#" onClick={(e) => {
        e.preventDefault();
        createNewUser();
    }}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-user-plus"/>
              </a>
            </h1>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-5">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <input placeholder={translateMethod('Find a user')} className="form-control" onChange={(e) => {
        // @ts-expect-error TS(2345): Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
        setSearch(e.target.value);
    }}/>
            </div>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <PaginatedComponent items={sortBy(filteredUsers, [(user) => (user as any).name.toLowerCase()])} count={15} formatter={(user) => {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return (<AvatarWithAction key={user._id} avatar={user.picture} infos={<>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      {user.isDaikokuAdmin && (<i className="fas fa-shield-alt" style={{ marginRight: '10px' }}/>)}
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span className="team__name text-truncate">{user.name}</span>
                    </>} actions={[
                {
                    action: () => removeUser(user),
                    iconClass: 'fas fa-trash delete-icon',
                    tooltip: translateMethod('Remove user'),
                },
                {
                    // @ts-expect-error TS(2322): Type '{ redirect: () => void; iconClass: string; t... Remove this comment to see the full error message
                    redirect: () => navigate(`/settings/users/${user._humanReadableId}`),
                    iconClass: 'fas fa-pen',
                    tooltip: translateMethod('Edit user'),
                },
                {
                    link: `/api/admin/users/${user._id}/_impersonate`,
                    iconClass: 'fas fa-user-ninja',
                    tooltip: translateMethod('Impersonate this user'),
                },
                {
                    action: () => toggleAdmin(user),
                    iconClass: `fas fa-shield-alt ${user.isDaikokuAdmin ? 'admin-active' : 'admin-inactive'}`,
                    tooltip: translateMethod('toggle admin status'),
                },
            ]}/>);
    }}/>
        </div>
      </div>
    </Can>);
};
