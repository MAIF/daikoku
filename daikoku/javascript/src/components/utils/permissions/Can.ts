import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Option } from '..';
import { setError } from '../../../core';
import { doNothing, read, manage } from './actions';
import { daikoku, api, apikey, asset, stat, team, backoffice, tenant } from './subjects';
import { permissions } from './permissions';

export const CanIDoAction = (
  user: any,
  action: any,
  what: any,
  team: any,
  apiCreationPermitted: any,
  isTenantAdmin?: any,
  whichOne?: any,
  currentTenant?: any
) => {
  if (what === tenant) {
    return (isTenantAdmin && whichOne._id === currentTenant._id) || user.isDaikokuAdmin;
  }
  // else if (what === api && !apiCreationPermitted)
  //   return false
  else {
    const realPerm = Option(team)
      .map((t: any) => t.users)
      .flatMap((users: any) => Option(users.find((u: any) => u.userId === user._id)))
      .map((userWithPermission: any) => userWithPermission.teamPermission)
      .map((ability: string) => permissions[ability])
      .flatMap((perms: any) => Option(perms.find((p: any) => p.what === what)))
      .map((perm: any) => Option(perm.condition).fold(
        () => perm.action,
        (condition: any) => condition(team) ? perm.action : doNothing
      )
      )
      .fold(
        () => doNothing,
        (perm: any) => perm
      );

    return action <= realPerm || user.isDaikokuAdmin;
  }
};

export const CanIDoActionForOneOfTeams = (user: any, action: any, what: any, teams: any, apiCreationPermitted: any) => {
  return teams.some((team: any) => CanIDoAction(user, action, what, team, apiCreationPermitted, false));
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
  apiCreationPermitted
}: { 
  I: any, 
  a: any, 
  team: any, 
  teams?: any, 
  connectedUser?: any, 
  dispatchError?: any, 
  children: any, 
  setError?: any, 
  orElse?: any, 
  isTenantAdmin?: any, 
  tenant?: any, 
  whichOne?: any,
  apiCreationPermitted?: any
}) => {
  const authorized = teams
    ? CanIDoActionForOneOfTeams(connectedUser, I, a, teams, apiCreationPermitted)
    : CanIDoAction(
      connectedUser,
      I,
      a,
      team,
      apiCreationPermitted,
      isTenantAdmin,
      whichOne,
      tenant
    );
  if (!authorized) {
    if (dispatchError) {
      setError({ error: { status: 401, message: 'unauthorized', from: 'CAN component' } });
    }
    return orElse;
  }

  return children;
};

const mapStateToProps = (state: any) => ({
  ...state.context
});
const mapDispatchToProps = {
  setError: (error: any) => setError(error),
};

export const Can = connect(mapStateToProps, mapDispatchToProps)(CanComponent);
