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
  isTenantAdmin: any,
  whichOne: any,
  currentTenant: any
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
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      .map((ability: any) => permissions[ability])
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
  // @ts-expect-error TS(2554): Expected 8 arguments, but got 6.
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
}: any) => {
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
CanComponent.propTypes = {
  I: PropTypes.oneOf([read, manage]).isRequired,
  a: PropTypes.oneOf([apikey, api, asset, stat, team, daikoku, backoffice, tenant]).isRequired,
  team: PropTypes.object,
  whichOne: PropTypes.object,
  connectedUser: PropTypes.object.isRequired,
  dispatchError: PropTypes.bool,
  setError: PropTypes.func.isRequired,
  orElse: PropTypes.element,
  isTenantAdmin: PropTypes.bool,
  apiCreationPermitted: PropTypes.bool,
};
