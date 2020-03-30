import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Option } from '../';
import { setError } from '../../../core';
import { doNothing, read, manage } from './actions';
import { daikoku, api, apikey, asset, stat, team, backoffice, tenant } from './subjects';
import { permissions } from './permissions';

export const CanIDoAction = (user, action, what, team, isTenantAdmin, whichOne, currentTenant) => {
  if (what === tenant) {
    return isTenantAdmin && whichOne._id === currentTenant._id || user.isDaikokuAdmin
  }

  const realPerm = Option(team)
    .map(t => t.users)
    .flatMap(users => Option(users.find(u => u.userId === user._id)))
    .map(userWithPermission => userWithPermission.teamPermission)
    .map(ability => permissions[ability])
    .flatMap(perms => Option(perms.find(p => p.what === what)))
    .map(perm =>
      Option(perm.condition).fold(
        () => perm.action,
        condition => (condition(team) ? perm.action : doNothing)
      )
    )
    .fold(
      () => doNothing,
      perm => perm
    );

  return action <= realPerm || user.isDaikokuAdmin;
};

export const CanIDoActionForOneOfTeams = (user, action, what, teams) => {
  return teams.some(team => CanIDoAction(user, action, what, team, false));
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
  whichOne = tenant
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

const mapStateToProps = state => ({
  ...state.context,
});
const mapDispatchToProps = {
  setError: error => setError(error),
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
  isTenantAdmin: PropTypes.bool
};
