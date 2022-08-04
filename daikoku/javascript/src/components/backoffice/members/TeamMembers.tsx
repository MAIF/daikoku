import React, { useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { connect } from 'react-redux';
import sortBy from 'lodash/sortBy';
import { toastr } from 'react-redux-toastr';
import classnames from 'classnames';

import * as Services from '../../../services';
import { openInvitationTeamModal, updateTeamPromise, I18nContext } from '../../../core';
import { useTeamBackOffice } from '../../../contexts';
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

export const TeamMembersSimpleComponent = (props: any) => {
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

  const updateMembers = (team: any) => {
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

  const isAdmin = (user: any) => {
    if (!props.currentTeam) {
      return false;
    }

    if (user.isDaikokuAdmin) {
      return true;
    }

    return Option(props.currentTeam.users.find((u: any) => u.userId === user._id))
      .map((user: any) => user.teamPermission)
      .fold(
        () => false,
        (perm: any) => perm === administrator
      );
  };

  const userHavePemission = (user: any, permission: any) => {
    return Option(props.currentTeam.users.find((u: any) => u.userId === user._id))
      .map((user: any) => user.teamPermission)
      .fold(
        () => false,
        (perm: any) => perm === permission
      );
  };

  const removeMember = (member: any) => {
    if (
      isAdmin(member) &&
      props.currentTeam.users.filter((u: any) => u.teamPermission === administrator).length === 1
    ) {
      alert(
        translateMethod(
          'remove.member.alert',
          false,
          "You can't delete this user, it must remain an admin in a team."
        )
      );
    } else {
      (window
    .confirm(translateMethod('remove.member.confirm', false, 'Are you sure you want to remove this member from the team ?')) as any).then((ok: any) => {
    if (ok) {
        const teamId = props.currentTeam._id;
        Services.removeMemberFromTeam(teamId, member._id).then(({ done, team }) => {
            done
                ? toastr.success('Success', translateMethod('remove.member.success', false, `${member.name} is no longer member of your team`, member.name))
                : toastr.error('Failure');
            props.updateTeam(team).then(() => updateMembers(props.currentTeam));
        });
    }
});
    }
  };

  const _addMember = (member: any) => {
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

  const addLdapUserToTeam = (email: any) => {
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

  const togglePermission = (member: any, permission: any) => {
    if (isAdmin(props.connectedUser)) {
      const teamId = props.currentTeam._id;
      if (
        userHavePemission(member, administrator) &&
        props.currentTeam.users.filter((u: any) => u.teamPermission === administrator).length === 1
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

  const searchLdapMember = (email: any) => {
    return new Promise((resolve) => {
      Services.searchLdapMember(props.currentTeam._id, email)
        .then((hasMember) => {
          if (hasMember.error) resolve({ error: hasMember.error });
          else resolve({ done: true });
        })
        .catch((error) => resolve(error));
    });
  };

  const invitUser = (email: any) => {
    if (props.tenant && props.tenant.authProvider === 'LDAP') addLdapUserToTeam(email);
    else
      Services.addUncheckedMembersToTeam(props.currentTeam._id, email).then(() =>
        updateMembers(props.currentTeam)
      );
  };

  if (props.currentTeam.type === 'Personal') {
        return <Navigate to="/settings/me" />;
  }

  if (!(state as any).members) {
    return null;
  }

  const filteredMembers = (state as any).search
    ? (state as any).members.filter(({ name, email }: any) => [name, email].some((value) => value.toLowerCase().includes((state as any).search)))
    : (state as any).members;

  const filteredPending = (state as any).search
    ? state.pendingUsers.filter(({ name, email }) => [name, email].some((value) => (value as any).toLowerCase().includes((state as any).search)))
    : state.pendingUsers;
    return <>
        <div className="container-fluid" style={{ position: 'relative' }}>
            <button className="btn btn-success" type="button" onClick={() => {
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
                            <span className={`nav-link cursor-pointer ${state.tab === TABS.members ? 'active' : ''}`} onClick={() => setState({ ...state, tab: TABS.members })}>
                                <Translation i18nkey="Member" isPlural={(state as any).members.length > 1}>
                  Member
                </Translation>
              </span>
            </li>
                        <li className="nav-item">
                            <span className={classnames('nav-link cursor-pointer', {
        active: state.tab === TABS.pending,
    })} onClick={() => setState({ ...state, tab: TABS.pending })}>
                                <Translation i18nkey="pending members" replacements={[(state.pendingUsers || []).length]}>
                  Pending ({(state.pendingUsers || []).length})
                </Translation>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
        {state.tab === TABS.members && (<PaginatedComponent help={() => {
                        alert(<div className="d-flex flex-column">
                            <div>
                                <i className="fas fa-shield-alt me-1"/>
                {translateMethod('permission.caption.administrator')}
              </div>
                            <div>
                                <i className="fas fa-pencil-alt me-1"/>
                {translateMethod('permission.caption.apiEditor')}
              </div>
                            <div>
                                <i className="fas fa-user-alt me-1"/>
                {translateMethod('permission.caption.user')}
              </div>
                        </div>, translateMethod('Permission', true));
        }} items={sortBy(filteredMembers, [(member) => member.name.toLowerCase()])} count={15} formatter={(member) => {
            const isAdmin = userHavePemission(member, administrator);
            const isApiEditor = userHavePemission(member, apiEditor);
            if (member.isPending) {
                                return (<AvatarWithAction key={member._id} avatar={member.picture} infos={<>
                                        <i className="fas fa-question me-2"/>
                                        <span className="team-member__name">{member.name}</span>
                  </>} actions={[]}/>);
            }
                        return (<AvatarWithAction key={member._id} avatar={member.picture} infos={<>
                                    {userHavePemission(member, administrator) && (<i className="fas fa-shield-alt" style={{ marginRight: '10px' }}/>)}
                                    {userHavePemission(member, apiEditor) && (<i className="fas fa-pencil-alt" style={{ marginRight: '10px' }}/>)}
                                    <span className="team-member__name">{member.name}</span>
                </>} actions={[
                    {
                        action: () => removeMember(member),
                        iconClass: 'fas fa-trash delete-icon',
                        tooltip: translateMethod('Remove member'),
                    },
                    {
                        action: [
                            {
                                action: () => togglePermission(member, administrator),
                                iconClass: `fas fa-shield-alt ${isAdmin ? 'admin-active' : 'admin-inactive'}`,
                                tooltip: `${isAdmin
                                    ? translateMethod('Remove administrator status')
                                    : translateMethod('Add administrator status')}`,
                            },
                            {
                                action: () => togglePermission(member, apiEditor),
                                iconClass: `fas fa-pencil-alt ${isApiEditor ? 'admin-active' : 'admin-inactive'}`,
                                tooltip: `${isApiEditor
                                    ? translateMethod('Remove api editor status')
                                    : translateMethod('Add api editor status')}`,
                            },
                        ],
                        iconClass: 'fas fa-user-cog',
                        tooltip: translateMethod('Manage permissions'),
                    },
                ]}/>);
        }}/>)}
    {state.tab === TABS.pending &&
        (filteredPending.length > 0 ?           (<PaginatedComponent items={sortBy(filteredPending, [(member) => (member as any).name.toLowerCase()])} count={15} formatter={(member) => {
                const invitedUser = member.name === 'invited user';
                                return (<AvatarWithAction key={member._id} avatar={member.picture} infos={<span className="team-member__name">
                    {invitedUser ? member.email : member.name}
                  </span>} actions={invitedUser
                        ? [
                            {
                                action: () => {
                                    window
                                        .confirm(translateMethod('team_member.confirm_remove_invitation'))
                                                                                .then((ok: any) => {
                                        if (ok)
                                            Services.removeInvitation(props.currentTeam._id, member._id).then(() => updateMembers(props.currentTeam));
                                    });
                                },
                                iconClass: 'fas fa-trash delete-icon',
                                tooltip: translateMethod('Remove invitation'),
                            },
                        ]
                        : []}/>);
            }}/>) :               (<div className="p-3">
                    <Translation i18nkey="team_member.no_pending_members"/>
        </div>))}
  </>;
                            (window
    .confirm(translateMethod('team_member.confirm_remove_invitation')) as any).then((ok: any) => {
    if (ok)
                Services.removeInvitation(props.currentTeam._id, member._id).then(() => updateMembers(props.currentTeam));
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
  </>;
};

const TeamMembersComponent = (props: any) => {
  useTeamBackOffice(props.currentTeam);
    const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    document.title = `${props.currentTeam.name} - ${translateMethod('Member', true)}`;
  }, []);

  return (
        <Can I={manage} a={team} team={props.currentTeam} dispatchError={true}>
            <TeamMembersSimpleComponent {...props} />
    </Can>
  );
};

const mapStateToProps = (state: any) => ({
  ...state.context
});

const mapDispatchToProps = {
  updateTeam: (team: any) => updateTeamPromise(team),
  openInvitationModal: (modalProps: any) => openInvitationTeamModal(modalProps),
};

export const TeamMembers = connect(mapStateToProps, mapDispatchToProps)(TeamMembersComponent);
