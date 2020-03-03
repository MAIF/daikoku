import React, { Component } from 'react';
import { connect } from 'react-redux';
import faker from 'faker';
import _ from 'lodash';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { PaginatedComponent, AvatarWithAction, Can, manage, daikoku } from '../../utils';
import { t } from '../../../locales';

class UserListComponent extends Component {
  state = {
    users: [],
  };

  componentDidMount() {
    this.updateUsers();
  }

  updateUsers = () => {
    Services.fetchAllUsers().then(users => this.setState({ users }));
  };

  createNewUser = () => {
    const tenant = this.props.tenant;
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
    this.props.history.push(`/settings/users/${user._id}`, {
      newUser: user,
    });
  };

  removeUser = user => {
    window
      .confirm(
        t(
          'remove.user.confirm',
          this.props.currentLanguage,
          'Are you sure you want to delete this user ?'
        )
      )
      .then(ok => {
        if (ok) {
          Services.deleteUserById(user._id).then(() => {
            toastr.info(
              t(
                'remove.user.success',
                this.props.currentLanguage,
                false,
                `user ${user.name} is successfully deleted`,
                user.name
              )
            );
            this.updateUsers();
          });
        }
      });
  };

  toggleAdmin = member => {
    if (member._id === this.props.connectedUser._id) {
      alert(
        t(
          'toggle.admin.alert',
          this.props.currentLanguage,
          "You can't remove your admin status, ask another admin."
        )
      );
    } else {
      Services.setAdminStatus(member, !member.isDaikokuAdmin ).then(() =>
        this.updateUsers()
      );
    }
  };

  render() {
    const filteredUsers = this.state.search
      ? this.state.users.filter(({ name, email }) =>
          [name, email].some(item => item.toLowerCase().includes(this.state.search))
        )
      : this.state.users;
    return (
      <UserBackOffice tab="Users">
        <Can I={manage} a={daikoku} dispatchError>
          <div className="row">
            <div className="col">
              <div className="d-flex justify-content-between align-items-center">
                <h1>
                  {t('Users', this.props.currentLanguage)}
                  <a
                    className="btn btn-sm btn-access-negative mb-1 ml-1"
                    title={t('Create a new user', this.props.currentLanguage)}
                    href="#"
                    onClick={e => {
                      e.preventDefault();
                      this.createNewUser();
                    }}>
                    <i className="fas fa-user-plus" />
                  </a>
                </h1>
                <input
                  placeholder={t('Find a user', this.props.currentLanguage)}
                  className="form-control col-5"
                  onChange={e => {
                    this.setState({ search: e.target.value });
                  }}
                />
              </div>
              <PaginatedComponent
                items={_.sortBy(filteredUsers, [user => user.name.toLowerCase()])}
                count={15}
                formatter={user => {
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
                          action: () => this.removeUser(user),
                          iconClass: 'fas fa-trash delete-icon',
                          tooltip: t('Remove user', this.props.currentLanguage),
                        },
                        {
                          redirect: () =>
                            this.props.history.push(`/settings/users/${user._humanReadableId}`),
                          iconClass: 'fas fa-pen',
                          tooltip: t('Edit user', this.props.currentLanguage),
                        },
                        {
                          link: `/api/admin/users/${user._id}/_impersonate`,
                          iconClass: 'fas fa-user-ninja',
                          tooltip: t('Impersonate this user', this.props.currentLanguage),
                        },
                        {
                          action: () => this.toggleAdmin(user),
                          iconClass: `fas fa-shield-alt ${
                            user.isDaikokuAdmin ? 'admin-active' : 'admin-inactive'
                          }`,
                          tooltip: t('toggle admin status', this.props.currentLanguage),
                        },
                      ]}
                    />
                  );
                }}
                currentLanguage={this.props.currentLanguage}
              />
            </div>
          </div>
        </Can>
      </UserBackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const UserList = connect(mapStateToProps)(UserListComponent);
