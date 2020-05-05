import { IMPERSONATE, LOGIN, LOGOUT, UPDATE_NOTIFS, UPDATE_TEAM, UPDATE_LANGUAGE, UPDATE_TENANT } from './';

export const login = ({ user, team, tenant, language }) => dispatch => {
  return dispatch({
    type: LOGIN,
    user,
    team,
    tenant,
    language,
  });
};

export const logout = () => dispatch => {
  return dispatch({
    type: LOGOUT,
  });
};

export const impersonate = ({ impersonator }) => dispatch => {
  return dispatch({
    type: IMPERSONATE,
    impersonator,
  });
};

export const updateTeam = team => dispatch => {
  return dispatch({
    type: UPDATE_TEAM,
    team,
  });
};

export const updateTeamPromise = team => dispatch => {
  return Promise.resolve(
    dispatch({
      type: UPDATE_TEAM,
      team,
    })
  );
};

export const updateNotications = unreadNotificationsCount => dispatch => {
  return dispatch({
    type: UPDATE_NOTIFS,
    unreadNotificationsCount,
  });
};

export const udpateLanguage = language => dispatch => {
  return dispatch({
    type: UPDATE_LANGUAGE,
    language,
  });
};

export const updateTenant = tenant => dispatch => {
  return dispatch({
    type: UPDATE_TENANT,
    tenant
  });
};
