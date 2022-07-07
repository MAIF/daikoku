import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import _ from 'lodash';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { PaginatedComponent, AvatarWithAction, Can, manage, daikoku } from '../../utils';
import { I18nContext } from '../../../locales/i18n-context';
import { useDaikokuBackOffice } from '../../../contexts';

export const UserList = () => {
  const { connectedUser, tenant } = useSelector((s) => s.context);
  useDaikokuBackOffice();

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState();
  const navigate = useNavigate();

  useEffect(() => {
    updateUsers();
  }, []);

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

  const removeUser = (user) => {
    window
      .confirm(
        translateMethod('remove.user.confirm', false, 'Are you sure you want to delete this user ?')
      )
      .then((ok) => {
        if (ok) {
          Services.deleteUserById(user._id).then(() => {
            toastr.info(
              translateMethod(
                'remove.user.success',
                false,
                `user ${user.name} is successfully deleted`,
                user.name
              )
            );
            updateUsers();
          });
        }
      });
  };

  const toggleAdmin = (member) => {
    if (member._id === connectedUser._id) {
      alert(translateMethod('toggle.admin.alert'));
    } else {
      Services.setAdminStatus(member, !member.isDaikokuAdmin).then(() => updateUsers());
    }
  };

  const filteredUsers = search
    ? users.filter(({ name, email }) =>
        [name, email].some((item) => item.toLowerCase().includes(search))
      )
    : users;
  return (
    <Can I={manage} a={daikoku} dispatchError>
      <div className="row">
        <div className="col">
          <div className="d-flex justify-content-between align-items-center">
            <h1>
              {translateMethod('Users')}
              <a
                className="btn btn-sm btn-access-negative mb-1 ms-1"
                title={translateMethod('Create a new user')}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  createNewUser();
                }}
              >
                <i className="fas fa-user-plus" />
              </a>
            </h1>
            <div className="col-5">
              <input
                placeholder={translateMethod('Find a user')}
                className="form-control"
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
              />
            </div>
          </div>
          <PaginatedComponent
            items={_.sortBy(filteredUsers, [(user) => user.name.toLowerCase()])}
            count={15}
            formatter={(user) => {
              return (
                <AvatarWithAction
                  key={user._id}
                  avatar={user.picture}
                  infos={
                    <>
                      {user.isDaikokuAdmin && (
                        <i className="fas fa-shield-alt" style={{ marginRight: '10px' }} />
                      )}
                      <span className="team__name text-truncate">{user.name}</span>
                    </>
                  }
                  actions={[
                    {
                      action: () => removeUser(user),
                      iconClass: 'fas fa-trash delete-icon',
                      tooltip: translateMethod('Remove user'),
                    },
                    {
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
                      iconClass: `fas fa-shield-alt ${
                        user.isDaikokuAdmin ? 'admin-active' : 'admin-inactive'
                      }`,
                      tooltip: translateMethod('toggle admin status'),
                    },
                  ]}
                />
              );
            }}
          />
        </div>
      </div>
    </Can>
  );
};
