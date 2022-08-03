import React, { useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { connect } from 'react-redux';
import sortBy from 'lodash/sortBy';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
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

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  useEffect(() => {
    updateMembers(props.currentTeam);
  }, []);

  const updateMembers = (team: any) => {
    Promise.all([Services.members(team._id), Services.pendingMembers(team._id)]).then(
      ([members, res]) => {
        setState({
          ...state,
          // @ts-expect-error TS(2345): Argument of type '{ members: any; pendingUsers: an... Remove this comment to see the full error message
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <>
    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    <div className="container-fluid" style={{ position: 'relative' }}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col mt-3 onglets">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ul className="nav nav-tabs flex-column flex-sm-row">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <li className="nav-item">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className={`nav-link cursor-pointer ${state.tab === TABS.members ? 'active' : ''}`} onClick={() => setState({ ...state, tab: TABS.members })}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="Member" isPlural={(state as any).members.length > 1}>
                  Member
                </Translation>
              </span>
            </li>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <li className="nav-item">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className={classnames('nav-link cursor-pointer', {
        active: state.tab === TABS.pending,
    })} onClick={() => setState({ ...state, tab: TABS.pending })}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="pending members" replacements={[(state.pendingUsers || []).length]}>
                  Pending ({(state.pendingUsers || []).length})
                </Translation>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    {state.tab === TABS.members && (<PaginatedComponent help={() => {
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            alert(<div className="d-flex flex-column">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-shield-alt me-1"/>
                {translateMethod('permission.caption.administrator')}
              </div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-pencil-alt me-1"/>
                {translateMethod('permission.caption.apiEditor')}
              </div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-user-alt me-1"/>
                {translateMethod('permission.caption.user')}
              </div>
            {/* @ts-expect-error TS(2554): Expected 0-1 arguments, but got 2. */}
            </div>, translateMethod('Permission', true));
        }} items={sortBy(filteredMembers, [(member) => member.name.toLowerCase()])} count={15} formatter={(member) => {
            const isAdmin = userHavePemission(member, administrator);
            const isApiEditor = userHavePemission(member, apiEditor);
            if (member.isPending) {
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<AvatarWithAction key={member._id} avatar={member.picture} infos={<>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-question me-2"/>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span className="team-member__name">{member.name}</span>
                  </>} actions={[]}/>);
            }
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            return (<AvatarWithAction key={member._id} avatar={member.picture} infos={<>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  {userHavePemission(member, administrator) && (<i className="fas fa-shield-alt" style={{ marginRight: '10px' }}/>)}
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  {userHavePemission(member, apiEditor) && (<i className="fas fa-pencil-alt" style={{ marginRight: '10px' }}/>)}
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
        (filteredPending.length > 0 ? // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          (<PaginatedComponent items={sortBy(filteredPending, [(member) => (member as any).name.toLowerCase()])} count={15} formatter={(member) => {
                const invitedUser = member.name === 'invited user';
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<AvatarWithAction key={member._id} avatar={member.picture} infos={<span className="team-member__name">
                    {invitedUser ? member.email : member.name}
                  </span>} actions={invitedUser
                        ? [
                            {
                                action: () => {
                                    window
                                        .confirm(translateMethod('team_member.confirm_remove_invitation'))
                                        // @ts-expect-error TS(2339): Property 'then' does not exist on type 'boolean'.
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
            }}/>) : // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              (<div className="p-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="team_member.no_pending_members"/>
        </div>))}
  </>;
                            (window
    .confirm(translateMethod('team_member.confirm_remove_invitation')) as any).then((ok: any) => {
    if (ok)
        // @ts-expect-error TS(2304): Cannot find name 'member'.
        Services.removeInvitation(props.currentTeam._id, member._id).then(() => updateMembers(props.currentTeam));
});
                          },
                          iconClass: 'fas fa-trash delete-icon',
                          // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
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
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="p-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="team_member.no_pending_members" />
        </div>
      ))}
  </>;
};

const TeamMembersComponent = (props: any) => {
  useTeamBackOffice(props.currentTeam);
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    document.title = `${props.currentTeam.name} - ${translateMethod('Member', true)}`;
  }, []);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Can I={manage} a={team} team={props.currentTeam} dispatchError={true}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
