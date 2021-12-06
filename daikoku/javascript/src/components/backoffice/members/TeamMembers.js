import React, { useContext, useEffect, useState } from 'react';
import { Redirect } from 'react-router-dom';
import { connect } from 'react-redux';
import _ from 'lodash';
import { toastr } from 'react-redux-toastr';
import classnames from 'classnames';

import * as Services from '../../../services';
import { TeamBackOffice } from '..';
import { openInvitationTeamModal, updateTeamPromise, I18nContext } from '../../../core';
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

import 'antd/lib/tooltip/style/index.css';

const TABS = {
  members: 'MEMBERS',
  pending: 'PENDING',
};

export function TeamMembersSimpleComponent(props) {
  const [state, setState] = useState({
    pendingUsers: [],
    selectedMember: null,
    loading: true,
    tab: TABS.members,
  });

  const { translateMethod, Translation } = useContext(I18nContext);

  useEffect(() => {
    updateMembers(props.currentTeam);
  }, []);

  const updateMembers = (team) => {
    Promise.all([Services.members(team._id), Services.pendingMembers(team._id)]).then(
      ([members, res]) => {
        setState({
          ...state,
          members,
          pendingUsers: res.pendingUsers,
          loading: false,
        });
      }
    );
  };

  const isAdmin = (user) => {
    if (!props.currentTeam) {
      return false;
    }

    if (user.isDaikokuAdmin) {
      return true;
    }

    return Option(props.currentTeam.users.find((u) => u.userId === user._id))
      .map((user) => user.teamPermission)
      .fold(
        () => false,
        (perm) => perm === administrator
      );
  };

  const userHavePemission = (user, permission) => {
    return Option(props.currentTeam.users.find((u) => u.userId === user._id))
      .map((user) => user.teamPermission)
      .fold(
        () => false,
        (perm) => perm === permission
      );
  };

  const removeMember = (member) => {
    if (
      isAdmin(member) &&
      props.currentTeam.users.filter((u) => u.teamPermission === administrator).length === 1
    ) {
      alert(
        translateMethod(
          'remove.member.alert',
          false,
          "You can't delete this user, it must remain an admin in a team."
        )
      );
    } else {
      window
        .confirm(
          translateMethod(
            'remove.member.confirm',
            false,
            'Are you sure you want to remove this member from the team ?'
          )
        )
        .then((ok) => {
          if (ok) {
            const teamId = props.currentTeam._id;
            Services.removeMemberFromTeam(teamId, member._id).then(({ done, team }) => {
              done
                ? toastr.success(
                    'Success',
                    translateMethod(
                      'remove.member.success',
                      false,
                      `${member.name} is no longer member of your team`,
                      member.name
                    )
                  )
                : toastr.error('Failure');
              props.updateTeam(team).then(() => updateMembers(props.currentTeam));
            });
          }
        });
    }
  };

  const _addMember = (member) => {
    const teamId = props.currentTeam._id;
    Services.addMembersToTeam(teamId, [member._id])
      .then(({ done }) => {
        setState({ ...state, selectedMember: null });
        done
          ? toastr.success(
              'Success',
              translateMethod(
                'member.now.invited',
                false,
                `${member.name} has been invited as new member of your team`,
                member.name
              )
            )
          : toastr.error('Failure');
      })
      .then(() => updateMembers(props.currentTeam));
  };

  const addLdapUserToTeam = (email) => {
    Services.findUserByEmail(props.currentTeam._id, email).then((optUser) => {
      if (optUser.error) {
        Services.createUserFromLDAP(props.currentTeam._id, email).then((createdUser) =>
          _addMember(createdUser)
        );
      } else {
        const user = optUser;
        _addMember(user);
      }
    });
  };

  const togglePermission = (member, permission) => {
    if (isAdmin(props.connectedUser)) {
      const teamId = props.currentTeam._id;
      if (
        userHavePemission(member, administrator) &&
        props.currentTeam.users.filter((u) => u.teamPermission === administrator).length === 1
      ) {
        alert(
          translateMethod(
            'remove.admin.alert',
            false,
            "You can't remove this admin status, it must remain an admin in a team."
          )
        );
      } else {
        const newPermission = userHavePemission(member, permission) ? user : permission;
        Services.updateTeamMemberPermission(teamId, [member._id], newPermission).then(
          ({ done, team }) => {
            done
              ? toastr.success(
                  'Success',
                  translateMethod(
                    'member.new.permission.success',
                    false,
                    `${member.name} is now ${newPermission}`,
                    member.name,
                    newPermission
                  )
                )
              : toastr.error('Failure');
            props.updateTeam(team).then(() => updateMembers(props.currentTeam));
          }
        );
      }
    } else {
      window.alert(
        translateMethod(
          'not.admin.alert',
          false,
          "Your are not an administrator. You can't do that."
        )
      );
    }
  };

  const searchLdapMember = (email) => {
    return new Promise((resolve) => {
      Services.searchLdapMember(props.currentTeam._id, email)
        .then((hasMember) => {
          if (hasMember.error) resolve({ error: hasMember.error });
          else resolve({ done: true });
        })
        .catch((error) => resolve(error));
    });
  };

  const invitUser = (email) => {
    if (props.tenant && props.tenant.authProvider === 'LDAP') addLdapUserToTeam(email);
    else
      Services.addUncheckedMembersToTeam(props.currentTeam._id, email).then(() =>
        updateMembers(props.currentTeam)
      );
  };

  if (props.currentTeam.type === 'Personal') {
    return <Redirect to="/settings/me" />;
  }

  if (!state.members) {
    return null;
  }

  const filteredMembers = state.search
    ? state.members.filter(({ name, email }) =>
        [name, email].some((value) => value.toLowerCase().includes(state.search))
      )
    : state.members;

  const filteredPending = state.search
    ? state.pendingUsers.filter(({ name, email }) =>
        [name, email].some((value) => value.toLowerCase().includes(state.search))
      )
    : state.pendingUsers;
  return (
    <>
      <div className="container-fluid" style={{ position: 'relative' }}>
        <button
          className="btn btn-success"
          type="button"
          onClick={() => {
            const { history, currentTeam, tenant, openInvitationModal } = props;

            openInvitationModal({
              history,
              team: currentTeam,
              tenant,
              searchLdapMember: searchLdapMember,
              members: filteredMembers,
              invitUser: invitUser,
              pendingUsers: filteredPending,
            });
          }}>
          {translateMethod('team_member.invit_user')}
        </button>
        <div className="row">
          <div className="col mt-3 onglets">
            <ul className="nav nav-tabs flex-column flex-sm-row">
              <li className="nav-item">
                <span
                  className={`nav-link cursor-pointer ${
                    state.tab === TABS.members ? 'active' : ''
                  }`}
                  onClick={() => setState({ ...state, tab: TABS.members })}>
                  <Translation i18nkey="Member" isPlural={state.members.length > 1}>
                    Member
                  </Translation>
                </span>
              </li>
              <li className="nav-item">
                <span
                  className={classnames('nav-link cursor-pointer', {
                    active: state.tab === TABS.pending,
                  })}
                  onClick={() => setState({ ...state, tab: TABS.pending })}>
                  <Translation
                    i18nkey="pending members"
                    replacements={[(state.pendingUsers || []).length]}>
                    Pending ({(state.pendingUsers || []).length})
                  </Translation>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      {state.tab === TABS.members && (
        <PaginatedComponent
          help={() => {
            alert(
              <div className="d-flex flex-column">
                <div>
                  <i className="fas fa-shield-alt mr-1" />
                  {translateMethod('permission.caption.administrator')}
                </div>
                <div>
                  <i className="fas fa-pencil-alt mr-1" />
                  {translateMethod('permission.caption.apiEditor')}
                </div>
                <div>
                  <i className="fas fa-user-alt mr-1" />
                  {translateMethod('permission.caption.user')}
                </div>
              </div>,
              translateMethod('Permission', true)
            );
          }}
          items={_.sortBy(filteredMembers, [(member) => member.name.toLowerCase()])}
          count={15}
          formatter={(member) => {
            const isAdmin = userHavePemission(member, administrator);
            const isApiEditor = userHavePemission(member, apiEditor);
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
                    {userHavePemission(member, administrator) && (
                      <i className="fas fa-shield-alt" style={{ marginRight: '10px' }} />
                    )}
                    {userHavePemission(member, apiEditor) && (
                      <i className="fas fa-pencil-alt" style={{ marginRight: '10px' }} />
                    )}
                    <span className="team-member__name">{member.name}</span>
                  </>
                }
                actions={[
                  {
                    action: () => removeMember(member),
                    iconClass: 'fas fa-trash delete-icon',
                    tooltip: translateMethod('Remove member'),
                  },
                  {
                    action: [
                      {
                        action: () => togglePermission(member, administrator),
                        iconClass: `fas fa-shield-alt ${
                          isAdmin ? 'admin-active' : 'admin-inactive'
                        }`,
                        tooltip: `${
                          isAdmin
                            ? translateMethod('Remove administrator status')
                            : translateMethod('Add administrator status')
                        }`,
                      },
                      {
                        action: () => togglePermission(member, apiEditor),
                        iconClass: `fas fa-pencil-alt ${
                          isApiEditor ? 'admin-active' : 'admin-inactive'
                        }`,
                        tooltip: `${
                          isApiEditor
                            ? translateMethod('Remove api editor status')
                            : translateMethod('Add api editor status')
                        }`,
                      },
                    ],
                    iconClass: 'fas fa-user-cog',
                    tooltip: translateMethod('Manage permissions'),
                  },
                ]}
              />
            );
          }}
        />
      )}
      {state.tab === TABS.pending &&
        (filteredPending.length > 0 ? (
          <PaginatedComponent
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
                                .confirm(translateMethod('team_member.confirm_remove_invitation'))
                                .then((ok) => {
                                  if (ok)
                                    Services.removeInvitation(
                                      props.currentTeam._id,
                                      member._id
                                    ).then(() => updateMembers(props.currentTeam));
                                });
                            },
                            iconClass: 'fas fa-trash delete-icon',
                            tooltip: translateMethod('Remove invitation'),
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
            <Translation i18nkey="team_member.no_pending_members" />
          </div>
        ))}
    </>
  );
}

const TeamMembersComponent = (props) => {
  const { translateMethod } = useContext(I18nContext);

  return (
    <TeamBackOffice
      tab="Members"
      apiId={props.match.params.apiId}
      title={`${props.currentTeam.name} - ${translateMethod('Member', true)}`}>
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
