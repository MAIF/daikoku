import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Option } from '..';
import { setError } from '../../../core';
import { doNothing, read, manage } from './actions';
import { daikoku, api, apikey, asset, stat, team, backoffice, tenant } from './subjects';
import { permissions, TPermission, TPermissions } from './permissions';
import { ITeamSimple, IUserSimple, TeamPermission, TeamUser } from '../../../types';

export const CanIDoAction = (
  user: IUserSimple,
  action: number,
  what: string,
  team: ITeamSimple,
  isTenantAdmin?: boolean,
  whichOne?: any,
  currentTenant?: any
) => {
  if (what === tenant) {
    return (isTenantAdmin && whichOne._id === currentTenant._id) || user.isDaikokuAdmin;
  }
  // else if (what === api && !apiCreationPermitted)
  //   return false
  else {
    Option(isTenantAdmin).map((x) => x);

    const realPerm: number = Option(team)
      .map((t: ITeamSimple) => t.users)
      .flatMap((users: TeamUser[]) => Option(users.find((u) => u.userId === user._id)))
      .map((userWithPermission: TeamUser) => userWithPermission.teamPermission)
      .map((ability: TeamPermission) => permissions[ability])
      .flatMap((perms: TPermissions) => Option(perms.find((p: any) => p.what === what)))
      .map((perm: TPermission) =>
        Option(perm.condition).fold(
          () => perm.action,
          (condition: (t: ITeamSimple) => boolean) => (condition(team) ? perm.action : doNothing)
        )
      )
      .fold(
        () => doNothing,
        (perm: number) => perm
      );

    return action <= realPerm || user.isDaikokuAdmin;
  }
};

export const CanIDoActionForOneOfTeams = (user: any, action: any, what: any, teams: any) => {
  return teams.some((team: any) => CanIDoAction(user, action, what, team, false));
};

const CanComponent = ({
  I,
  a,
  team,
  teams,
  connectedUser,
  dispatchError,
  children,
  setError,
  orElse = null,
  isTenantAdmin,
  tenant,
  whichOne = tenant,
  apiCreationPermitted,
}: {
  I: any;
  a: any;
  team?: any;
  teams?: any;
  connectedUser?: any;
  dispatchError?: any;
  children: any;
  setError?: any;
  orElse?: any;
  isTenantAdmin?: any;
  tenant?: any;
  whichOne?: any;
  apiCreationPermitted?: any;
}) => {
  const authorized = teams
    ? CanIDoActionForOneOfTeams(connectedUser, I, a, teams)
    : CanIDoAction(connectedUser, I, a, team, isTenantAdmin, whichOne, tenant);
  if (!authorized) {
    if (dispatchError) {
      setError({ error: { status: 401, message: 'unauthorized', from: 'CAN component' } });
    }
    return orElse;
  }

  return children;
};

const mapStateToProps = (state: any) => ({
  ...state.context,
});
const mapDispatchToProps = {
  setError: (error: any) => setError(error),
};

export const Can = connect(mapStateToProps, mapDispatchToProps)(CanComponent);
