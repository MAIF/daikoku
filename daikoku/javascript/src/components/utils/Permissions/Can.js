import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Option } from '../';
import { setError } from '../../../core';
import { doNothing, read, manage } from './actions';
import { daikoku, api, apikey, asset, stat, team, backoffice } from './subjects';
import { permissions } from './permissions';

export const CanIDoAction = (user, action, what, team) => {
  const realPerm = Option(team)
    .flatMap(t => Option(t.users.find(u => u.userId === user._id)))
    .map(userWithPermission => userWithPermission.teamPermission)
    .map(ability => permissions[ability])
    .flatMap(perms => Option(perms.find(p => p.what === what)))
    .map(perm => Option(perm.condition).fold(() => perm.action, condition =>  condition(team) ? perm.action : doNothing))
    .fold(() => doNothing, perm => perm);
    
  return action <= realPerm || user.isDaikokuAdmin;
};

export const CanIDoActionForOneOfTeams = (user, action, what, teams) => {
  return teams.some(team => CanIDoAction(user, action, what, team))
};

const CanComponent = ({ I, a, team, teams, connectedUser, dispatchError, children, setError, orElse = null }) => {
  
  const authorized = teams ? CanIDoActionForOneOfTeams(connectedUser, I, a, teams) : CanIDoAction(connectedUser, I, a, team);

  if (!authorized) {
    if (dispatchError) {
      setError({ error: { status: 401, message: 'unauthorized', from: 'CAN component' } });
    }
    return orElse;
  }
  
  return (
    children
  );
};

const mapStateToProps = state => ({
  ...state.context
});
const mapDispatchToProps = {
  setError: error => setError(error)
};

export const Can = connect(mapStateToProps, mapDispatchToProps)(CanComponent);
CanComponent.propTypes = {
  I: PropTypes.oneOf([read, manage]).isRequired,
  a: PropTypes.oneOf([apikey, api, asset, stat, team, daikoku, backoffice]).isRequired,
  team: PropTypes.object,
  connectedUser: PropTypes.object.isRequired,
  dispatchError: PropTypes.bool,
  setError: PropTypes.func.isRequired,
  orElse: PropTypes.element
};