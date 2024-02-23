import classnames from 'classnames';
import sortBy from 'lodash/sortBy';
import { useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';

import { I18nContext, ModalContext, useTeamBackOffice } from '../../../contexts';
import * as Services from '../../../services';
import {
  AvatarWithAction,
  Can,
  Option,
  PaginatedComponent,
  Spinner,
  administrator,
  apiEditor,
  manage,
  team, user
} from '../../utils';

import { GlobalContext } from '../../../contexts/globalContext';
import { ITeamSimple, IUserSimple, ResponseError, TeamPermission, TeamUser, isError } from '../../../types';

type Tabs = 'MEMBERS' | 'PENDING'
const TABS: { [key: string]: Tabs } = {
  members: 'MEMBERS',
  pending: 'PENDING',
};

type TState = {
  pendingUsers: Array<IUserSimple>,
  selectedMember?: IUserSimple,
  loading: boolean,
  tab: Tabs,
  members?: Array<IUserSimple>
  search?: string
}
export const TeamMembersSimpleComponent = ({ currentTeam, reloadCurrentTeam }) => {

  const { tenant, connectedUser, reloadContext } = useContext(GlobalContext);

  const [state, setState] = useState<TState>({
    pendingUsers: [],
    selectedMember: undefined,
    loading: true,
    tab: TABS.members
  });

  const { translate, Translation } = useContext(I18nContext);
  const { alert, openInvitationTeamModal, confirm } = useContext(ModalContext);

  useEffect(() => {
    updateMembers(currentTeam);
  }, [currentTeam]);

  const updateMembers = (team: ITeamSimple) => {
    return Promise.all([
      Services.members(team._id),
      Services.pendingMembers(team._id)])
      .then(([members, res]) => {
        setState({
          ...state,
          members,
          pendingUsers: res.pendingUsers,
          loading: false,
        });
      }
      );
  };

  const isAdmin = (user: IUserSimple) => {
    if (!currentTeam) {
      return false;
    }

    if (user.isDaikokuAdmin) {
      return true;
    }

    return Option(currentTeam.users.find((u) => u.userId === user._id))
      .map((user: TeamUser) => user.teamPermission)
      .fold(
        () => false,
        (perm: TeamPermission) => perm === administrator
      );
  };

  const userHavePemission = (user: IUserSimple, permission: TeamPermission) => {
    return Option(currentTeam.users.find((u) => u.userId === user._id))
      .map((user: TeamUser) => user.teamPermission)
      .fold(
        () => false,
        (perm: TeamPermission) => perm === permission
      );
  };

  const removeMember = (member: IUserSimple) => {
    if (
      isAdmin(member) &&
      currentTeam.users.filter((u) => u.teamPermission === administrator).length === 1
    ) {
      alert({ message: translate('remove.member.alert') });
    } else {
      (confirm({ message: translate('remove.member.confirm') }))//@ts-ignore
        .then((ok: boolean) => {
          if (ok) {
            const teamId = currentTeam._id;
            Services.removeMemberFromTeam(teamId, member._id)
              .then(({ done, team }) => {
                done
                  ? toast.success(translate({ key: 'remove.member.success', replacements: [member.name] }))
                  : toast.error(translate('Failure'));
              })
              .then(() => reloadCurrentTeam());
          }
        });
    }
  };

  const _addMember = (member: ITeamSimple) => {
    const teamId = currentTeam._id;
    return Services.addMembersToTeam(teamId, [member._id])
      .then(({ done }) => {
        setState({ ...state, selectedMember: undefined });
        done
          ? toast.success(translate({ key: 'member.now.invited', replacements: [member.name] }))
          : toast.error(translate('Failure'));
      })
      .then(() => updateMembers(currentTeam));
  };

  const addLdapUserToTeam = (email: string): Promise<any> => {
    return Services.findUserByEmail(currentTeam._id, email)
      .then((optUser) => {
        if (optUser.error) {
          return Services.createUserFromLDAP(currentTeam._id, email)
            .then((createdUser) => _addMember(createdUser));
        } else {
          const user = optUser;
          return _addMember(user);
        }
      });
  };

  const togglePermission = (member: IUserSimple, permission: TeamPermission) => {
    if (isAdmin(connectedUser)) {
      const teamId = currentTeam._id;
      if (
        userHavePemission(member, administrator) &&
        currentTeam.users.filter((u) => u.teamPermission === administrator).length === 1
      ) {
        alert({ message: translate('remove.admin.alert') });
      } else {
        const newPermission = userHavePemission(member, permission) ? user : permission;
        Services.updateTeamMemberPermission(teamId, [member._id], newPermission)
          .then(({ done }) => {
            done
              ? toast.success(translate({ key: 'member.new.permission.success', replacements: [member.name, newPermission] }))
              : toast.error(translate('Failure'));
          })
          .then(reloadCurrentTeam)
      }
    } else {
      alert({ message: translate('not.admin.alert') });
    }
  };

  const searchLdapMember = (email: string): Promise<ResponseError | any> => {
    return new Promise((resolve) => {
      Services.searchLdapMember(currentTeam._id, email)
        .then((hasMember) => {
          if (hasMember.error) {
            resolve({ error: hasMember.error });
          } else {
            resolve({ done: true });
          }
        })
        .catch((error) => resolve(error));
    });
  };

  const invitUser = (email: string): Promise<any> => {
    if (tenant && tenant.authProvider === 'LDAP') {
      return addLdapUserToTeam(email.toLocaleLowerCase());
    } else {
      return Services.addUncheckedMembersToTeam(currentTeam._id, email.toLocaleLowerCase())
        .then(() => updateMembers(currentTeam));
    }
  };

  if (currentTeam.type === 'Personal') {
    return <Navigate to="/settings/me" />;
  }

  if (!state.members) {
    return null;
  }

  const filteredMembers = state.search
    ? state.members.filter(({ name, email }: { name: string, email: string }) => [name, email].some((value) => value.toLowerCase().includes(state.search || '')))
    : state.members;

  const filteredPending = state.search
    ? state.pendingUsers.filter(({ name, email }: { name: string, email: string }) => [name, email].some((value) => value.toLowerCase().includes(state.search || '')))
    : state.pendingUsers;
  return <>
    <div className="container-fluid" style={{ position: 'relative' }}>
      <button className="btn btn-success" type="button" onClick={() => {
        openInvitationTeamModal({
          team: currentTeam,
          searchLdapMember: searchLdapMember,
          members: filteredMembers,
          invitUser: invitUser,
          pendingUsers: filteredPending,
        });
      }}>
        {translate('team_member.invit_user')}
      </button>
      <div className="row">
        <div className="col mt-3 onglets">
          <ul className="nav nav-tabs flex-column flex-sm-row">
            <li className="nav-item">
              <span className={`nav-link cursor-pointer ${state.tab === TABS.members ? 'active' : ''}`} onClick={() => setState({ ...state, tab: TABS.members })}>
                <Translation i18nkey="Member" isPlural={state.members.length > 1}>
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

      alert({
        message: <div className="d-flex flex-column">
          <div>
            <i className="fas fa-shield-alt me-1" />
            {translate('permission.caption.administrator')}
          </div>
          <div>
            <i className="fas fa-pencil-alt me-1" />
            {translate('permission.caption.apiEditor')}
          </div>
          <div>
            <i className="fas fa-user-alt me-1" />
            {translate('permission.caption.user')}
          </div>
          {/* @ts-ignore */}
        </div>, title: translate({ key: 'Permission', plural: true })
      });
    }} items={sortBy(filteredMembers, [(member) => member.name.toLowerCase()])} count={15} formatter={(member) => {
      const isAdmin = userHavePemission(member, administrator);
      const isApiEditor = userHavePemission(member, apiEditor);
      if (member.isPending) {
        return (<AvatarWithAction key={member._id} avatar={member.picture} infos={<>
          <i className="fas fa-question me-2" />
          <span className="team-member__name">{member.name}</span>
        </>} actions={[]} />);
      }
      return (<AvatarWithAction key={member._id} avatar={member.picture} infos={<>
        {userHavePemission(member, administrator) && (<i className="fas fa-shield-alt" style={{ marginRight: '10px' }} />)}
        {userHavePemission(member, apiEditor) && (<i className="fas fa-pencil-alt" style={{ marginRight: '10px' }} />)}
        <span className="team-member__name">{member.name}</span>
      </>} actions={[
        {
          action: () => removeMember(member),
          iconClass: 'fas fa-trash delete-icon',
          tooltip: translate('Remove member'),
        },
        {
          action: [
            {
              action: () => togglePermission(member, administrator),
              iconClass: `fas fa-shield-alt ${isAdmin ? 'admin-active' : 'admin-inactive'}`,
              tooltip: `${isAdmin
                ? translate('Remove administrator status')
                : translate('Add administrator status')}`,
            },
            {
              action: () => togglePermission(member, apiEditor),
              iconClass: `fas fa-pencil-alt ${isApiEditor ? 'admin-active' : 'admin-inactive'}`,
              tooltip: `${isApiEditor
                ? translate('Remove api editor status')
                : translate('Add api editor status')}`,
            },
          ],
          iconClass: 'fas fa-user-cog',
          tooltip: translate('Manage permissions'),
        },
      ]} />);
    }} />)}
    {state.tab === TABS.pending &&
      (filteredPending.length > 0 ? (<PaginatedComponent items={sortBy(filteredPending, [(member) => member.name.toLowerCase()])} count={15} formatter={(member) => {
        const invitedUser = member.name === 'invited user';
        return (<AvatarWithAction key={member._id} avatar={member.picture} infos={<span className="team-member__name">
          {invitedUser ? member.email : member.name}
        </span>} actions={invitedUser
          ? [
            {
              action: () => {
                confirm({ message: translate('team_member.confirm_remove_invitation') })
                  //@ts-ignore
                  .then((ok: boolean) => {
                    if (ok)
                      Services.removeInvitation(currentTeam._id, member._id)
                        .then(() => updateMembers(currentTeam));
                  });
              },
              iconClass: 'fas fa-trash delete-icon',
              tooltip: translate('Remove invitation'),
            },
          ]
          : []} />);
      }} />) : (<div className="p-3">
        <Translation i18nkey="team_member.no_pending_members" />
      </div>))}
  </>;
};


export const TeamMembers = () => {
  const { isLoading, currentTeam, error, reloadCurrentTeam } = useTeamBackOffice()

  const { translate } = useContext(I18nContext);

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ${translate({ key: 'Member', plural: true })}`;
  }, [currentTeam]);


  if (isLoading) {
    return <Spinner />
  } else if (currentTeam && !isError(currentTeam)) {
    return (
      <Can I={manage} a={team} team={currentTeam} dispatchError={true}>
        <TeamMembersSimpleComponent currentTeam={currentTeam} reloadCurrentTeam={reloadCurrentTeam}/>
      </Can>
    );
  } else {
    toast.error(error?.message || currentTeam?.error)
    return <></>;
  }


};
