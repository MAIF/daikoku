import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import sortBy from 'lodash/sortBy';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { PaginatedComponent, AvatarWithAction, Can, manage, daikoku } from '../../utils';
import { I18nContext } from '../../../locales/i18n-context';
import { ModalContext, useDaikokuBackOffice } from '../../../contexts';
import { IState, IUser, IUserSimple } from '../../../types';

export const UserList = () => {
  const connectedUser = useSelector<IState, IUserSimple>((s) => s.context.connectedUser);
  useDaikokuBackOffice();

  const {alert} = useContext(ModalContext);

  const [users, setUsers] = useState<Array<IUser>>([]);
  const [search, setSearch] = useState<string>();
  const navigate = useNavigate();

  useEffect(() => {
    updateUsers();
  }, []);

  const { translate } = useContext(I18nContext);

  const updateUsers = () => {
    Services.fetchAllUsers()
      .then(setUsers);
  };

  const removeUser = (user: IUserSimple) => {
    (window
      .confirm(translate('remove.user.confirm')))//@ts-ignore
      .then((ok) => {
        if (ok) {
          Services.deleteUserById(user._id)
            .then(() => {
              toastr.info(
                translate('Info'),
                translate({ key: 'remove.user.success', replacements: [user.name] }));
              updateUsers();
            });
        }
      });
  };

  const toggleAdmin = (member: IUserSimple) => {
    if (member._id === connectedUser._id) {
      alert({message: translate('toggle.admin.alert')});
    } else {
      Services.setAdminStatus(member, !member.isDaikokuAdmin).then(() => updateUsers());
    }
  };

  const filteredUsers = search
    ? users.filter(({ name, email }) => [name, email].some((item) => item.toLowerCase().includes(search)))
    : users;
  return (<Can I={manage} a={daikoku} dispatchError>
    <div className="row">
      <div className="col">
        <div className="d-flex justify-content-between align-items-center">
          <h1>
            {translate('Users')}
          </h1>
          <div className="col-5">
            <input placeholder={translate('Find a user')} className="form-control" onChange={(e) => {
              setSearch(e.target.value);
            }} />
          </div>
        </div>
        <PaginatedComponent
          items={sortBy(filteredUsers, [(user) => user.name.toLowerCase()])}
          count={15}
          formatter={(user: IUserSimple) => {
            return (<AvatarWithAction
              key={user._id}
              avatar={user.picture}
              infos={<>
                {user.isDaikokuAdmin && (<i className="fas fa-shield-alt" style={{ marginRight: '10px' }} />)}
                <span className="team__name text-truncate">{user.name}</span>
              </>} actions={[
                {
                  action: () => removeUser(user),
                  iconClass: 'fas fa-trash delete-icon',
                  tooltip: translate('Remove user'),
                },
                {
                  redirect: () => navigate(`/settings/users/${user._humanReadableId}`),
                  iconClass: 'fas fa-pen',
                  tooltip: translate('Edit user'),
                },
                {
                  link: `/api/admin/users/${user._id}/_impersonate`,
                  iconClass: 'fas fa-user-ninja',
                  tooltip: translate('Impersonate this user'),
                },
                {
                  action: () => toggleAdmin(user),
                  iconClass: `fas fa-shield-alt ${user.isDaikokuAdmin ? 'admin-active' : 'admin-inactive'}`,
                  tooltip: translate('toggle admin status'),
                },
              ]} />);
          }} />
      </div>
    </div>
  </Can>);
};
