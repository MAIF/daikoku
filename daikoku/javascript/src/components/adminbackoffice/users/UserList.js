import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import faker from 'faker';
import _ from 'lodash';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { PaginatedComponent, AvatarWithAction, Can, manage, daikoku } from '../../utils';
import { I18nContext } from '../../../locales/i18n-context';

function UserListComponent(props) {
  const [state, setState] = useState({
    users: [],
  });
  const navigate = useNavigate();

  useEffect(() => {
    updateUsers();
  }, []);

  const { translateMethod } = useContext(I18nContext);

  const updateUsers = () => {
    Services.fetchAllUsers().then((users) => setState({ ...state, users }));
  };

  const createNewUser = () => {
    const tenant = props.tenant;
    const user = {
      _id: faker.random.alphaNumeric(32),
      tenants: [tenant._id],
      origins: ['Local'],
      name: faker.name.findName(),
      email: faker.internet.email(),
      picture: '/assets/images/anonymous.jpg',
      isDaikokuAdmin: false,
      password: '',
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
    if (member._id === props.connectedUser._id) {
      alert(translateMethod('toggle.admin.alert'));
    } else {
      Services.setAdminStatus(member, !member.isDaikokuAdmin).then(() => updateUsers());
    }
  };

  const filteredUsers = state.search
    ? state.users.filter(({ name, email }) =>
        [name, email].some((item) => item.toLowerCase().includes(state.search))
      )
    : state.users;
  return (
    <UserBackOffice tab="Users">
      <Can I={manage} a={daikoku} dispatchError>
        <div className="row">
          <div className="col">
            <div className="d-flex justify-content-between align-items-center">
              <h1>
                {translateMethod('Users')}
                <a
                  className="btn btn-sm btn-access-negative mb-1 ml-1"
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
              <input
                placeholder={translateMethod('Find a user')}
                className="form-control col-5"
                onChange={(e) => {
                  setState({ ...state, search: e.target.value });
                }}
              />
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
    </UserBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const UserList = connect(mapStateToProps)(UserListComponent);
