import React, { Component } from 'react';
import { Redirect } from 'react-router-dom';
import { connect } from 'react-redux';
import _ from 'lodash';
import { toastr } from 'react-redux-toastr';
import classnames from 'classnames';

import * as Services from '../../../services';
import { TeamBackOffice } from '..';
import { updateTeamPromise } from '../../../core/i18n-context';
import { openInvitationTeamModal } from '../../../core';
import {
  Option,
  PaginatedComponent,
  AvatarWithAction,
  Can,
  manage,
  team,
  administrator,
  apiEditor,
  user,
} from '../../utils';
import { t, Translation } from '../../../locales';

import 'antd/lib/tooltip/style/index.css';

const TABS = {
  members: 'MEMBERS',
  pending: 'PENDING',
};

export class TeamMembersSimpleComponent extends Component {
  state = {
    pendingUsers: [],
    selectedMember: null,
    loading: true,
    tab: TABS.members,
  };

  componentDidMount() {
    this.updateMembers(this.props.currentTeam);
  }

  updateMembers = (team) => {
    Promise.all([Services.members(team._id), Services.pendingMembers(team._id)]).then(
      ([members, res]) => {
        this.setState({
          members,
          pendingUsers: res.pendingUsers,
          loading: false,
        });
      }
    );
  };

  isAdmin = (user) => {
    if (!this.props.currentTeam) {
      return false;
    }

    if (user.isDaikokuAdmin) {
      return true;
    }

    return Option(this.props.currentTeam.users.find((u) => u.userId === user._id))
      .map((user) => user.teamPermission)
      .fold(
        () => false,
        (perm) => perm === administrator
      );
  };

  userHavePemission = (user, permission) => {
    return Option(this.props.currentTeam.users.find((u) => u.userId === user._id))
      .map((user) => user.teamPermission)
      .fold(
        () => false,
        (perm) => perm === permission
      );
  };

  removeMember = (member) => {
    if (
      this.isAdmin(member) &&
      this.props.currentTeam.users.filter((u) => u.teamPermission === administrator).length === 1
    ) {
      alert(
        t(
          'remove.member.alert',
          this.props.currentLanguage,
          false,
          "You can't delete this user, it must remain an admin in a team."
        )
      );
    } else {
      window
        .confirm(
          t(
            'remove.member.confirm',
            this.props.currentLanguage,
            false,
            'Are you sure you want to remove this member from the team ?'
          )
        )
        .then((ok) => {
          if (ok) {
            const teamId = this.props.currentTeam._id;
            Services.removeMemberFromTeam(teamId, member._id).then(({ done, team }) => {
              done
                ? toastr.success(
                    'Success',
                    t(
                      'remove.member.success',
                      this.props.currentLanguage,
                      false,
                      `${member.name} is no longer member of your team`,
                      member.name
                    )
                  )
                : toastr.error('Failure');
              this.props.updateTeam(team).then(() => this.updateMembers(this.props.currentTeam));
            });
          }
        });
    }
  };

  _addMember = (member) => {
    const teamId = this.props.currentTeam._id;
    Services.addMembersToTeam(teamId, [member._id])
      .then(({ done }) => {
        this.setState({ selectedMember: null }, () => {
          done
            ? toastr.success(
                'Success',
                t(
                  'member.now.invited',
                  this.props.currentLanguage,
                  false,
                  `${member.name} has been invited as new member of your team`,
                  member.name
                )
              )
            : toastr.error('Failure');
        });
      })
      .then(() => this.updateMembers(this.props.currentTeam));
  };

  addLdapUserToTeam = (email) => {
    Services.findUserByEmail(this.props.currentTeam._id, email).then((optUser) => {
      if (optUser.error) {
        Services.createUserFromLDAP(this.props.currentTeam._id, email).then((createdUser) =>
          this._addMember(createdUser)
        );
      } else {
        const user = optUser;
        this._addMember(user);
      }
    });
  };

  togglePermission = (member, permission) => {
    if (this.isAdmin(this.props.connectedUser)) {
      const teamId = this.props.currentTeam._id;
      if (
        this.userHavePemission(member, administrator) &&
        this.props.currentTeam.users.filter((u) => u.teamPermission === administrator).length === 1
      ) {
        alert(
          t(
            'remove.admin.alert',
            this.props.currentLanguage,
            "You can't remove this admin status, it must remain an admin in a team."
          )
        );
      } else {
        const newPermission = this.userHavePemission(member, permission) ? user : permission;
        Services.updateTeamMemberPermission(teamId, [member._id], newPermission).then(
          ({ done, team }) => {
            done
              ? toastr.success(
                  'Success',
                  t(
                    'member.new.permission.success',
                    this.props.currentLanguage,
                    false,
                    `${member.name} is now ${newPermission}`,
                    member.name,
                    newPermission
                  )
                )
              : toastr.error('Failure');
            this.props.updateTeam(team).then(() => this.updateMembers(this.props.currentTeam));
          }
        );
      }
    } else {
      window.alert(
        t(
          'not.admin.alert',
          this.props.currentLanguage,
          "Your are not an administrator. You can't do that."
        )
      );
    }
  };

  searchLdapMember = (email) => {
    return new Promise((resolve) => {
      Services.searchLdapMember(this.props.currentTeam._id, email)
        .then((hasMember) => {
          if (hasMember.error) resolve({ error: hasMember.error });
          else resolve({ done: true });
        })
        .catch((error) => resolve(error));
    });
  };

  invitUser = (email) => {
    if (this.props.tenant && this.props.tenant.authProvider === 'LDAP')
      this.addLdapUserToTeam(email);
    else
      Services.addUncheckedMembersToTeam(this.props.currentTeam._id, email).then(() =>
        this.updateMembers(this.props.currentTeam)
      );
  };

  render() {
    if (this.props.currentTeam.type === 'Personal') {
      return <Redirect to="/settings/me" />;
    }

    if (!this.state.members) {
      return null;
    }

    const filteredMembers = this.state.search
      ? this.state.members.filter(({ name, email }) =>
          [name, email].some((value) => value.toLowerCase().includes(this.state.search))
        )
      : this.state.members;

    const filteredPending = this.state.search
      ? this.state.pendingUsers.filter(({ name, email }) =>
          [name, email].some((value) => value.toLowerCase().includes(this.state.search))
        )
      : this.state.pendingUsers;
    return (
      <>
        <div className="row">
          <div className="col">
            <h1>
              <Translation
                i18nkey="team.members.title"
               
                replacements={[this.props.currentTeam.name]}>
                {this.props.currentTeam.name} members
              </Translation>
            </h1>
          </div>
        </div>
        <div className="container-fluid" style={{ position: 'relative' }}>
          <button
            className="btn btn-success"
            type="button"
            onClick={() => {
              const {
                currentLanguage,
                history,
                currentTeam,
                tenant,
                openInvitationModal,
              } = this.props;

              openInvitationModal({
                currentLanguage,
                history,
                team: currentTeam,
                tenant,
                searchLdapMember: this.searchLdapMember,
                members: filteredMembers,
                invitUser: this.invitUser,
                pendingUsers: filteredPending,
              });
            }}>
            {t('team_member.invit_user', this.props.currentLanguage)}
          </button>
          <div className="row">
            <div className="col mt-3 onglets">
              <ul className="nav nav-tabs flex-column flex-sm-row">
                <li className="nav-item">
                  <span
                    className={`nav-link cursor-pointer ${
                      this.state.tab === TABS.members ? 'active' : ''
                    }`}
                    onClick={() => this.setState({ tab: TABS.members })}>
                    <Translation
                      i18nkey="Member"
                     
                      isPlural={this.state.members.length > 1}>
                      Member
                    </Translation>
                  </span>
                </li>
                <li className="nav-item">
                  <span
                    className={classnames('nav-link cursor-pointer', {
                      active: this.state.tab === TABS.pending,
                    })}
                    onClick={() => this.setState({ tab: TABS.pending })}>
                    <Translation
                      i18nkey="pending members"
                     
                      replacements={[(this.state.pendingUsers || []).length]}>
                      Pending ({(this.state.pendingUsers || []).length})
                    </Translation>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        {this.state.tab === TABS.members && (
          <PaginatedComponent
            help={() => {
              alert(
                <div className="d-flex flex-column">
                  <div>
                    <i className="fas fa-shield-alt mr-1" />
                    <Translation
                      i18nkey="permission.caption.administrator"
                     
                    />
                  </div>
                  <div>
                    <i className="fas fa-pencil-alt mr-1" />
                    <Translation
                      i18nkey="permission.caption.apiEditor"
                     
                    />
                  </div>
                  <div>
                    <i className="fas fa-user-alt mr-1" />
                    <Translation
                      i18nkey="permission.caption.user"
                     
                    />
                  </div>
                </div>,
                t('Permission', this.props.currentLanguage, true)
              );
            }}
            currentLanguage={this.props.currentLanguage}
            items={_.sortBy(filteredMembers, [(member) => member.name.toLowerCase()])}
            count={15}
            formatter={(member) => {
              const isAdmin = this.userHavePemission(member, administrator);
              const isApiEditor = this.userHavePemission(member, apiEditor);
              if (member.isPending) {
                return (
                  <AvatarWithAction
                    key={member._id}
                    avatar={member.picture}
                    infos={
                      <>
                        <i className="fas fa-question mr-2" />
                        <span className="team-member__name">{member.name}</span>
                      </>
                    }
                    actions={[]}
                  />
                );
              }
              return (
                <AvatarWithAction
                  key={member._id}
                  avatar={member.picture}
                  infos={
                    <>
                      {this.userHavePemission(member, administrator) && (
                        <i className="fas fa-shield-alt" style={{ marginRight: '10px' }} />
                      )}
                      {this.userHavePemission(member, apiEditor) && (
                        <i className="fas fa-pencil-alt" style={{ marginRight: '10px' }} />
                      )}
                      <span className="team-member__name">{member.name}</span>
                    </>
                  }
                  actions={[
                    {
                      action: () => this.removeMember(member),
                      iconClass: 'fas fa-trash delete-icon',
                      tooltip: t('Remove member', this.props.currentLanguage),
                    },
                    {
                      action: [
                        {
                          action: () => this.togglePermission(member, administrator),
                          iconClass: `fas fa-shield-alt ${
                            isAdmin ? 'admin-active' : 'admin-inactive'
                          }`,
                          tooltip: `${
                            isAdmin
                              ? t('Remove administrator status', this.props.currentLanguage)
                              : t('Add administrator status', this.props.currentLanguage)
                          }`,
                        },
                        {
                          action: () => this.togglePermission(member, apiEditor),
                          iconClass: `fas fa-pencil-alt ${
                            isApiEditor ? 'admin-active' : 'admin-inactive'
                          }`,
                          tooltip: `${
                            isApiEditor
                              ? t('Remove api editor status', this.props.currentLanguage)
                              : t('Add api editor status', this.props.currentLanguage)
                          }`,
                        },
                      ],
                      iconClass: 'fas fa-user-cog',
                      tooltip: t('Manage permissions', this.props.currentLanguage),
                    },
                  ]}
                />
              );
            }}
          />
        )}
        {this.state.tab === TABS.pending &&
          (filteredPending.length > 0 ? (
            <PaginatedComponent
              currentLanguage={this.props.currentLanguage}
              items={_.sortBy(filteredPending, [(member) => member.name.toLowerCase()])}
              count={15}
              formatter={(member) => {
                const invitedUser = member.name === 'invited user';
                return (
                  <AvatarWithAction
                    key={member._id}
                    avatar={member.picture}
                    infos={
                      <span className="team-member__name">
                        {invitedUser ? member.email : member.name}
                      </span>
                    }
                    actions={
                      invitedUser
                        ? [
                            {
                              action: () => {
                                window
                                  .confirm(
                                    t(
                                      'team_member.confirm_remove_invitation',
                                      this.props.currentLanguage
                                    )
                                  )
                                  .then((ok) => {
                                    if (ok)
                                      Services.removeInvitation(
                                        this.props.currentTeam._id,
                                        member._id
                                      ).then(() => this.updateMembers(this.props.currentTeam));
                                  });
                              },
                              iconClass: 'fas fa-trash delete-icon',
                              tooltip: t('Remove invitation', this.props.currentLanguage),
                            },
                          ]
                        : []
                    }
                  />
                );
              }}
            />
          ) : (
            <div className="p-3">
              <Translation
                i18nkey="team_member.no_pending_members"
               
              />
            </div>
          ))}
      </>
    );
  }
}

const TeamMembersComponent = (props) => {
  return (
    <TeamBackOffice
      tab="Members"
      apiId={props.match.params.apiId}
      title={`${props.currentTeam.name} - ${t('Member', props.currentLanguage, true)}`}>
      <Can I={manage} a={team} team={props.currentTeam} dispatchError={true}>
        <TeamMembersSimpleComponent {...props} />
      </Can>
    </TeamBackOffice>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateTeam: (team) => updateTeamPromise(team),
  openInvitationModal: (modalProps) => openInvitationTeamModal(modalProps),
};

export const TeamMembers = connect(mapStateToProps, mapDispatchToProps)(TeamMembersComponent);
